import { Injectable } from '@nestjs/common';
import { CertificateStatus, Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CertificatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTypes() {
    return this.prisma.certificateType.findMany({ orderBy: { name: 'asc' } });
  }

  async findAndCount(params: {
    skip: number;
    take: number;
    certificateTypeId?: string;
    status?: CertificateStatus;
    productId?: string;
    batchId?: string;
    expiryFrom?: Date;
    expiryTo?: Date;
    search?: string;
    userContext: { id: string; role: RoleName };
  }) {
    const where = this.buildWhere(params);
    const [items, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: this.include,
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string, userContext: { id: string; role: RoleName }) {
    return this.prisma.certificate.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.roleScope(userContext),
      },
      include: this.include,
    });
  }

  async findByProduct(productId: string, userContext: { id: string; role: RoleName }) {
    return this.prisma.certificate.findMany({
      where: { productId, deletedAt: null, ...this.roleScope(userContext) },
      include: this.include,
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findByBatch(batchId: string, userContext: { id: string; role: RoleName }) {
    return this.prisma.certificate.findMany({
      where: { batchId, deletedAt: null, ...this.roleScope(userContext) },
      include: this.include,
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findExpiring(daysAhead: number, userContext: { id: string; role: RoleName }) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);

    return this.prisma.certificate.findMany({
      where: {
        deletedAt: null,
        expiryDate: { gte: now, lte: cutoff },
        ...this.roleScope(userContext),
      },
      include: this.include,
      orderBy: { expiryDate: 'asc' },
    });
  }

  async create(data: Prisma.CertificateCreateInput) {
    return this.prisma.certificate.create({
      data,
      include: this.include,
    });
  }

  async update(id: string, data: Prisma.CertificateUpdateInput) {
    return this.prisma.certificate.update({
      where: { id },
      data,
      include: this.include,
    });
  }

  async softDelete(id: string) {
    return this.prisma.certificate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findSoftDeletedFiles() {
    const certificates = await this.prisma.certificate.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        deletedAt: true,
        files: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            mimeType: true,
            fileSize: true,
            uploadedAt: true,
          },
        },
      },
      orderBy: { deletedAt: 'asc' },
    });

    return certificates.flatMap((certificate) =>
      certificate.files.map((file) => ({
        certificateId: certificate.id,
        deletedAt: certificate.deletedAt,
        ...file,
      })),
    );
  }

  async certificateTypeExists(id: string) {
    return !!(await this.prisma.certificateType.findUnique({ where: { id } }));
  }

  async productExists(id: string) {
    return !!(await this.prisma.product.findFirst({ where: { id, deletedAt: null } }));
  }

  async batchExists(id: string) {
    return !!(await this.prisma.inventoryBatch.findUnique({ where: { id } }));
  }

  async userOwnsProduct(productId: string, userId: string) {
    return !!(await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, business: { userId } },
    }));
  }

  async userOwnsBatch(batchId: string, userId: string) {
    return !!(await this.prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        inventory: { product: { business: { userId } } },
      },
    }));
  }

  async findProductIdByBatchId(batchId: string) {
    const batch = await this.prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { inventory: { select: { productId: true } } },
    });

    return batch?.inventory.productId ?? null;
  }

  private buildWhere(params: {
    certificateTypeId?: string;
    status?: CertificateStatus;
    productId?: string;
    batchId?: string;
    expiryFrom?: Date;
    expiryTo?: Date;
    search?: string;
    userContext: { id: string; role: RoleName };
  }): Prisma.CertificateWhereInput {
    const where: Prisma.CertificateWhereInput = {
      deletedAt: null,
      ...this.roleScope(params.userContext),
    };

    if (params.certificateTypeId) where.certificateTypeId = params.certificateTypeId;
    if (params.status) where.status = params.status;
    if (params.productId) where.productId = params.productId;
    if (params.batchId) where.batchId = params.batchId;
    if (params.expiryFrom || params.expiryTo) {
      where.expiryDate = {};
      if (params.expiryFrom) where.expiryDate.gte = params.expiryFrom;
      if (params.expiryTo) where.expiryDate.lte = params.expiryTo;
    }
    if (params.search) {
      where.OR = [
        { certificateNumber: { contains: params.search, mode: 'insensitive' } },
        { issuingOrganization: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private roleScope(userContext: { id: string; role: RoleName }): Prisma.CertificateWhereInput {
    if (userContext.role !== RoleName.SELLER) return {};

    return {
      OR: [
        { product: { business: { userId: userContext.id } } },
        { batch: { inventory: { product: { business: { userId: userContext.id } } } } },
      ],
    };
  }

  private readonly include = {
    certificateType: true,
    product: { select: { id: true, name: true, businessId: true } },
    batch: { select: { id: true, batchNumber: true, expiryDate: true } },
    files: { orderBy: { uploadedAt: 'desc' as const } },
    createdBy: { select: { id: true, fullName: true, email: true } },
  };
}
