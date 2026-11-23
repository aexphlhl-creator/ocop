import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import {
  BatchLifecycleStatus,
  BatchStatus,
  BlockchainRecordStatus,
  Prisma,
  QualityStatus,
  RoleName,
  SupplyChainStageName,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { lotRequestFingerprint } from './lot-request';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';
import { BlockchainQueueService } from '../blockchain-queue/blockchain-queue.service';
import { BlockchainJobType } from '../blockchain-queue/blockchain.queue';
import {
  CreateProductionBatchDto,
  IdempotentLotActionDto,
  InspectProductionBatchDto,
  PutAwayProductionBatchDto,
  ReceiveProductionBatchDto,
} from './dto/production-batch.dto';

@Injectable()
export class SupplyChainService {
  private readonly logger = new Logger(SupplyChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainQueueService: BlockchainQueueService,
  ) {}

  private getBatchScope(
    currentUser: RequestUser,
  ): Prisma.InventoryBatchWhereInput {
    if (currentUser.role === RoleName.SELLER) {
      return {
        inventory: {
          product: { sellerId: currentUser.id },
        },
      };
    }
    if (currentUser.role === RoleName.WAREHOUSE_MANAGER) {
      return {
        inventory: { warehouse: { managerId: currentUser.id } },
      };
    }
    if (currentUser.role === RoleName.LOGISTICS) return { id: '__forbidden__' };
    return {};
  }

  private assertBatchAccess(
    batch: {
      inventory: {
        product: { sellerId: string };
        warehouse: { managerId: string | null };
      };
    },
    currentUser: RequestUser,
    message: string,
  ) {
    if (
      currentUser.role === RoleName.SELLER &&
      batch.inventory.product.sellerId !== currentUser.id
    ) {
      throw new ForbiddenException(message);
    }
    if (
      currentUser.role === RoleName.WAREHOUSE_MANAGER &&
      batch.inventory.warehouse.managerId !== currentUser.id
    ) {
      throw new ForbiddenException(message);
    }
    if (currentUser.role === RoleName.LOGISTICS) {
      throw new ForbiddenException(message);
    }
  }

  private assertStagePermission(
    stageName: SupplyChainStageName,
    role: RoleName,
  ) {
    if (
      (
        [
          SupplyChainStageName.HANDOVER_TO_CARRIER,
          SupplyChainStageName.SHIPPING,
          SupplyChainStageName.DISTRIBUTOR,
          SupplyChainStageName.RETAIL,
          SupplyChainStageName.CUSTOMER,
        ] as SupplyChainStageName[]
      ).includes(stageName)
    ) {
      throw new BadRequestException(
        'Công đoạn vận chuyển theo batch đã ngừng sử dụng. Hãy thao tác trong Quản lý chuyến hàng.',
      );
    }
    let permitted = false;
    switch (stageName) {
      case SupplyChainStageName.HARVEST:
      case SupplyChainStageName.PROCESSING:
      case SupplyChainStageName.PACKAGING:
        permitted = role === RoleName.SELLER;
        break;
      case SupplyChainStageName.RECEIVED:
      case SupplyChainStageName.QUALITY_INSPECTION:
      case SupplyChainStageName.WAREHOUSE:
        throw new BadRequestException(
          'Công đoạn này chỉ được ghi qua thao tác lifecycle chuyên biệt để bảo đảm phân quyền và tồn kho',
        );
    }

    if (!permitted) {
      throw new ForbiddenException(
        role === RoleName.ADMIN
          ? 'Admin chỉ giám sát và không được trực tiếp ghi nhận công đoạn'
          : 'Vai trò của bạn không được phép ghi nhận công đoạn này',
      );
    }
  }

  private parseLotEventTime(value?: string) {
    const eventTime = value ? new Date(value) : new Date();
    if (Number.isNaN(eventTime.getTime())) {
      throw new BadRequestException('Thời điểm nghiệp vụ không hợp lệ');
    }
    if (eventTime.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException(
        'Thời điểm nghiệp vụ không được ở tương lai',
      );
    }
    return eventTime;
  }

  private requireEvidence(
    dto: Pick<IdempotentLotActionDto, 'imageUrls' | 'attachmentUrls'>,
    actionName: string,
  ) {
    if (
      (dto.imageUrls?.length ?? 0) + (dto.attachmentUrls?.length ?? 0) ===
      0
    ) {
      throw new BadRequestException(
        `${actionName} phải có ít nhất một ảnh hoặc tài liệu minh chứng`,
      );
    }
  }

  private async getLockedLifecycleBatch(
    tx: Prisma.TransactionClient,
    batchId: string,
  ) {
    // Consistent with checkout: lock the inventory before its batches.
    const target = await tx.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { inventoryId: true },
    });
    if (!target) throw new NotFoundException('Lô hàng không tồn tại');
    await tx.$queryRaw`
      SELECT "id" FROM "inventories" WHERE "id" = ${target.inventoryId}::uuid FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM "inventory_batches"
      WHERE "id" = ${batchId}::uuid FOR UPDATE
    `;
    const batch = await tx.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        inventory: { include: { product: true, warehouse: true } },
        journeys: { include: { stage: true }, orderBy: { eventTime: 'asc' } },
        originDeclarations: {
          orderBy: { revision: 'desc' },
          take: 1,
          include: { party: true, location: true },
        },
        lifecycleEvents: { orderBy: { eventTime: 'asc' } },
      },
    });
    if (!batch) throw new NotFoundException('Lô hàng không tồn tại');
    return batch;
  }

  private assertSellerOwnsBatch(
    batch: {
      inventory: {
        product: { sellerId: string };
        warehouse: { sellerId: string | null };
      };
    },
    currentUser: RequestUser,
  ) {
    if (
      currentUser.role !== RoleName.SELLER ||
      batch.inventory.product.sellerId !== currentUser.id ||
      batch.inventory.warehouse.sellerId !== currentUser.id
    ) {
      throw new ForbiddenException('Seller không sở hữu lô hàng này');
    }
  }

  private assertWarehouseManagerOwnsBatch(
    batch: { inventory: { warehouse: { managerId: string | null } } },
    currentUser: RequestUser,
  ) {
    if (
      currentUser.role !== RoleName.WAREHOUSE_MANAGER ||
      batch.inventory.warehouse.managerId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Warehouse Manager không được phân công quản lý kho của lô này',
      );
    }
  }

  private isLifecycleReplay(
    events: Array<{
      idempotencyKey: string;
      action: string;
      actorId: string;
      metadata: unknown;
    }>,
    dto: IdempotentLotActionDto,
    action: string,
    actorId: string,
  ) {
    const previous = events.find(
      (event) => event.idempotencyKey === dto.idempotencyKey.trim(),
    );
    if (!previous) return false;
    const metadata = previous.metadata as {
      requestFingerprint?: string;
    } | null;
    if (
      previous.action !== action ||
      previous.actorId !== actorId ||
      metadata?.requestFingerprint !== lotRequestFingerprint(dto)
    ) {
      throw new BadRequestException(
        'Idempotency key đã được dùng cho thao tác hoặc nội dung khác',
      );
    }
    return true;
  }

  private assertQualityAssurance(user: RequestUser) {
    if (user.role !== RoleName.QUALITY_ASSURANCE) {
      throw new ForbiddenException(
        'Chỉ QA độc lập được kiểm định và phát hành lô',
      );
    }
  }

  private async assertVerifiedOrigin(
    tx: Prisma.TransactionClient,
    batch: {
      id: string;
      parentBatchId?: string | null;
      inventory: { productId: string; product: { sellerId: string } };
      originDeclarations: Array<{
        party: { isVerified: boolean };
        location: { isVerified: boolean };
      }>;
    },
  ) {
    let origin = batch.originDeclarations[0];
    let parentId = batch.parentBatchId;
    const visited = new Set([batch.id]);
    while (!origin && parentId) {
      if (visited.has(parentId) || visited.size > 100)
        throw new BadRequestException('Phả hệ lô không hợp lệ');
      visited.add(parentId);
      const parent = await tx.inventoryBatch.findUnique({
        where: { id: parentId },
        include: {
          inventory: { include: { product: true } },
          originDeclarations: {
            orderBy: { revision: 'desc' },
            take: 1,
            include: { party: true, location: true },
          },
        },
      });
      if (
        !parent ||
        parent.inventory.productId !== batch.inventory.productId ||
        parent.inventory.product.sellerId !== batch.inventory.product.sellerId
      ) {
        throw new BadRequestException(
          'Lô nguồn không thuộc cùng sản phẩm/Seller',
        );
      }
      origin = parent.originDeclarations[0];
      parentId = parent.parentBatchId;
    }
    if (!origin?.party.isVerified || !origin.location.isVerified) {
      throw new BadRequestException(
        'Nguồn gốc lô chưa được xác minh; bổ sung hồ sơ trước khi đạt QA',
      );
    }
  }

  private async createLifecycleEvent(
    tx: Prisma.TransactionClient,
    batchId: string,
    dto: IdempotentLotActionDto,
    actorId: string,
    transition: {
      action: string;
      fromStatus: BatchLifecycleStatus | null;
      toStatus: BatchLifecycleStatus;
      eventTime: Date;
      metadata?: Prisma.InputJsonObject;
    },
  ) {
    const latest = await tx.batchLifecycleEvent.findFirst({
      where: { batchId },
      orderBy: [{ eventTime: 'desc' }, { createdAt: 'desc' }],
      select: { eventTime: true },
    });
    if (latest && transition.eventTime < latest.eventTime) {
      throw new BadRequestException(
        'Thời điểm chuyển trạng thái không được trước sự kiện lifecycle gần nhất',
      );
    }
    const latestJourney = await tx.batchJourney.findFirst({
      where: { batchId },
      orderBy: { eventTime: 'desc' },
      select: { eventTime: true },
    });
    if (latestJourney && transition.eventTime < latestJourney.eventTime) {
      throw new BadRequestException(
        'Thời điểm chuyển trạng thái không được trước công đoạn gần nhất',
      );
    }
    return tx.batchLifecycleEvent.create({
      data: {
        batchId,
        idempotencyKey: dto.idempotencyKey.trim(),
        action: transition.action,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        actorId,
        eventTime: transition.eventTime,
        location: dto.location?.trim() || null,
        note: dto.note?.trim() || null,
        imageUrls: dto.imageUrls ?? [],
        attachmentUrls: dto.attachmentUrls ?? [],
        metadata: {
          ...transition.metadata,
          requestFingerprint: lotRequestFingerprint(dto),
          referenceCode: dto.referenceCode?.trim() || null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
        },
      },
    });
  }

  private async createOperationalJourney(
    tx: Prisma.TransactionClient,
    batch: {
      id: string;
      batchNumber: string;
      inventoryId: string;
      inventory: { productId: string; product: { name: string } };
    },
    stageName: SupplyChainStageName,
    dto: IdempotentLotActionDto & { qualityStatus?: QualityStatus },
    currentUser: RequestUser,
    eventTime: Date,
    ipAddress?: string,
  ) {
    const stage = await tx.supplyChainStage.findUnique({
      where: { name: stageName },
    });
    if (!stage) {
      throw new BadRequestException(
        `Hệ thống chưa cấu hình công đoạn ${stageName}`,
      );
    }
    const payload: Prisma.InputJsonObject = {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      productId: batch.inventory.productId,
      productName: batch.inventory.product.name,
      stageName,
      location: dto.location?.trim() || '',
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      actorName: currentUser.fullName?.trim() || currentUser.email,
      eventTime: eventTime.toISOString(),
      referenceCode: dto.referenceCode?.trim() || null,
      qualityStatus: dto.qualityStatus ?? null,
      imageUrls: dto.imageUrls ?? [],
      attachmentUrls: dto.attachmentUrls ?? [],
      createdBy: currentUser.id,
    };
    const journey = await tx.batchJourney.create({
      data: {
        batchId: batch.id,
        stageId: stage.id,
        location: dto.location?.trim() || batch.inventory.product.name,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        actorId: currentUser.id,
        actorName: currentUser.fullName?.trim() || currentUser.email,
        note: dto.note?.trim() || null,
        eventTime,
        referenceCode: dto.referenceCode?.trim() || null,
        imageUrls: dto.imageUrls ?? [],
        attachmentUrls: dto.attachmentUrls ?? [],
        ipAddress: ipAddress ?? null,
        blockchainPayload: payload,
      },
      include: { stage: true },
    });

    const outboxRecord = await this.blockchainQueueService.createOutboxRecord(
      tx,
      {
        productId: batch.inventory.productId,
        batchId: batch.id,
        journeyId: journey.id,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: payload,
      },
    );

    return { ...journey, outboxRecordId: outboxRecord.id };
  }

  private async enqueueLifecycleJourney(
    journey: {
      id: string;
      blockchainPayload: unknown;
      outboxRecordId?: string;
    } | null,
    inventoryId: string,
    batchId: string,
    actorId: string,
  ) {
    if (!journey) return;
    try {
      const inventory = await this.prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { productId: true },
      });
      if (!inventory) return;

      if (journey.outboxRecordId) {
        await this.blockchainQueueService.enqueueOutboxRecord(
          journey.outboxRecordId,
          {
            type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
            journeyId: journey.id,
            productId: inventory.productId,
            batchId,
            payload:
              (journey.blockchainPayload as unknown as Prisma.InputJsonObject) ?? {},
            actorId,
          },
        );
      } else {
        await this.blockchainQueueService.addSupplyChainRecordJob({
          journeyId: journey.id,
          productId: inventory.productId,
          batchId,
          payload: journey.blockchainPayload ?? {},
          actorId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Không enqueue được journey ${journey.id}; bản ghi gốc vẫn được lưu để retry`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // ── Stages ────────────────────────────────────────────────────────────────

  /**
   * Lấy tất cả công đoạn chuỗi cung ứng (lookup table)
   */
  async getStages() {
    return this.prisma.supplyChainStage.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async createProductionBatch(
    dto: CreateProductionBatchDto,
    currentUser: RequestUser,
  ) {
    if (currentUser.role !== RoleName.SELLER) {
      throw new ForbiddenException('Chỉ Seller được khai báo lô sản xuất');
    }
    const idempotencyKey = dto.idempotencyKey.trim();
    const existing = await this.prisma.inventoryBatch.findFirst({
      where: {
        declaredById: currentUser.id,
        declarationIdempotencyKey: idempotencyKey,
      },
      include: { lifecycleEvents: { where: { action: 'DECLARED' }, take: 1 } },
    });
    if (existing) {
      if (
        (
          existing.lifecycleEvents[0]?.metadata as {
            requestFingerprint?: string;
          } | null
        )?.requestFingerprint !== lotRequestFingerprint(dto)
      ) {
        throw new BadRequestException(
          'Idempotency key đã được dùng với một nội dung khai báo lô khác',
        );
      }
      return existing;
    }

    const inventory = await this.prisma.inventory.findUnique({
      where: { id: dto.inventoryId },
      include: {
        warehouse: true,
        product: {
          include: {
            seller: { include: { sellerProfile: true, role: true } },
          },
        },
      },
    });
    if (!inventory) throw new NotFoundException('Không tìm thấy inventory');
    if (
      inventory.product.sellerId !== currentUser.id ||
      inventory.warehouse.sellerId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Seller chỉ được khai báo lô cho sản phẩm và kho thuộc chính mình',
      );
    }
    if (
      inventory.product.status !== 'APPROVED' ||
      !inventory.product.seller.isActive ||
      !inventory.product.seller.sellerProfile?.isVerified
    ) {
      throw new BadRequestException(
        'Sản phẩm phải được duyệt và hồ sơ Seller phải được xác minh',
      );
    }
    if (!inventory.warehouse.isActive) {
      throw new BadRequestException('Kho đích không hoạt động');
    }

    const harvestDate = dto.harvestDate ? new Date(dto.harvestDate) : null;
    const manufactureDate = dto.manufactureDate
      ? new Date(dto.manufactureDate)
      : null;
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;
    const productionDate = manufactureDate ?? harvestDate;
    if (!productionDate) {
      throw new BadRequestException(
        'Khai báo lô phải có ngày thu hoạch hoặc ngày sản xuất',
      );
    }
    if (productionDate.getTime() > Date.now()) {
      throw new BadRequestException(
        'Ngày sản xuất/thu hoạch không được ở tương lai',
      );
    }
    if (expiryDate && expiryDate <= productionDate) {
      throw new BadRequestException(
        'Hạn sử dụng phải sau ngày sản xuất/thu hoạch',
      );
    }

    const generatedNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${inventory.product.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const batchNumber = dto.batchNumber?.trim() || generatedNumber;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const batch = await tx.inventoryBatch.create({
          data: {
            inventoryId: inventory.id,
            batchNumber,
            quantity: 0,
            initialQuantity: 0,
            declaredQuantity: dto.declaredQuantity,
            lifecycleStatus: BatchLifecycleStatus.DRAFT,
            status: BatchStatus.ACTIVE,
            qualityStatus: QualityStatus.PENDING_CHECK,
            declaredById: currentUser.id,
            declarationIdempotencyKey: idempotencyKey,
            supplier: dto.supplier?.trim() || null,
            harvestDate,
            manufactureDate,
            expiryDate,
            warehouseLocation: dto.warehouseLocation?.trim() || null,
          },
        });
        await tx.batchLifecycleEvent.create({
          data: {
            batchId: batch.id,
            idempotencyKey,
            action: 'DECLARED',
            fromStatus: null,
            toStatus: BatchLifecycleStatus.DRAFT,
            actorId: currentUser.id,
            eventTime: new Date(),
            note: 'Seller khai báo hồ sơ lô; chưa ghi tăng tồn kho',
            imageUrls: [],
            attachmentUrls: [],
            metadata: {
              declaredQuantity: dto.declaredQuantity,
              requestFingerprint: lotRequestFingerprint(dto),
            },
          },
        });
        return batch;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.inventoryBatch.findFirst({
          where: {
            declaredById: currentUser.id,
            declarationIdempotencyKey: idempotencyKey,
          },
          include: {
            lifecycleEvents: { where: { action: 'DECLARED' }, take: 1 },
          },
        });
        if (
          winner &&
          (
            winner.lifecycleEvents[0]?.metadata as {
              requestFingerprint?: string;
            } | null
          )?.requestFingerprint === lotRequestFingerprint(dto)
        ) {
          return winner;
        }
        throw new BadRequestException(
          'Mã lô hoặc idempotency key đã được dùng cho nội dung khác',
        );
      }
      throw error;
    }
  }

  async submitProductionBatch(
    batchId: string,
    dto: IdempotentLotActionDto,
    currentUser: RequestUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await this.getLockedLifecycleBatch(tx, batchId);
      this.assertSellerOwnsBatch(batch, currentUser);
      const duplicate = this.isLifecycleReplay(
        batch.lifecycleEvents,
        dto,
        'SUBMITTED',
        currentUser.id,
      );
      if (duplicate) return batch;
      if (batch.lifecycleStatus !== BatchLifecycleStatus.DRAFT) {
        throw new BadRequestException('Chỉ lô DRAFT mới được gửi tiếp nhận');
      }
      const origin = batch.originDeclarations[0];
      if (!origin?.party.isVerified || !origin.location.isVerified) {
        throw new BadRequestException(
          'Phải có khai báo nguồn gốc với chủ thể và địa điểm đã xác minh',
        );
      }
      const recordedStages = new Set(
        batch.journeys.map((item) => item.stage.name),
      );
      for (const required of [
        SupplyChainStageName.HARVEST,
        SupplyChainStageName.PROCESSING,
        SupplyChainStageName.PACKAGING,
      ]) {
        if (!recordedStages.has(required)) {
          throw new BadRequestException(
            `Hồ sơ lô chưa có công đoạn bắt buộc: ${required}`,
          );
        }
      }
      const eventTime = this.parseLotEventTime(dto.eventTime);
      const updated = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: {
          lifecycleStatus: BatchLifecycleStatus.SUBMITTED,
          submittedAt: eventTime,
        },
      });
      await this.createLifecycleEvent(tx, batchId, dto, currentUser.id, {
        action: 'SUBMITTED',
        fromStatus: BatchLifecycleStatus.DRAFT,
        toStatus: BatchLifecycleStatus.SUBMITTED,
        eventTime,
      });
      return updated;
    });
  }

  async receiveProductionBatch(
    batchId: string,
    dto: ReceiveProductionBatchDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await this.getLockedLifecycleBatch(tx, batchId);
      this.assertWarehouseManagerOwnsBatch(batch, currentUser);
      const duplicate = this.isLifecycleReplay(
        batch.lifecycleEvents,
        dto,
        'RECEIVED',
        currentUser.id,
      );
      if (duplicate) return { batch, journey: null };
      if (batch.lifecycleStatus !== BatchLifecycleStatus.SUBMITTED) {
        throw new BadRequestException('Chỉ lô SUBMITTED mới được tiếp nhận');
      }
      if (dto.receivedQuantity > batch.declaredQuantity) {
        throw new BadRequestException(
          'Số lượng nhận không được vượt số lượng Seller đã khai báo',
        );
      }
      this.requireEvidence(dto, 'Tiếp nhận lô');
      if (!dto.referenceCode?.trim() || !dto.location?.trim()) {
        throw new BadRequestException(
          'Tiếp nhận phải có mã biên bản và địa điểm thực tế',
        );
      }
      const eventTime = this.parseLotEventTime(dto.eventTime);
      const beforeQuantity = batch.inventory.currentQuantity;
      const updated = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: {
          quantity: dto.receivedQuantity,
          initialQuantity: dto.receivedQuantity,
          receivedDate: eventTime,
          actualReceivedAt: eventTime,
          lifecycleStatus: BatchLifecycleStatus.QUARANTINED,
          qualityStatus: QualityStatus.QUARANTINE,
        },
      });
      await tx.inventory.update({
        where: { id: batch.inventoryId },
        data: { currentQuantity: { increment: dto.receivedQuantity } },
      });
      await tx.stockMovement.create({
        data: {
          inventoryId: batch.inventoryId,
          batchId,
          movementType: 'IN',
          quantity: dto.receivedQuantity,
          beforeQuantity,
          afterQuantity: beforeQuantity + dto.receivedQuantity,
          referenceId: dto.referenceCode.trim(),
          referenceType: 'LOT_RECEIPT',
          note: dto.note?.trim() || null,
          createdById: currentUser.id,
        },
      });
      const journey = await this.createOperationalJourney(
        tx,
        batch,
        SupplyChainStageName.RECEIVED,
        dto,
        currentUser,
        eventTime,
        ipAddress,
      );
      await this.createLifecycleEvent(tx, batchId, dto, currentUser.id, {
        action: 'RECEIVED',
        fromStatus: BatchLifecycleStatus.SUBMITTED,
        toStatus: BatchLifecycleStatus.QUARANTINED,
        eventTime,
        metadata: {
          declaredQuantity: batch.declaredQuantity,
          receivedQuantity: dto.receivedQuantity,
        },
      });
      return { batch: updated, journey };
    });
    void this.enqueueLifecycleJourney(
      result.journey,
      result.batch.inventoryId,
      batchId,
      currentUser.id,
    );
    return result;
  }

  async inspectProductionBatch(
    batchId: string,
    dto: InspectProductionBatchDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    this.assertQualityAssurance(currentUser);
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await this.getLockedLifecycleBatch(tx, batchId);
      const duplicate = this.isLifecycleReplay(
        batch.lifecycleEvents,
        dto,
        'INSPECTED',
        currentUser.id,
      );
      if (duplicate) return { batch, journey: null };
      if (batch.lifecycleStatus !== BatchLifecycleStatus.QUARANTINED) {
        throw new BadRequestException('Chỉ lô đang cách ly mới được kiểm định');
      }
      if (
        dto.qualityStatus !== QualityStatus.PASSED &&
        dto.qualityStatus !== QualityStatus.FAILED
      ) {
        throw new BadRequestException(
          'Kết quả kiểm định chỉ có thể là PASSED hoặc FAILED',
        );
      }
      this.requireEvidence(dto, 'Kiểm định chất lượng');
      if (dto.qualityStatus === QualityStatus.PASSED)
        await this.assertVerifiedOrigin(tx, batch);
      if (
        !dto.note?.trim() ||
        !dto.referenceCode?.trim() ||
        !dto.location?.trim()
      ) {
        throw new BadRequestException(
          'Kiểm định phải có kết luận, mã phiếu và địa điểm kiểm định',
        );
      }
      const eventTime = this.parseLotEventTime(dto.eventTime);
      const target =
        dto.qualityStatus === QualityStatus.PASSED
          ? BatchLifecycleStatus.QC_PASSED
          : BatchLifecycleStatus.REJECTED;
      const updated = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: {
          qualityStatus: dto.qualityStatus,
          lifecycleStatus: target,
          inspectedAt: eventTime,
          rejectedAt:
            target === BatchLifecycleStatus.REJECTED ? eventTime : null,
        },
      });
      const journey = await this.createOperationalJourney(
        tx,
        batch,
        SupplyChainStageName.QUALITY_INSPECTION,
        dto,
        currentUser,
        eventTime,
        ipAddress,
      );
      await this.createLifecycleEvent(tx, batchId, dto, currentUser.id, {
        action: 'INSPECTED',
        fromStatus: BatchLifecycleStatus.QUARANTINED,
        toStatus: target,
        eventTime,
        metadata: { qualityStatus: dto.qualityStatus },
      });
      return { batch: updated, journey };
    });
    void this.enqueueLifecycleJourney(
      result.journey,
      result.batch.inventoryId,
      batchId,
      currentUser.id,
    );
    return result;
  }

  async putAwayProductionBatch(
    batchId: string,
    dto: PutAwayProductionBatchDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await this.getLockedLifecycleBatch(tx, batchId);
      this.assertWarehouseManagerOwnsBatch(batch, currentUser);
      const duplicate = this.isLifecycleReplay(
        batch.lifecycleEvents,
        dto,
        'PUT_AWAY',
        currentUser.id,
      );
      if (duplicate) return { batch, journey: null };
      if (batch.lifecycleStatus !== BatchLifecycleStatus.QC_PASSED) {
        throw new BadRequestException(
          'Chỉ lô đã đạt QC mới được đưa vào vị trí lưu trữ',
        );
      }
      if (!dto.warehouseLocation.trim() || !dto.location?.trim()) {
        throw new BadRequestException(
          'Phải nhập vị trí lưu trữ và địa điểm thực tế',
        );
      }
      if (batch.lifecycleEvents.some((item) => item.action === 'PUT_AWAY')) {
        throw new BadRequestException('Lô đã được xác nhận nhập vị trí kho');
      }
      const eventTime = this.parseLotEventTime(dto.eventTime);
      const updated = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { warehouseLocation: dto.warehouseLocation.trim() },
      });
      const journey = await this.createOperationalJourney(
        tx,
        batch,
        SupplyChainStageName.WAREHOUSE,
        dto,
        currentUser,
        eventTime,
        ipAddress,
      );
      await this.createLifecycleEvent(tx, batchId, dto, currentUser.id, {
        action: 'PUT_AWAY',
        fromStatus: BatchLifecycleStatus.QC_PASSED,
        toStatus: BatchLifecycleStatus.QC_PASSED,
        eventTime,
        metadata: { warehouseLocation: dto.warehouseLocation.trim() },
      });
      return { batch: updated, journey };
    });
    void this.enqueueLifecycleJourney(
      result.journey,
      result.batch.inventoryId,
      batchId,
      currentUser.id,
    );
    return result;
  }

  async releaseProductionBatch(
    batchId: string,
    dto: IdempotentLotActionDto,
    currentUser: RequestUser,
  ) {
    this.assertQualityAssurance(currentUser);
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await this.getLockedLifecycleBatch(tx, batchId);
      const duplicate = this.isLifecycleReplay(
        batch.lifecycleEvents,
        dto,
        'RELEASED',
        currentUser.id,
      );
      if (duplicate) {
        return {
          batch,
          outboxRecordId: null,
          productId: batch.inventory.productId,
          releasePayload: null,
        };
      }
      if (
        batch.lifecycleStatus !== BatchLifecycleStatus.QC_PASSED ||
        batch.qualityStatus !== QualityStatus.PASSED
      ) {
        throw new BadRequestException(
          'Lô phải đạt kiểm định trước khi phát hành',
        );
      }
      if (!batch.lifecycleEvents.some((item) => item.action === 'PUT_AWAY')) {
        throw new BadRequestException(
          'Warehouse Manager chưa xác nhận vị trí lưu trữ',
        );
      }
      await this.assertVerifiedOrigin(tx, batch);
      if (
        batch.status !== BatchStatus.ACTIVE ||
        batch.quantity <= 0 ||
        (batch.expiryDate && batch.expiryDate <= new Date())
      ) {
        throw new BadRequestException(
          'Không được phát hành lô hết hạn, hết hàng hoặc ngừng hoạt động',
        );
      }
      if (!dto.note?.trim() || !dto.referenceCode?.trim()) {
        throw new BadRequestException(
          'Phát hành lô phải có kết luận và mã phiếu',
        );
      }
      const eventTime = this.parseLotEventTime(dto.eventTime);
      const updated = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: {
          lifecycleStatus: BatchLifecycleStatus.RELEASED,
          releasedAt: eventTime,
        },
      });
      await this.createLifecycleEvent(tx, batchId, dto, currentUser.id, {
        action: 'RELEASED',
        fromStatus: BatchLifecycleStatus.QC_PASSED,
        toStatus: BatchLifecycleStatus.RELEASED,
        eventTime,
      });

      const releasePayload = {
        action: 'BATCH_RELEASED',
        batchId,
        batchNumber: batch.batchNumber,
        productId: batch.inventory.productId,
        releasedAt: eventTime.toISOString(),
        referenceCode: dto.referenceCode.trim(),
        releasedBy: currentUser.id,
      };

      const outboxRecord = await this.blockchainQueueService.createOutboxRecord(
        tx,
        {
          productId: batch.inventory.productId,
          batchId,
          journeyId: null,
          action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
          data: releasePayload,
        },
      );

      return {
        batch: updated,
        outboxRecordId: outboxRecord.id,
        productId: batch.inventory.productId,
        releasePayload,
      };
    });

    if (result.outboxRecordId && result.releasePayload) {
      void this.blockchainQueueService.enqueueOutboxRecord(
        result.outboxRecordId,
        {
          type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
          journeyId: null,
          productId: result.productId,
          batchId,
          payload: result.releasePayload,
          actorId: currentUser.id,
        },
      );
    }

    return result.batch;
  }

  async getBatches(currentUser: RequestUser) {
    return this.prisma.inventoryBatch.findMany({
      where: this.getBatchScope(currentUser),
      include: {
        inventory: {
          include: {
            product: {
              include: {
                seller: { include: { sellerProfile: true } },
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            warehouse: true,
          },
        },
        journeys: {
          take: 1,
          orderBy: [{ eventTime: 'desc' }, { createdAt: 'desc' }],
          include: { stage: true },
        },
        originDeclarations: {
          take: 1,
          orderBy: { revision: 'desc' },
          include: {
            party: { select: { code: true, name: true, isVerified: true } },
            location: {
              select: { code: true, name: true, isVerified: true },
            },
          },
        },
        shipmentItems: {
          include: {
            shipment: {
              include: {
                carrierOrganization: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Batch Journey ─────────────────────────────────────────────────────────

  /**
   * Lấy chi tiết một batch + toàn bộ timeline journey (sắp xếp theo thời gian)
   */
  async getBatchJourney(batchId: string, currentUser: RequestUser) {
    const batch = await this.prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        lifecycleEvents: {
          orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
          include: { actor: { select: { id: true, fullName: true } } },
        },
        parentBatch: { select: { id: true, batchNumber: true } },
        inventory: {
          include: {
            product: {
              include: {
                seller: { include: { sellerProfile: true } },
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            warehouse: true,
          },
        },
        journeys: {
          include: {
            stage: true,
            actor: {
              select: { id: true, fullName: true, email: true },
            },
          },
          orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
        },
        originDeclarations: {
          orderBy: { revision: 'desc' },
          include: {
            party: true,
            location: true,
            declaredBy: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
        inputMaterialLinks: {
          orderBy: { createdAt: 'asc' },
          include: {
            inputBatch: {
              include: {
                inventory: { include: { product: true, warehouse: true } },
                originDeclarations: {
                  orderBy: { revision: 'desc' },
                  take: 1,
                  include: { party: true, location: true },
                },
              },
            },
          },
        },
        outputMaterialLinks: {
          orderBy: { createdAt: 'asc' },
          include: {
            outputBatch: {
              include: { inventory: { include: { product: true } } },
            },
          },
        },
        shipmentItems: {
          include: {
            shipment: {
              include: {
                carrierOrganization: true,
                events: {
                  orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
                  include: {
                    actor: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch không tồn tại: ${batchId}`);
    }

    this.assertBatchAccess(
      batch,
      currentUser,
      'Bạn không có quyền xem batch này',
    );

    const blockchainRecords = await this.prisma.blockchainRecord.findMany({
      where: {
        journeyId: { in: batch.journeys.map((journey) => journey.id) },
      },
      select: {
        journeyId: true,
        status: true,
        transactionHash: true,
        explorerUrl: true,
        confirmedAt: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const recordByJourney = new Map(
      blockchainRecords.map((record) => [record.journeyId, record]),
    );
    const journeys = batch.journeys.map((journey) => ({
      ...journey,
      blockchainRecord: recordByJourney.get(journey.id) ?? null,
    }));
    const blockchainSynced =
      journeys.length > 0 &&
      journeys.every(
        (journey) =>
          journey.blockchainRecord?.status === BlockchainRecordStatus.CONFIRMED,
      );

    return {
      ...batch,
      journeys,
      blockchainSynced,
      blockchainConfirmedCount: journeys.filter(
        (journey) =>
          journey.blockchainRecord?.status === BlockchainRecordStatus.CONFIRMED,
      ).length,
    };
  }

  /**
   * Thêm một bước mới vào timeline của batch (append-only, không cho sửa/xóa)
   */
  async addJourney(
    batchId: string,
    dto: CreateJourneyDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    if (currentUser.role === RoleName.ADMIN) {
      throw new ForbiddenException(
        'Admin chỉ giám sát và không được trực tiếp ghi nhận công đoạn',
      );
    }
    if (dto.actorId && dto.actorId !== currentUser.id) {
      throw new BadRequestException(
        'Không được ghi nhận hành trình dưới danh tính người dùng khác',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "inventory_batches"
        WHERE "id" = ${batchId}::uuid
        FOR UPDATE
      `;

      const batch = await tx.inventoryBatch.findUnique({
        where: { id: batchId },
        include: {
          inventory: {
            include: {
              product: {
                include: { seller: { include: { sellerProfile: true } } },
              },
              warehouse: true,
            },
          },
          shipmentItems: {
            include: {
              shipment: {
                include: { carrierOrganization: true },
              },
            },
          },
        },
      });
      if (!batch) {
        throw new NotFoundException(`Batch không tồn tại: ${batchId}`);
      }

      this.assertBatchAccess(
        batch,
        currentUser,
        'Bạn không có quyền thêm hành trình cho batch này',
      );
      if (batch.lifecycleStatus !== BatchLifecycleStatus.DRAFT) {
        throw new BadRequestException(
          'Chỉ lô DRAFT mới được Seller bổ sung công đoạn sản xuất; các bước tiếp nhận/QC/kho dùng thao tác lifecycle chuyên biệt',
        );
      }

      const stage = await tx.supplyChainStage.findUnique({
        where: { id: dto.stageId },
      });
      if (!stage) {
        throw new NotFoundException(`Stage không tồn tại: ${dto.stageId}`);
      }
      this.assertStagePermission(stage.name, currentUser.role);

      const recordedActorName =
        currentUser.fullName?.trim() || currentUser.email;

      const eventTime = dto.eventTime ? new Date(dto.eventTime) : new Date();
      if (eventTime.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new BadRequestException(
          'Thời điểm công đoạn không được nằm trong tương lai',
        );
      }

      const latestJourney = await tx.batchJourney.findFirst({
        where: { batchId },
        include: { stage: true },
        orderBy: [{ eventTime: 'desc' }, { createdAt: 'desc' }],
      });
      if (latestJourney) {
        const latestEventTime =
          latestJourney.eventTime ?? latestJourney.createdAt;
        if (eventTime.getTime() < latestEventTime.getTime()) {
          throw new BadRequestException(
            'Thời điểm công đoạn phải sau công đoạn gần nhất',
          );
        }
      }

      const productionSequence = [
        SupplyChainStageName.HARVEST,
        SupplyChainStageName.PROCESSING,
        SupplyChainStageName.PACKAGING,
      ];
      const productionJourneys = await tx.batchJourney.findMany({
        where: {
          batchId,
          stage: { name: { in: productionSequence } },
        },
        select: { stage: { select: { name: true } } },
        orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
      });
      const expectedStage = productionSequence[productionJourneys.length];
      if (!expectedStage || stage.name !== expectedStage) {
        throw new BadRequestException(
          expectedStage
            ? `Công đoạn sản xuất kế tiếp phải là ${expectedStage}`
            : 'Các công đoạn sản xuất bắt buộc của lô đã được ghi nhận đầy đủ',
        );
      }

      if (
        dto.logisticsUserId ||
        dto.qualityStatus ||
        dto.carrierName ||
        dto.recipientName
      ) {
        throw new BadRequestException(
          'Công đoạn sản xuất không được thay đổi kết quả QC hoặc dữ liệu vận chuyển',
        );
      }
      const effectiveReferenceCode = dto.referenceCode?.trim() || null;
      const effectiveCarrierName = null;

      const blockchainPayload: Prisma.InputJsonObject = {
        batchId,
        batchNumber: batch.batchNumber,
        productId: batch.inventory.productId,
        productName: batch.inventory.product.name,
        stageName: stage.name,
        stageDisplayName: stage.displayName,
        location: dto.location.trim(),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        actorName: recordedActorName,
        note: dto.note?.trim() ?? null,
        eventTime: eventTime.toISOString(),
        qualityStatus: dto.qualityStatus ?? null,
        referenceCode: effectiveReferenceCode,
        carrierName: effectiveCarrierName,
        recipientName: dto.recipientName?.trim() ?? null,
        logisticsUserId: null,
        imageUrls: dto.imageUrls ?? [],
        attachmentUrls: dto.attachmentUrls ?? [],
        recordedAt: new Date().toISOString(),
        createdBy: currentUser.id,
      };

      const journey = await tx.batchJourney.create({
        data: {
          batchId,
          stageId: dto.stageId,
          location: dto.location.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          actorName: recordedActorName,
          actorId: currentUser.id,
          note: dto.note?.trim(),
          eventTime,
          referenceCode: effectiveReferenceCode,
          carrierName: effectiveCarrierName,
          recipientName: dto.recipientName?.trim(),
          imageUrls: dto.imageUrls ?? [],
          attachmentUrls: dto.attachmentUrls ?? [],
          ipAddress: ipAddress ?? null,
          blockchainPayload,
        },
        include: {
          stage: true,
          actor: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      const outboxRecord = await this.blockchainQueueService.createOutboxRecord(tx, {
        productId: batch.inventory.productId,
        batchId,
        journeyId: journey.id,
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: blockchainPayload as Prisma.InputJsonObject,
      });

      return {
        journey,
        blockchainPayload,
        productId: batch.inventory.productId,
        outboxRecordId: outboxRecord.id,
      };
    });

    this.logger.log(
      `Journey added: batch=${batchId} stage=${result.journey.stage.name} by=${currentUser.email}`,
    );

    void this.blockchainQueueService.enqueueOutboxRecord(
      result.outboxRecordId,
      {
        type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        journeyId: result.journey.id,
        productId: result.productId,
        batchId,
        payload: result.blockchainPayload,
        actorId: currentUser.id,
      },
    );

    return result.journey;
  }

  // ── Product Supply Chain ──────────────────────────────────────────────────

  /**
   * Lấy tất cả batch của một product + journeys (dùng cho QR public)
   */
  async getProductSupplyChain(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        seller: { include: { sellerProfile: true } },
        province: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        inventories: {
          include: {
            batches: {
              include: {
                journeys: {
                  include: { stage: true },
                  orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Sản phẩm không tồn tại: ${productId}`);
    }

    // Flatten batches từ tất cả inventories
    const batches = product.inventories.flatMap((inv) => inv.batches);

    return {
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        primaryImage: product.images[0]?.imageUrl ?? null,
        seller: {
          id: product.seller.id,
          name:
            product.seller.sellerProfile?.displayName ??
            product.seller.fullName,
          address: product.seller.sellerProfile?.address ?? null,
          isVerified: product.seller.sellerProfile?.isVerified ?? false,
        },
        province: product.province,
        ward: product.ward,
      },
      batches,
    };
  }

  // ── History ───────────────────────────────────────────────────────────────

  /**
   * Lịch sử toàn bộ journey với filter và pagination
   */
  async getHistory(query: QueryHistoryDto, currentUser: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.BatchJourneyWhereInput = {};

    if (query.stageId) {
      where.stageId = query.stageId;
    }

    if (query.actorName) {
      where.actorName = { contains: query.actorName, mode: 'insensitive' };
    }

    if (query.batchId) {
      where.batchId = query.batchId;
    }

    if (query.dateFrom || query.dateTo) {
      const eventTime: Prisma.DateTimeFilter = {};
      if (query.dateFrom) {
        eventTime.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        eventTime.lte = new Date(query.dateTo);
      }
      where.eventTime = eventTime;
    }

    if (
      currentUser.role === RoleName.SELLER ||
      currentUser.role === RoleName.WAREHOUSE_MANAGER
    ) {
      where.batch = this.getBatchScope(currentUser);
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.batchJourney.findMany({
        where,
        skip,
        take: limit,
        include: {
          stage: true,
          batch: {
            select: {
              id: true,
              batchNumber: true,
              status: true,
              qualityStatus: true,
              inventory: {
                select: {
                  product: { select: { id: true, name: true } },
                  warehouse: { select: { id: true, name: true } },
                },
              },
            },
          },
          actor: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: [{ eventTime: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.batchJourney.count({ where }),
    ]);

    return createPaginationResponse(items, totalItems, page, limit);
  }

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  /**
   * Thống kê tổng quan Supply Chain cho dashboard
   */
  async getDashboardStats(currentUser: RequestUser) {
    const batches = await this.prisma.inventoryBatch.findMany({
      where: this.getBatchScope(currentUser),
      select: {
        id: true,
        status: true,
        qualityStatus: true,
        lifecycleStatus: true,
        quantity: true,
        shipmentItems: { select: { shipment: { select: { status: true } } } },
        expiryDate: true,
        journeys: {
          orderBy: [{ eventTime: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, stage: { select: { name: true } } },
        },
      },
    });

    const journeyIds = batches.flatMap((batch) =>
      batch.journeys.map((journey) => journey.id),
    );
    const confirmedRecords =
      journeyIds.length > 0
        ? await this.prisma.blockchainRecord.findMany({
            where: {
              journeyId: { in: journeyIds },
              status: BlockchainRecordStatus.CONFIRMED,
            },
            select: { journeyId: true },
          })
        : [];
    const confirmedJourneyIds = new Set(
      confirmedRecords
        .map((record) => record.journeyId)
        .filter((journeyId): journeyId is string => journeyId !== null),
    );

    const now = new Date();
    const expiryCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const hasShipment = (batch: (typeof batches)[number], statuses: string[]) =>
      batch.shipmentItems?.some((item) =>
        statuses.includes(item.shipment.status),
      );

    return {
      totalBatches: batches.length,
      releasedBatches: batches.filter(
        (batch) =>
          batch.status === 'ACTIVE' &&
          batch.quantity > 0 &&
          batch.lifecycleStatus === 'RELEASED' &&
          batch.qualityStatus === 'PASSED' &&
          (!batch.expiryDate || batch.expiryDate > now),
      ).length,
      activeBatches: batches.filter((batch) => batch.status === 'ACTIVE')
        .length,
      depletedBatches: batches.filter((batch) => batch.status === 'DEPLETED')
        .length,
      expiredBatches: batches.filter((batch) => batch.status === 'EXPIRED')
        .length,
      failedQcBatches: batches.filter(
        (batch) => batch.qualityStatus === QualityStatus.FAILED,
      ).length,
      pendingInspection: batches.filter(
        (batch) =>
          batch.lifecycleStatus === 'QUARANTINED' ||
          batch.qualityStatus === QualityStatus.PENDING_CHECK,
      ).length,
      expiringSoon: batches.filter(
        (batch) =>
          batch.status === 'ACTIVE' &&
          batch.expiryDate !== null &&
          batch.expiryDate >= now &&
          batch.expiryDate <= expiryCutoff,
      ).length,
      inProgressBatches: batches.filter((batch) =>
        hasShipment(batch, [
          'IN_TRANSIT',
          'AT_DISTRIBUTOR',
          'AT_RETAIL',
          'OUT_FOR_DELIVERY',
        ]),
      ).length,
      awaitingCarrierPickup: batches.filter((batch) =>
        hasShipment(batch, ['HANDED_OVER']),
      ).length,
      completedBatches: batches.filter((batch) =>
        hasShipment(batch, ['DELIVERED']),
      ).length,
      blockchainSynced: batches.filter(
        (batch) =>
          batch.journeys.length > 0 &&
          batch.journeys.every((journey) =>
            confirmedJourneyIds.has(journey.id),
          ),
      ).length,
    };
  }

  // ── Location Autocomplete Suggestions ──────────────────────────────────────

  /**
   * Gợi ý địa điểm và tọa độ cho công đoạn chuỗi cung ứng
   * Tìm kiếm kết hợp từ: Kho hàng, Vùng nguyên liệu, Xã/Phường, và OpenStreetMap
   */
  async suggestLocations(query: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return [];

    const results: Array<{
      id: string;
      label: string;
      address: string;
      latitude: number;
      longitude: number;
      type: 'warehouse' | 'origin' | 'ward' | 'external';
    }> = [];

    // 1. Kho hàng
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
      },
      take: 5,
    });

    for (const w of warehouses) {
      results.push({
        id: `wh-${w.id}`,
        label: `Kho: ${w.name}`,
        address: w.address,
        latitude: w.latitude ? Number(w.latitude) : 20.973,
        longitude: w.longitude ? Number(w.longitude) : 105.909,
        type: 'warehouse',
      });
    }

    // 2. Vùng/Địa điểm nguồn gốc
    const originLocations = await this.prisma.traceabilityLocation.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { party: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        party: { select: { name: true } },
      },
      take: 5,
    });

    for (const ol of originLocations) {
      results.push({
        id: `ol-${ol.id}`,
        label: `${ol.name} (${ol.party.name})`,
        address: ol.address,
        latitude: ol.latitude ? Number(ol.latitude) : 20.973,
        longitude: ol.longitude ? Number(ol.longitude) : 105.909,
        type: 'origin',
      });
    }

    // 3. Đơn vị hành chính xã/phường
    const wards = await this.prisma.ward.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { province: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        province: { select: { name: true } },
      },
      take: 8,
    });

    for (const wd of wards) {
      results.push({
        id: `wd-${wd.id}`,
        label: `${wd.name}, ${wd.province.name}`,
        address: `${wd.name}, ${wd.province.name}, Việt Nam`,
        latitude: wd.latitude,
        longitude: wd.longitude,
        type: 'ward',
      });
    }

    // 4. Dự phòng geocoding nâng cao qua Photon OpenStreetMap nếu kết quả nội bộ ít
    if (results.length < 5 && q.length >= 3) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`,
          { signal: controller.signal },
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = (await res.json()) as {
            features?: Array<{
              geometry: { coordinates: [number, number] };
              properties: {
                name?: string;
                city?: string;
                state?: string;
                country?: string;
                street?: string;
              };
            }>;
          };
          for (const feature of data.features ?? []) {
            const [lon, lat] = feature.geometry.coordinates;
            const props = feature.properties;
            const parts = [
              props.name,
              props.street,
              props.city,
              props.state,
              props.country,
            ].filter(Boolean);
            const address = parts.join(', ');
            results.push({
              id: `osm-${lat}-${lon}`,
              label: props.name || address,
              address,
              latitude: lat,
              longitude: lon,
              type: 'external',
            });
          }
        }
      } catch {
        // Fallback geocoding error silently ignored
      }
    }

    return results;
  }
}
