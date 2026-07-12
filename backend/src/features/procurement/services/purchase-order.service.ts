import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from '../dto/purchase-order.dto';
import { POStatus, Prisma, RoleName } from '@prisma/client';
import { createPaginationResponse } from '../../../common/pagination/pagination.helper';
import { AuditService } from '../../../common/audit/audit.service';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class PurchaseOrderService {
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

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const code = await this.generatePOCode();
    const po = await this.prisma.purchaseOrder.create({
      data: {
        code,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        businessId: dto.businessId,
        expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : null,
        notes: dto.notes,
        paymentTerms: dto.paymentTerms,
        deliveryTerms: dto.deliveryTerms,
        currency: dto.currency || 'VND',
        status: POStatus.DRAFT,
        items: {
          create: dto.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: { items: true },
    });

    this.auditLogService.logEvent({
      action: 'CREATE_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS',
      reason: 'Khởi tạo đơn mua hàng'
    });

    return po;
  }

  async getPurchaseOrders(query: any, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const { 
      page = 1, limit = 50, search, status, 
      supplierId, warehouseId, buyerId, productId,
      startDate, endDate,
      sort = 'createdAt', order = 'desc' 
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      ...(businessId ? { businessId } : {}),
      ...(status ? { status: status as POStatus } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(buyerId ? { approvedById: buyerId } : {}), // Mapping buyer to approver for now
      ...(productId ? { items: { some: { productId } } } : {}),
      ...(startDate && endDate ? {
        orderDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sort]: order },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          warehouse: { select: { id: true, name: true } },
          items: true,
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return createPaginationResponse(items, total, Number(page), Number(limit));
  }

  async getPurchaseOrderById(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        approvedBy: { select: { id: true, fullName: true, email: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
        receipts: { include: { receivedBy: { select: { id: true, fullName: true } } } },
      },
    });

    if (!po || (businessId && po.businessId !== businessId)) {
      throw new NotFoundException('Không tìm thấy đơn mua hàng');
    }
    return po;
  }

  // State Machine Workflow
  async submitPurchaseOrder(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    if (po.status !== POStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể trình duyệt đơn ở trạng thái DRAFT');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.SUBMITTED, submittedAt: new Date() },
    });

    this.auditLogService.logEvent({
      action: 'SUBMIT_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  async requestRevision(id: string, reason: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    if (po.status !== POStatus.SUBMITTED) {
      throw new BadRequestException('Chỉ có thể yêu cầu sửa đổi khi đơn ở trạng thái SUBMITTED');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { 
        status: POStatus.DRAFT,
        notes: po.notes ? `${po.notes}\n[Yêu cầu sửa đổi]: ${reason}` : `[Yêu cầu sửa đổi]: ${reason}`
      },
    });

    this.auditLogService.logEvent({
      action: 'REQUEST_REVISION_PO',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS',
      reason
    });
    return updated;
  }

  async approvePurchaseOrder(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    if (po.status !== POStatus.SUBMITTED) {
      throw new BadRequestException('Đơn mua hàng phải ở trạng thái SUBMITTED để duyệt');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.APPROVED, approvedAt: new Date(), approvedById: user.id },
    });

    this.auditLogService.logEvent({
      action: 'APPROVE_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  async orderPurchaseOrder(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    if (po.status !== POStatus.APPROVED) {
      throw new BadRequestException('Đơn mua hàng phải được APPROVED trước khi chuyển sang ORDERED');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.ORDERED },
    });

    this.auditLogService.logEvent({
      action: 'ORDER_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  async markAsReceiving(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    if (po.status !== POStatus.ORDERED && po.status !== POStatus.PARTIALLY_RECEIVED) {
      throw new BadRequestException('Trạng thái không hợp lệ để nhận hàng');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.RECEIVING },
    });

    this.auditLogService.logEvent({
      action: 'RECEIVING_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  async markCompleted(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.COMPLETED },
    });

    this.auditLogService.logEvent({
      action: 'COMPLETE_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  async markClosed(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    
    if (po.status !== POStatus.COMPLETED && po.status !== POStatus.CANCELLED) {
      throw new BadRequestException('Chỉ có thể đóng PO khi đã hoàn thành hoặc hủy');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.CLOSED },
    });

    this.auditLogService.logEvent({
      action: 'CLOSE_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  async cancelPurchaseOrder(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const po = await this.getPurchaseOrderById(id, user);
    if (po.status === POStatus.COMPLETED || po.status === POStatus.CLOSED) {
      throw new BadRequestException('Không thể hủy đơn đã hoàn thành hoặc đã đóng');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.CANCELLED },
    });

    this.auditLogService.logEvent({
      action: 'CANCEL_PURCHASE_ORDER',
      userId: user.id,
      role: user.role,
      businessId: businessId,
      entity: 'PURCHASE_ORDER',
      entityId: po.id,
      result: 'SUCCESS'
    });
    return updated;
  }

  private async generatePOCode(): Promise<string> {
    const count = await this.prisma.purchaseOrder.count();
    return `PO-${(count + 1).toString().padStart(6, '0')}`;
  }
}
