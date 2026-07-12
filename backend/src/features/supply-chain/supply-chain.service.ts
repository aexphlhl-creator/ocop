import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Prisma, RoleName } from '@prisma/client';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';
import { BlockchainQueueService } from '../blockchain-queue/blockchain-queue.service';

@Injectable()
export class SupplyChainService {
  private readonly logger = new Logger(SupplyChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainQueueService: BlockchainQueueService,
  ) {}

  // ── Stages ────────────────────────────────────────────────────────────────

  /**
   * Lấy tất cả công đoạn chuỗi cung ứng (lookup table)
   */
  async getStages() {
    return this.prisma.supplyChainStage.findMany({
      orderBy: { order: 'asc' },
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
        inventory: {
          include: {
            product: {
              include: {
                business: true,
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
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch không tồn tại: ${batchId}`);
    }

    // SELLER chỉ được xem batch của business mình
    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({
        where: {
          id: batch.inventory.product.businessId,
          userId: currentUser.id,
        },
      });
      if (!business) {
        throw new ForbiddenException('Bạn không có quyền xem batch này');
      }
    }

    return batch;
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
    // Verify batch tồn tại
    const batch = await this.prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        inventory: {
          include: {
            product: { include: { business: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch không tồn tại: ${batchId}`);
    }

    // SELLER chỉ được thêm journey cho batch của business mình
    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({
        where: {
          id: batch.inventory.product.businessId,
          userId: currentUser.id,
        },
      });
      if (!business) {
        throw new ForbiddenException(
          'Bạn không có quyền thêm hành trình cho batch này',
        );
      }
    }

    // Verify stage tồn tại
    const stage = await this.prisma.supplyChainStage.findUnique({
      where: { id: dto.stageId },
    });
    if (!stage) {
      throw new NotFoundException(`Stage không tồn tại: ${dto.stageId}`);
    }

    // Tạo blockchain payload snapshot (chuẩn bị cho Blockchain — chưa gửi lên chain)
    const blockchainPayload: Prisma.InputJsonObject = {
      batchId,
      batchNumber: batch.batchNumber,
      productId: batch.inventory.productId,
      productName: batch.inventory.product.name,
      stageName: stage.name,
      stageDisplayName: stage.displayName,
      location: dto.location,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      actorName: dto.actorName,
      note: dto.note ?? null,
      timestamp: new Date().toISOString(),
      createdBy: currentUser.id,
    };

    const journey = await this.prisma.batchJourney.create({
      data: {
        batchId,
        stageId: dto.stageId,
        location: dto.location,
        latitude: dto.latitude,
        longitude: dto.longitude,
        actorName: dto.actorName,
        actorId: dto.actorId ?? currentUser.id,
        note: dto.note,
        imageUrls: dto.imageUrls ?? [],
        attachmentUrls: dto.attachmentUrls ?? [],
        ipAddress: ipAddress ?? null,
        blockchainPayload,
        // blockchainTxHash: null — sẽ được set khi tích hợp Blockchain thật
      },
      include: {
        stage: true,
        actor: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    this.logger.log(
      `Journey added: batch=${batchId} stage=${stage.name} by=${currentUser.email}`,
    );

    void this.blockchainQueueService.addSupplyChainRecordJob({
      journeyId: journey.id,
      productId: batch.inventory.productId,
      batchId,
      payload: blockchainPayload,
      actorId: currentUser.id,
    });

    return journey;
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
        business: { select: { id: true, name: true, address: true } },
        province: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        inventories: {
          include: {
            batches: {
              include: {
                journeys: {
                  include: { stage: true },
                  orderBy: { createdAt: 'asc' },
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
        business: product.business,
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
    const where: any = {};

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
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    // SELLER chỉ thấy journey của batch thuộc business mình
    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({
        where: { userId: currentUser.id },
      });
      if (business) {
        where.batch = {
          inventory: {
            product: { businessId: business.id },
          },
        };
      } else {
        // Seller chưa có business → return empty
        return createPaginationResponse([], 0, page, limit);
      }
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
        orderBy: { createdAt: 'desc' },
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
    // Xây dựng filter theo role
    let batchWhere: any = {};

    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({
        where: { userId: currentUser.id },
      });
      if (business) {
        batchWhere = {
          inventory: {
            product: { businessId: business.id },
          },
        };
      }
    }

    const [totalBatches, activeBatches, depletedBatches, expiredBatches, failedQcBatches] =
      await Promise.all([
        this.prisma.inventoryBatch.count({ where: batchWhere }),
        this.prisma.inventoryBatch.count({
          where: { ...batchWhere, status: 'ACTIVE' },
        }),
        this.prisma.inventoryBatch.count({
          where: { ...batchWhere, status: 'DEPLETED' },
        }),
        this.prisma.inventoryBatch.count({
          where: { ...batchWhere, status: 'EXPIRED' },
        }),
        this.prisma.inventoryBatch.count({
          where: { ...batchWhere, qualityStatus: 'FAILED' },
        }),
      ]);

    // Batch có journey gần nhất trong 7 ngày = "đang xử lý"
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const batchesWithRecentJourney = await this.prisma.batchJourney.groupBy({
      by: ['batchId'],
      where: {
        createdAt: { gte: sevenDaysAgo },
        ...(currentUser.role === RoleName.SELLER
          ? {
              batch: {
                inventory: {
                  product: {
                    business: { userId: currentUser.id },
                  },
                },
              },
            }
          : {}),
      },
    });

    // Batch đã có stage CUSTOMER = hoàn thành
    const customerStage = await this.prisma.supplyChainStage.findUnique({
      where: { name: 'CUSTOMER' },
    });

    const completedBatches = customerStage
      ? await this.prisma.batchJourney.groupBy({
          by: ['batchId'],
          where: {
            stageId: customerStage.id,
            ...(currentUser.role === RoleName.SELLER
              ? {
                  batch: {
                    inventory: {
                      product: {
                        business: { userId: currentUser.id },
                      },
                    },
                  },
                }
              : {}),
          },
        })
      : [];

    return {
      totalBatches,
      activeBatches,
      depletedBatches,
      expiredBatches,
      failedQcBatches,
      inProgressBatches: batchesWithRecentJourney.length,
      completedBatches: completedBatches.length,
    };
  }
}
