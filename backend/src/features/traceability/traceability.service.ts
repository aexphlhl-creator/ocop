import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { STORAGE_PROVIDER } from '../certificates/storage/storage-provider.interface';
import type { StorageProvider } from '../certificates/storage/storage-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

type TraceabilityCertificate = Prisma.CertificateGetPayload<{
  include: {
    certificateType: { select: { code: true; name: true } };
    files: {
      select: {
        fileName: true;
        fileUrl: true;
        mimeType: true;
        fileSize: true;
        uploadedAt: true;
      };
    };
  };
}>;

@Injectable()
export class TraceabilityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async getBatchTraceability(batchId: string) {
    const batchRef = await this.prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { inventory: { select: { productId: true } } },
    });
    if (!batchRef) {
      throw new NotFoundException(
        'Không tìm thấy lô hàng để truy xuất nguồn gốc',
      );
    }
    const aggregate = await this.getProductTraceability(
      batchRef.inventory.productId,
    );
    const batch = aggregate.batches.find((item) => item.id === batchId);
    if (!batch) {
      throw new NotFoundException(
        'Lô hàng không còn khả dụng để truy xuất nguồn gốc',
      );
    }
    const timeline = aggregate.supplyChainTimeline.filter(
      (event) => event.batchNumber === batch.batchNumber,
    );
    const blockchainJourneys = timeline.filter(
      (event) => event.source === 'BATCH_JOURNEY',
    );
    const blockchainConfirmedCount = blockchainJourneys.filter(
      (event) => event.blockchainVerification?.verified,
    ).length;
    const batchBlockchain =
      blockchainJourneys.find((event) => event.blockchainVerification?.verified)
        ?.blockchainVerification ??
      blockchainJourneys.find((event) => event.blockchainVerification?.txHash)
        ?.blockchainVerification;

    return {
      ...aggregate,
      traceabilityScope: 'BATCH',
      traceabilityWarning: null,
      batches: [batch],
      supplyChainTimeline: timeline,
      warehouse: batch.warehouse,
      summary: {
        ...aggregate.summary,
        currentStage: timeline[timeline.length - 1]?.stage ?? null,
        currentWarehouse: batch.warehouse,
        currentQuantity: batch.quantity,
        productionDate:
          batch.manufactureDate ??
          batch.harvestDate ??
          aggregate.product.harvestDate,
        expiryDate: batch.expiryDate,
        qualityStatus: batch.qualityStatus,
        blockchain: batchBlockchain ?? {
          verified: false,
          txHash: null,
          explorerUrl: null,
          confirmations: 0,
          timestamp: null,
        },
        traceabilityVerification: {
          ...batch.traceabilityVerification,
          qualityVerified: batch.qualityStatus === 'PASSED',
          blockchainVerified:
            blockchainJourneys.length > 0 &&
            blockchainConfirmedCount === blockchainJourneys.length,
          blockchainConfirmedCount,
          blockchainJourneyCount: blockchainJourneys.length,
          standard: 'GS1_CTE_KDE_ALIGNED',
        },
      },
    };
  }

  async getProductTraceability(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        images: {
          select: { imageUrl: true, isPrimary: true },
          orderBy: { isPrimary: 'desc' },
        },
        seller: { include: { sellerProfile: true } },
        province: { select: { name: true } },
        ward: { select: { name: true } },
        category: { select: { name: true, slug: true } },
        ocopLevel: { select: { level: true, title: true, icon: true } },
        inventories: {
          orderBy: { updatedAt: 'desc' },
          include: {
            warehouse: { select: { name: true, address: true } },
            batches: {
              where: { status: { not: 'RECALLED' } },
              include: {
                originDeclarations: {
                  orderBy: { revision: 'desc' },
                  include: {
                    party: true,
                    location: true,
                    declaredBy: {
                      select: { id: true, fullName: true },
                    },
                  },
                },
                outputMaterialLinks: {
                  include: {
                    inputBatch: {
                      include: {
                        inventory: {
                          include: {
                            product: { select: { id: true, name: true } },
                          },
                        },
                        originDeclarations: {
                          orderBy: { revision: 'desc' },
                          take: 1,
                          include: { party: true, location: true },
                        },
                      },
                    },
                  },
                  orderBy: { createdAt: 'asc' },
                },
                shipmentItems: {
                  include: {
                    shipment: {
                      include: {
                        carrierOrganization: true,
                        events: {
                          include: {
                            actor: { select: { id: true, fullName: true } },
                          },
                          orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
                        },
                      },
                    },
                  },
                },
                certificates: {
                  where: { deletedAt: null },
                  include: {
                    certificateType: { select: { code: true, name: true } },
                    files: {
                      select: {
                        fileName: true,
                        fileUrl: true,
                        mimeType: true,
                        fileSize: true,
                        uploadedAt: true,
                      },
                    },
                  },
                  orderBy: { expiryDate: 'asc' },
                },
                journeys: {
                  select: {
                    id: true,
                    stage: {
                      select: {
                        name: true,
                        displayName: true,
                        icon: true,
                        color: true,
                        order: true,
                      },
                    },
                    location: true,
                    latitude: true,
                    longitude: true,
                    actorName: true,
                    note: true,
                    imageUrls: true,
                    attachmentUrls: true,
                    eventTime: true,
                    referenceCode: true,
                    carrierName: true,
                    recipientName: true,
                    blockchainPayload: true,
                    createdAt: true,
                  },
                  orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        certificates: {
          where: { deletedAt: null },
          include: {
            certificateType: { select: { code: true, name: true } },
            files: {
              select: {
                fileName: true,
                fileUrl: true,
                mimeType: true,
                fileSize: true,
                uploadedAt: true,
              },
            },
          },
          orderBy: { expiryDate: 'asc' },
        },
        orderItems: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            order: {
              select: {
                status: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(
        'Không tìm thấy sản phẩm để truy xuất nguồn gốc',
      );
    }

    const journeyIds = product.inventories.flatMap((inventory) =>
      inventory.batches.flatMap((batch) =>
        batch.journeys.map((journey) => journey.id),
      ),
    );
    const journeyBlockchainRecords =
      journeyIds.length > 0
        ? await this.prisma.blockchainRecord.findMany({
            where: { journeyId: { in: journeyIds } },
            orderBy: { createdAt: 'desc' },
            select: {
              journeyId: true,
              status: true,
              transactionHash: true,
              txId: true,
              explorerUrl: true,
              confirmations: true,
              confirmedAt: true,
              createdAt: true,
            },
          })
        : [];
    const blockchainRecordByJourney = new Map<
      string,
      (typeof journeyBlockchainRecords)[number]
    >();
    for (const record of journeyBlockchainRecords) {
      if (
        record.journeyId &&
        !blockchainRecordByJourney.has(record.journeyId)
      ) {
        blockchainRecordByJourney.set(record.journeyId, record);
      }
    }

    const relatedProducts = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'APPROVED',
        categoryId: product.categoryId,
        NOT: { id: product.id },
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        slug: true,
        price: true,
        unit: true,
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { imageUrl: true },
        },
        ocopLevel: { select: { level: true } },
      },
    });

    const batches = await Promise.all(
      product.inventories.flatMap((inventory) =>
        inventory.batches.map(async (batch) => {
          const journeys = batch.journeys.map((journey) => {
            const blockchainRecord = blockchainRecordByJourney.get(journey.id);
            const txHash =
              blockchainRecord?.transactionHash ??
              blockchainRecord?.txId ??
              null;
            const payload =
              journey.blockchainPayload &&
              typeof journey.blockchainPayload === 'object' &&
              !Array.isArray(journey.blockchainPayload)
                ? (journey.blockchainPayload as Record<string, unknown>)
                : null;

            return {
              id: journey.id,
              stage: journey.stage,
              location: journey.location,
              latitude: journey.latitude,
              longitude: journey.longitude,
              actorName: journey.actorName,
              note: journey.note,
              imageUrls: journey.imageUrls,
              attachmentUrls: journey.attachmentUrls,
              eventTime: journey.eventTime,
              createdAt: journey.createdAt,
              referenceCode: journey.referenceCode,
              carrierName: journey.carrierName,
              recipientName: journey.recipientName,
              qualityStatus:
                typeof payload?.qualityStatus === 'string'
                  ? payload.qualityStatus
                  : null,
              blockchainVerification: {
                status: blockchainRecord?.status ?? null,
                verified:
                  blockchainRecord?.status === 'CONFIRMED' && Boolean(txHash),
                txHash,
                explorerUrl: blockchainRecord?.explorerUrl ?? null,
                confirmations: blockchainRecord?.confirmations ?? null,
                timestamp:
                  blockchainRecord?.confirmedAt ??
                  blockchainRecord?.createdAt ??
                  null,
              },
              batchNumber: batch.batchNumber,
            };
          });
          const originDeclarations = batch.originDeclarations ?? [];
          const shipmentItems = batch.shipmentItems ?? [];
          // For the current output batch, consume links whose outputBatchId is
          // this batch. The inverse relation describes where this batch is used
          // as an input and must not be shown as its source materials.
          const inputMaterialLinks = batch.outputMaterialLinks ?? [];
          const origin = originDeclarations[0] ?? null;
          const shipmentEvents = shipmentItems.flatMap((item) =>
            item.shipment.events.map((event) => ({
              id: event.id,
              source: 'SHIPMENT_EVENT' as const,
              eventType: event.eventType,
              stage: this.shipmentStage(event.eventType),
              location: event.location,
              latitude: event.latitude,
              longitude: event.longitude,
              actorName:
                event.actor?.fullName ??
                (event.source === 'CARRIER_WEBHOOK'
                  ? item.shipment.carrierOrganization.name
                  : 'Hệ thống'),
              note: event.note,
              imageUrls: event.imageUrls,
              attachmentUrls: event.attachmentUrls,
              eventTime: event.eventTime,
              createdAt: event.createdAt,
              referenceCode: item.shipment.trackingCode,
              carrierName: item.shipment.carrierOrganization.name,
              recipientName: event.recipientName,
              failureReason: event.failureReason,
              shipmentNumber: item.shipment.shipmentNumber,
              batchNumber: batch.batchNumber,
              blockchainVerification: null,
            })),
          );
          const stageNames = new Set(
            batch.journeys.map((journey) => journey.stage.name),
          );
          const hasTransformation =
            stageNames.has('PROCESSING') || stageNames.has('PACKAGING');
          const hasShipment = shipmentItems.length > 0;
          const shipmentClosed =
            !hasShipment ||
            shipmentItems.every((item) =>
              ['DELIVERED', 'RETURNED', 'CANCELLED'].includes(
                item.shipment.status,
              ),
            );
          const physicalShipmentEvents = shipmentEvents.filter((event) =>
            [
              'HANDED_OVER',
              'PICKED_UP',
              'ARRIVED_DISTRIBUTOR',
              'ARRIVED_RETAIL',
              'OUT_FOR_DELIVERY',
              'DELIVERED',
              'DELIVERY_FAILED',
              'RETURN_STARTED',
              'RETURNED',
            ].includes(event.eventType),
          );
          const traceabilityEvents = [
            ...journeys.map((journey) => ({
              location: journey.location,
              actorName: journey.actorName,
              eventTime: journey.eventTime,
            })),
            ...physicalShipmentEvents,
          ];
          const eventKdeComplete =
            traceabilityEvents.length > 0 &&
            traceabilityEvents.every(
              (event) =>
                Boolean(event.location?.trim()) &&
                Boolean(event.actorName?.trim()) &&
                Boolean(event.eventTime),
            );
          const requirements = [
            {
              code: 'ORIGIN_DECLARATION',
              label: 'Bản khai nguồn gốc theo lô',
              applicable: true,
              complete: Boolean(origin),
            },
            {
              code: 'SOURCE_PARTY',
              label: 'Chủ thể nguồn gốc có định danh',
              applicable: true,
              complete: Boolean(origin?.party.code),
            },
            {
              code: 'SOURCE_LOCATION',
              label: 'Địa điểm nguồn gốc có định danh',
              applicable: true,
              complete: Boolean(
                origin?.location.code && origin.location.address,
              ),
            },
            {
              code: 'SOURCE_LOT',
              label: 'Mã lô tại nguồn',
              applicable: true,
              complete: Boolean(origin?.sourceLotCode),
            },
            {
              code: 'PRODUCTION_DATE',
              label: 'Ngày thu hoạch hoặc sản xuất',
              applicable: true,
              complete: Boolean(origin?.harvestDate || origin?.manufactureDate),
            },
            {
              code: 'QUALITY_INSPECTION',
              label: 'Kiểm định chất lượng đạt',
              applicable: true,
              complete:
                batch.qualityStatus === 'PASSED' &&
                stageNames.has('QUALITY_INSPECTION'),
            },
            {
              code: 'WAREHOUSE_RECEIPT',
              label: 'Ghi nhận tiếp nhận/nhập kho',
              applicable: true,
              complete:
                stageNames.has('RECEIVED') || stageNames.has('WAREHOUSE'),
            },
            {
              code: 'TRANSFORMATION_LINKS',
              label: 'Quan hệ lô đầu vào–đầu ra khi chế biến',
              applicable: hasTransformation,
              complete: hasTransformation && inputMaterialLinks.length > 0,
            },
            {
              code: 'EVENT_KDE',
              label: 'Who–What–Where–When–Why của các sự kiện',
              applicable: true,
              complete: eventKdeComplete,
            },
            {
              code: 'CHAIN_OF_CUSTODY',
              label: 'Chuỗi bàn giao/vận chuyển đến trạng thái hiện tại',
              applicable: hasShipment,
              complete: hasShipment && shipmentClosed,
            },
          ];
          const applicableRequirements = requirements.filter(
            (item) => item.applicable,
          );
          const completedRequirements = applicableRequirements.filter(
            (item) => item.complete,
          ).length;
          const dataComplete =
            completedRequirements === applicableRequirements.length;
          const masterDataVerified = Boolean(
            origin?.party.isVerified && origin.location.isVerified,
          );
          const verificationStatus = !origin
            ? 'MISSING_ORIGIN'
            : !dataComplete
              ? 'INCOMPLETE'
              : !masterDataVerified
                ? 'RECORDED_UNVERIFIED'
                : 'VERIFIED';

          return {
            id: batch.id,
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
            initialQuantity: batch.initialQuantity,
            manufactureDate: batch.manufactureDate,
            harvestDate: batch.harvestDate,
            expiryDate: batch.expiryDate,
            receivedDate: batch.receivedDate,
            supplier: batch.supplier,
            warehouseLocation: batch.warehouseLocation,
            status: batch.status,
            qualityStatus: batch.qualityStatus,
            warehouse: inventory.warehouse,
            currentQuantity: inventory.currentQuantity,
            reservedQuantity: inventory.reservedQuantity,
            origin,
            originRevisionCount: originDeclarations.length,
            inputMaterials: inputMaterialLinks.map((link) => ({
              id: link.id,
              quantity: link.quantity,
              unit: link.unit,
              processReference: link.processReference,
              evidenceUrls: link.evidenceUrls,
              createdAt: link.createdAt,
              batch: {
                id: link.inputBatch.id,
                batchNumber: link.inputBatch.batchNumber,
                product: link.inputBatch.inventory.product,
                origin: link.inputBatch.originDeclarations[0] ?? null,
              },
            })),
            shipments: shipmentItems.map((item) => ({
              quantity: item.quantity,
              shipment: {
                id: item.shipment.id,
                shipmentNumber: item.shipment.shipmentNumber,
                trackingCode: item.shipment.trackingCode,
                status: item.shipment.status,
                routeType: item.shipment.routeType,
                destinationName: item.shipment.destinationName,
                carrierOrganization: item.shipment.carrierOrganization,
              },
            })),
            certificates: await Promise.all(
              batch.certificates.map((certificate) =>
                this.sanitizeCertificate(certificate),
              ),
            ),
            journeys,
            shipmentEvents,
            traceabilityVerification: {
              status: verificationStatus,
              score: Math.round(
                (completedRequirements / applicableRequirements.length) * 100,
              ),
              dataComplete,
              masterDataVerified,
              fullyVerified: dataComplete && masterDataVerified,
              requirements,
              missing: requirements
                .filter((item) => item.applicable && !item.complete)
                .map((item) => item.code),
            },
          };
        }),
      ),
    );

    const supplyChainTimeline = batches
      .flatMap((batch) => [
        ...(batch.origin
          ? [
              {
                source: 'ORIGIN_DECLARATION' as const,
                eventType: 'SOURCE_DECLARED',
                stage: {
                  name: 'SOURCE',
                  displayName: 'Nguồn gốc lô hàng',
                  icon: 'Sprout',
                  color: '#16a34a',
                  order: 0,
                },
                time: batch.origin.declaredAt,
                location: batch.origin.location.name,
                latitude:
                  batch.origin.location.latitude == null
                    ? null
                    : Number(batch.origin.location.latitude),
                longitude:
                  batch.origin.location.longitude == null
                    ? null
                    : Number(batch.origin.location.longitude),
                actorName: batch.origin.party.name,
                note: batch.origin.productionMethod,
                imageUrls: batch.origin.evidenceUrls,
                attachmentUrls: [],
                referenceCode: batch.origin.sourceLotCode,
                carrierName: null,
                recipientName: null,
                qualityStatus: null,
                blockchainVerification: null,
                batchNumber: batch.batchNumber,
              },
            ]
          : []),
        ...batch.journeys.map((journey) => ({
          source: 'BATCH_JOURNEY' as const,
          eventType: journey.stage.name,
          stage: journey.stage,
          time: journey.eventTime ?? journey.createdAt,
          location: journey.location,
          latitude: journey.latitude,
          longitude: journey.longitude,
          actorName: journey.actorName,
          note: journey.note,
          imageUrls: journey.imageUrls,
          attachmentUrls: journey.attachmentUrls,
          referenceCode: journey.referenceCode,
          carrierName: journey.carrierName,
          recipientName: journey.recipientName,
          qualityStatus: journey.qualityStatus,
          blockchainVerification: journey.blockchainVerification,
          batchNumber: batch.batchNumber,
        })),
        ...batch.shipmentEvents.map((event) => ({
          ...event,
          time: event.eventTime ?? event.createdAt,
        })),
      ])
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const certificatesWithDuplicates = [
      ...(await Promise.all(
        product.certificates.map((certificate) =>
          this.sanitizeCertificate(certificate),
        ),
      )),
      ...batches.flatMap((batch) => batch.certificates),
    ];
    const certificates = certificatesWithDuplicates
      .filter(
        (certificate, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.certificateNumber === certificate.certificateNumber,
          ) === index,
      )
      .sort(
        (a, b) =>
          new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
      );

    const latestCertificate =
      certificates
        .filter(
          (certificate) =>
            new Date(certificate.expiryDate).getTime() >= Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime(),
        )[0] ??
      certificates[0] ??
      null;

    const currentBatch =
      batches.find((batch) => batch.status === 'ACTIVE') ?? batches[0] ?? null;
    const currentStage =
      supplyChainTimeline[supplyChainTimeline.length - 1]?.stage ?? null;
    const latestOrderStatus = product.orderItems[0]?.order ?? null;
    const firstBlockchainRecord =
      journeyBlockchainRecords.find(
        (r) => r.status === 'CONFIRMED' && (r.transactionHash || r.txId),
      ) ??
      journeyBlockchainRecords[0] ??
      null;

    const effectiveTxHash =
      firstBlockchainRecord?.transactionHash ??
      firstBlockchainRecord?.txId ??
      certificates.find((c) => c.blockchainVerification?.txHash)
        ?.blockchainVerification?.txHash ??
      supplyChainTimeline.find((s) => s.blockchainVerification?.txHash)
        ?.blockchainVerification?.txHash ??
      null;

    const effectiveExplorerUrl = firstBlockchainRecord?.explorerUrl ?? null;

    const blockchainSummary = {
      verified:
        firstBlockchainRecord?.status === 'CONFIRMED' &&
        !!(firstBlockchainRecord.transactionHash || firstBlockchainRecord.txId),
      status: firstBlockchainRecord?.status ?? 'NOT_RECORDED',
      txHash: effectiveTxHash,
      explorerUrl: effectiveExplorerUrl,
      confirmations: firstBlockchainRecord?.confirmations ?? 0,
      timestamp:
        firstBlockchainRecord?.confirmedAt ??
        firstBlockchainRecord?.createdAt ??
        null,
    };

    const qualityVerified =
      batches.length > 0 &&
      batches.every((batch) => batch.qualityStatus === 'PASSED');
    const blockchainJourneys = supplyChainTimeline.filter(
      (event) => event.source === 'BATCH_JOURNEY',
    );
    const blockchainConfirmedCount = blockchainJourneys.filter(
      (journey) => journey.blockchainVerification?.verified,
    ).length;
    const blockchainVerified =
      blockchainJourneys.length > 0 &&
      blockchainConfirmedCount === blockchainJourneys.length;
    const fullyVerified =
      batches.length > 0 &&
      batches.every((batch) => batch.traceabilityVerification.fullyVerified);

    return {
      product: {
        name: product.name,
        code: product.id.split('-')[0].toUpperCase(),
        slug: product.slug,
        description: product.description,
        price: product.price,
        unit: product.unit,
        category: product.category,
        ocopLevel: product.ocopLevel,
        images: product.images.map((image) => image.imageUrl),
        origin: {
          province: product.province?.name ?? null,
          ward: product.ward?.name ?? null,
          latitude: product.latitude,
          longitude: product.longitude,
        },
        originProcess: product.originProcess,
        farmingProcess: product.farmingProcess,
        harvestProcess: product.harvestProcess,
        packagingProcess: product.packagingProcess,
        certificateNumber: product.certificateNumber,
        harvestDate: product.harvestDate,
      },
      traceabilityScope: 'PRODUCT',
      traceabilityWarning:
        batches.length > 1
          ? 'Kết quả cấp sản phẩm gồm nhiều lô; QR production phải dùng ID lô cụ thể.'
          : null,
      seller: {
        id: product.seller.id,
        name:
          product.seller.sellerProfile?.displayName ?? product.seller.fullName,
        address: product.seller.sellerProfile?.address ?? null,
        phone: product.seller.sellerProfile?.phone ?? product.seller.phone,
        isVerified: product.seller.sellerProfile?.isVerified ?? false,
      },
      batches,
      supplyChainTimeline,
      certificates,
      warehouse: currentBatch?.warehouse ?? null,
      orderStatus: latestOrderStatus,
      summary: {
        currentStage,
        currentWarehouse: currentBatch?.warehouse ?? null,
        currentQuantity: currentBatch?.quantity ?? 0,
        productionDate:
          currentBatch?.manufactureDate ??
          currentBatch?.harvestDate ??
          product.harvestDate,
        expiryDate: currentBatch?.expiryDate ?? null,
        latestCertificate,
        qualityStatus: currentBatch?.qualityStatus ?? null,
        traceabilityVerification: {
          qualityVerified,
          blockchainVerified,
          fullyVerified,
          standard: 'GS1_CTE_KDE_ALIGNED',
          batchVerifiedCount: batches.filter(
            (batch) => batch.traceabilityVerification.fullyVerified,
          ).length,
          batchCount: batches.length,
          blockchainConfirmedCount,
          blockchainJourneyCount: blockchainJourneys.length,
        },
        blockchain: blockchainSummary,
      },
      relatedProducts: relatedProducts.map((item) => ({
        name: item.name,
        slug: item.slug,
        price: item.price,
        unit: item.unit,
        image: item.images[0]?.imageUrl ?? null,
        ocopLevel: item.ocopLevel,
      })),
    };
  }

  private shipmentStage(eventType: string) {
    let displayName: string;
    switch (eventType) {
      case 'CREATED':
        displayName = 'Tạo chuyến hàng';
        break;
      case 'ASSIGNED':
        displayName = 'Phân công vận chuyển';
        break;
      case 'REASSIGNED':
        displayName = 'Phân công lại vận chuyển';
        break;
      case 'HANDED_OVER':
        displayName = 'Bàn giao cho đơn vị vận chuyển';
        break;
      case 'PICKED_UP':
        displayName = 'Đã lấy hàng';
        break;
      case 'ARRIVED_DISTRIBUTOR':
        displayName = 'Đến nhà phân phối';
        break;
      case 'ARRIVED_RETAIL':
        displayName = 'Đến điểm bán lẻ';
        break;
      case 'OUT_FOR_DELIVERY':
        displayName = 'Đang giao chặng cuối';
        break;
      case 'DELIVERED':
        displayName = 'Đã giao hàng';
        break;
      case 'DELIVERY_FAILED':
        displayName = 'Giao hàng thất bại';
        break;
      case 'DELIVERY_RETRIED':
        displayName = 'Giao lại';
        break;
      case 'RETURN_STARTED':
        displayName = 'Bắt đầu hoàn hàng';
        break;
      case 'RETURNED':
        displayName = 'Đã hoàn hàng';
        break;
      case 'CANCELLED':
        displayName = 'Đã hủy chuyến';
        break;
      default:
        displayName = eventType;
    }
    return {
      name: eventType,
      displayName,
      icon: 'Truck',
      color: '#2563eb',
      order: 100,
    };
  }

  private async sanitizeCertificate(certificate: TraceabilityCertificate) {
    const blockchainRecord = certificate.id
      ? await this.prisma.blockchainRecord.findFirst({
          where: { certificateId: certificate.id },
          orderBy: { updatedAt: 'desc' },
          select: {
            status: true,
            transactionHash: true,
            txId: true,
            explorerUrl: true,
            confirmations: true,
            confirmedAt: true,
            createdAt: true,
          },
        })
      : null;
    const txHash =
      blockchainRecord?.transactionHash ??
      blockchainRecord?.txId ??
      certificate.blockchainTxHash ??
      null;

    return {
      type: certificate.certificateType,
      certificateNumber: certificate.certificateNumber,
      issuingOrganization: certificate.issuingOrganization,
      issueDate: certificate.issueDate,
      expiryDate: certificate.expiryDate,
      status: certificate.status,
      verificationUrl: certificate.verificationUrl,
      documentHash: certificate.documentHash,
      blockchainTxHash: certificate.blockchainTxHash,
      blockchainVerification: {
        verified: blockchainRecord?.status === 'CONFIRMED' && Boolean(txHash),
        txHash,
        explorerUrl: blockchainRecord?.explorerUrl ?? null,
        confirmations: blockchainRecord?.confirmations ?? null,
        timestamp:
          blockchainRecord?.confirmedAt ?? blockchainRecord?.createdAt ?? null,
      },
      files: await Promise.all(
        certificate.files.map(async (file) => ({
          ...file,
          fileUrl: await this.storageProvider.getDownloadUrl(file.fileUrl),
        })),
      ),
    };
  }
}
