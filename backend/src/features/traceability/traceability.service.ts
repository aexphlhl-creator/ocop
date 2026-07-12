import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { STORAGE_PROVIDER } from '../certificates/storage/storage-provider.interface';
import type { StorageProvider } from '../certificates/storage/storage-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TraceabilityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async getProductTraceability(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        images: { select: { imageUrl: true, isPrimary: true }, orderBy: { isPrimary: 'desc' } },
        business: { select: { name: true, address: true, phone: true, isVerified: true } },
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
                certificates: {
                  where: { deletedAt: null },
                  include: {
                    certificateType: { select: { code: true, name: true } },
                    files: { select: { fileName: true, fileUrl: true, mimeType: true, fileSize: true, uploadedAt: true } },
                  },
                  orderBy: { expiryDate: 'asc' },
                },
                journeys: {
                  select: {
                    stage: { select: { name: true, displayName: true, icon: true, color: true, order: true } },
                    location: true,
                    latitude: true,
                    longitude: true,
                    actorName: true,
                    note: true,
                    imageUrls: true,
                    attachmentUrls: true,
                    createdAt: true,
                  },
                  orderBy: { createdAt: 'asc' },
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
            files: { select: { fileName: true, fileUrl: true, mimeType: true, fileSize: true, uploadedAt: true } },
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
      throw new NotFoundException('Không tìm thấy sản phẩm để truy xuất nguồn gốc');
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
        images: { where: { isPrimary: true }, take: 1, select: { imageUrl: true } },
        ocopLevel: { select: { level: true } },
      },
    });

    const batches = await Promise.all(product.inventories.flatMap((inventory) =>
      inventory.batches.map(async (batch) => ({
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
        certificates: await Promise.all(
          batch.certificates.map((certificate) => this.sanitizeCertificate(certificate)),
        ),
        journeys: batch.journeys.map((journey) => ({
          ...journey,
          batchNumber: batch.batchNumber,
        })),
      })),
    ));

    const supplyChainTimeline = batches
      .flatMap((batch) =>
        batch.journeys.map((journey) => ({
          stage: journey.stage,
          time: journey.createdAt,
          location: journey.location,
          latitude: journey.latitude,
          longitude: journey.longitude,
          actorName: journey.actorName,
          note: journey.note,
          imageUrls: journey.imageUrls,
          batchNumber: batch.batchNumber,
        })),
      )
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const certificates = [
      ...(await Promise.all(product.certificates.map((certificate) => this.sanitizeCertificate(certificate)))),
      ...batches.flatMap((batch) => batch.certificates),
    ].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    const latestCertificate = certificates
      .filter((certificate) => new Date(certificate.expiryDate).getTime() >= Date.now())
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())[0] ?? certificates[0] ?? null;

    const currentBatch = batches.find((batch) => batch.status === 'ACTIVE') ?? batches[0] ?? null;
    const currentStage = supplyChainTimeline[supplyChainTimeline.length - 1]?.stage ?? null;
    const latestOrderStatus = product.orderItems[0]?.order ?? null;

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
        harvestDate: product.harvestDate,
      },
      business: product.business,
      batches,
      supplyChainTimeline,
      certificates,
      warehouse: currentBatch?.warehouse ?? null,
      orderStatus: latestOrderStatus,
      summary: {
        currentStage,
        currentWarehouse: currentBatch?.warehouse ?? null,
        currentQuantity: currentBatch?.quantity ?? 0,
        productionDate: currentBatch?.manufactureDate ?? currentBatch?.harvestDate ?? product.harvestDate,
        expiryDate: currentBatch?.expiryDate ?? null,
        latestCertificate,
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

  private async sanitizeCertificate(certificate: any) {
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
    const txHash = blockchainRecord?.transactionHash ?? blockchainRecord?.txId ?? certificate.blockchainTxHash ?? null;

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
        timestamp: blockchainRecord?.confirmedAt ?? blockchainRecord?.createdAt ?? null,
      },
      files: await Promise.all(
        certificate.files.map(async (file: any) => ({
          ...file,
          fileUrl: await this.storageProvider.getDownloadUrl(file.fileUrl),
        })),
      ),
    };
  }
}
