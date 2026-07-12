import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiveGoodsDto } from '../dto/goods-receipt.dto';
import { POStatus, MovementType, Prisma, RoleName } from '@prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { createPaginationResponse } from '../../../common/pagination/pagination.helper';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditService
  ) {}

  private async getBusinessIdForUser(user: RequestUser): Promise<string | undefined> {
    if (user.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({ where: { userId: user.id } });
      return business?.id;
    }
    return undefined;
  }

  async receiveGoods(dto: ReceiveGoodsDto, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { items: true, supplier: true, warehouse: true },
    });

    if (!po || (businessId && po.businessId !== businessId)) {
      throw new NotFoundException('Không tìm thấy đơn mua hàng');
    }

    if (po.status !== POStatus.ORDERED && po.status !== POStatus.PARTIALLY_RECEIVED && po.status !== POStatus.RECEIVING) {
      throw new BadRequestException('Chỉ có thể nhập kho cho đơn hàng ở trạng thái ORDERED, RECEIVING hoặc PARTIALLY_RECEIVED');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Generate GR Code
      const count = await tx.goodsReceipt.count();
      const code = `GR-${(count + 1).toString().padStart(6, '0')}`;

      // 2. Create Goods Receipt
      const receipt = await tx.goodsReceipt.create({
        data: {
          code,
          purchaseOrderId: po.id,
          warehouseId: po.warehouseId,
          businessId: po.businessId,
          receivedById: user.id,
          notes: dto.notes,
        },
      });

      let allItemsFullyReceived = true;

      // Fetch RECEIVING stage for BatchJourney
      const receivedStage = await tx.supplyChainStage.findFirst({ where: { name: 'RECEIVED' } });

      // 3. Process each received item
      for (const itemDto of dto.items) {
        const poItem = po.items.find(i => i.productId === itemDto.productId);
        if (!poItem) throw new BadRequestException(`Sản phẩm ${itemDto.productId} không thuộc đơn hàng này`);

        if (itemDto.quantity <= 0) {
          throw new BadRequestException(`Số lượng nhận phải lớn hơn 0`);
        }

        // Prevent duplicate/over-receiving
        if (poItem.receivedQuantity + itemDto.quantity > poItem.quantity) {
          throw new BadRequestException(`Số lượng nhận (${itemDto.quantity}) vượt quá số lượng còn lại cần nhận (${poItem.quantity - poItem.receivedQuantity})`);
        }

        // Check inventory exists
        let inventory = await tx.inventory.findUnique({
          where: { warehouseId_productId: { warehouseId: po.warehouseId, productId: itemDto.productId } },
          include: { product: true }
        });

        if (!inventory) {
          inventory = await tx.inventory.create({
            data: {
              warehouseId: po.warehouseId,
              productId: itemDto.productId,
              currentQuantity: 0,
            },
            include: { product: true }
          });
        }

        // Net quantity accepted into stock
        const netQuantity = itemDto.quantity - (itemDto.rejectedQuantity + itemDto.damagedQuantity);
        
        let batchId: string | null = null;

        if (netQuantity > 0) {
          // Generate batch
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const productCode = inventory.product.name.substring(0, 5).toUpperCase().replace(/\s/g, '');
          const existingCount = await tx.inventoryBatch.count({ where: { inventoryId: inventory.id } });
          const seq = String(existingCount + 1).padStart(3, '0');
          const batchNumber = `${today}-${productCode}-${seq}`;

          const batch = await tx.inventoryBatch.create({
            data: {
              inventoryId: inventory.id,
              batchNumber,
              quantity: netQuantity,
              initialQuantity: netQuantity,
              supplier: po.supplier.name,
              expiryDate: itemDto.expiryDate ? new Date(itemDto.expiryDate) : null,
            },
          });
          batchId = batch.id;

          // Update inventory
          const beforeQty = inventory.currentQuantity;
          const afterQty = beforeQty + netQuantity;

          await tx.inventory.update({
            where: { id: inventory.id },
            data: { currentQuantity: afterQty },
          });

          // Stock movement
          await tx.stockMovement.create({
            data: {
              inventoryId: inventory.id,
              batchId,
              movementType: MovementType.IN,
              quantity: netQuantity,
              beforeQuantity: beforeQty,
              afterQuantity: afterQty,
              referenceType: 'GOODS_RECEIPT',
              referenceId: receipt.id,
              note: `Nhập kho từ đơn mua hàng ${po.code}`,
              createdById: user.id,
            },
          });

          // Supply Chain Journey
          if (receivedStage) {
            await tx.batchJourney.create({
              data: {
                batchId,
                stageId: receivedStage.id,
                location: po.warehouse.name,
                actorId: user.id,
                actorName: user.fullName,
                note: `Nhập kho từ đơn mua hàng ${po.code}`
              }
            });
          }
        }

        // Create GR Item
        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: receipt.id,
            productId: itemDto.productId,
            batchId,
            quantity: itemDto.quantity,
            rejectedQuantity: itemDto.rejectedQuantity,
            damagedQuantity: itemDto.damagedQuantity,
            qualityStatus: itemDto.qualityStatus,
            rejectionReason: itemDto.rejectionReason,
            expiryDate: itemDto.expiryDate ? new Date(itemDto.expiryDate) : null,
          },
        });

        // Update PO Item received quantity
        const newReceivedQty = poItem.receivedQuantity + itemDto.quantity;
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: newReceivedQty },
        });

        if (newReceivedQty < poItem.quantity) {
          allItemsFullyReceived = false;
        }
      }

      // Update PO status
      const newStatus = allItemsFullyReceived ? POStatus.COMPLETED : POStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newStatus },
      });

      this.auditLogService.logEvent({
        action: 'CREATE_GOODS_RECEIPT',
        userId: user.id,
        role: user.role,
        businessId: businessId,
        entity: 'GOODS_RECEIPT',
        entityId: receipt.id,
        result: 'SUCCESS',
        reason: `Nhập kho đơn ${po.code}`
      });

      return receipt;
    });
  }

  async getGoodsReceipts(query: any, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const { page = 1, limit = 50, search, sort = 'createdAt', order = 'desc' } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.GoodsReceiptWhereInput = {
      ...(businessId ? { businessId } : {}),
      ...(search ? { code: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          purchaseOrder: { select: { code: true } },
          warehouse: { select: { name: true } },
          receivedBy: { select: { fullName: true } },
        },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return createPaginationResponse(items, total, Number(page), Number(limit));
  }

  async getGoodsReceiptById(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        purchaseOrder: { select: { code: true, supplier: true } },
        warehouse: true,
        receivedBy: { select: { fullName: true } },
        items: {
          include: {
            product: { select: { name: true } },
            batch: { select: { batchNumber: true } },
          },
        },
      },
    });

    if (!receipt || (businessId && receipt.businessId !== businessId)) {
      throw new NotFoundException('Không tìm thấy phiếu nhập kho');
    }
    return receipt;
  }
}
