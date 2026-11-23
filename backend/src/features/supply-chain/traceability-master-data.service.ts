import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { createHash } from 'crypto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTraceabilityLocationDto,
  CreateTraceabilityPartyDto,
  DeclareBatchOriginDto,
  LinkBatchMaterialDto,
} from './dto/traceability-master-data.dto';

@Injectable()
export class TraceabilityMasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  async listParties(currentUser: RequestUser) {
    return this.prisma.traceabilityParty.findMany({
      where:
        currentUser.role === RoleName.ADMIN
          ? undefined
          : {
              OR: [{ isVerified: true }, { createdById: currentUser.id }],
            },
      include: {
        locations: { orderBy: [{ isVerified: 'desc' }, { name: 'asc' }] },
        verifiedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
    });
  }

  async createParty(dto: CreateTraceabilityPartyDto, currentUser: RequestUser) {
    try {
      return await this.prisma.traceabilityParty.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          type: dto.type,
          gln: dto.gln?.trim() || null,
          taxCode: dto.taxCode?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          isVerified: false,
          verifiedAt: null,
          createdById: currentUser.id,
          verifiedById: null,
        },
      });
    } catch (error) {
      this.rethrowUnique(error, 'Mã chủ thể hoặc GLN đã tồn tại');
    }
  }

  async createLocation(
    partyId: string,
    dto: CreateTraceabilityLocationDto,
    currentUser: RequestUser,
  ) {
    const party = await this.prisma.traceabilityParty.findUnique({
      where: { id: partyId },
      select: { id: true, createdById: true, isVerified: true },
    });
    if (!party) throw new NotFoundException('Chủ thể nguồn gốc không tồn tại');
    const isOwner = party.createdById === currentUser.id;
    const isAdmin = currentUser.role === RoleName.ADMIN;
    const isSellerWithVerifiedParty =
      currentUser.role === RoleName.SELLER && party.isVerified;

    if (!isAdmin && !isOwner && !isSellerWithVerifiedParty) {
      throw new ForbiddenException(
        'Chỉ Admin, người tạo chủ thể hoặc Seller (đối với chủ thể đã xác minh) mới được thêm địa điểm',
      );
    }
    if ((dto.latitude == null) !== (dto.longitude == null)) {
      throw new BadRequestException(
        'Vĩ độ và kinh độ phải được cung cấp cùng nhau',
      );
    }

    try {
      return await this.prisma.traceabilityLocation.create({
        data: {
          partyId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          type: dto.type,
          gln: dto.gln?.trim() || null,
          address: dto.address.trim(),
          ward: dto.ward?.trim() || null,
          province: dto.province?.trim() || null,
          countryCode: (dto.countryCode ?? 'VN').toUpperCase(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          isVerified: false,
          createdById: currentUser.id,
        },
      });
    } catch (error) {
      this.rethrowUnique(error, 'Mã địa điểm hoặc GLN đã tồn tại');
    }
  }

  async verifyParty(
    partyId: string,
    verified: boolean,
    currentUser: RequestUser,
  ) {
    const party = await this.prisma.traceabilityParty.findUnique({
      where: { id: partyId },
      select: {
        id: true,
        _count: { select: { locations: true } },
      },
    });
    if (!party) throw new NotFoundException('Chủ thể nguồn gốc không tồn tại');
    if (verified && party._count.locations === 0) {
      throw new BadRequestException(
        'Không thể xác minh chủ thể khi chưa có địa điểm nguồn gốc',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.traceabilityParty.update({
        where: { id: partyId },
        data: {
          isVerified: verified,
          verifiedAt: verified ? new Date() : null,
          verifiedById: verified ? currentUser.id : null,
        },
      });
      await tx.traceabilityLocation.updateMany({
        where: { partyId },
        data: { isVerified: verified },
      });
      return updated;
    });
  }

  async declareBatchOrigin(
    batchId: string,
    dto: DeclareBatchOriginDto,
    currentUser: RequestUser,
  ) {
    if (!dto.harvestDate && !dto.manufactureDate) {
      throw new BadRequestException(
        'Phải có ngày thu hoạch hoặc ngày sản xuất/chế biến',
      );
    }
    const harvestDate = dto.harvestDate ? new Date(dto.harvestDate) : null;
    const manufactureDate = dto.manufactureDate
      ? new Date(dto.manufactureDate)
      : null;
    const now = Date.now();
    if (
      (harvestDate && harvestDate.getTime() > now) ||
      (manufactureDate && manufactureDate.getTime() > now)
    ) {
      throw new BadRequestException('Ngày nguồn gốc không được ở tương lai');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "inventory_batches"
        WHERE "id" = ${batchId}::uuid FOR UPDATE
      `;
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: batchId },
        include: {
          inventory: {
            include: {
              product: { include: { seller: true } },
              warehouse: true,
            },
          },
          originDeclarations: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: { revision: true },
          },
        },
      });
      if (!batch) throw new NotFoundException('Lô hàng không tồn tại');
      this.assertBatchWriteAccess(batch, currentUser);
      if (!['DRAFT', 'QUARANTINED'].includes(batch.lifecycleStatus)) {
        throw new BadRequestException(
          'Chỉ được khai báo nguồn gốc khi lô DRAFT hoặc đang cách ly trước kiểm định',
        );
      }

      if (
        batch.lifecycleStatus === 'QUARANTINED' &&
        (!dto.changeReason?.trim() || !dto.evidenceUrls?.length)
      ) {
        throw new BadRequestException(
          'Bổ sung hồ sơ lô cách ly phải có lý do và chứng từ nguồn gốc; không tự động phát hành lô',
        );
      }

      const party = await tx.traceabilityParty.findUnique({
        where: { id: dto.partyId },
      });
      const location = await tx.traceabilityLocation.findFirst({
        where: { id: dto.locationId, partyId: dto.partyId },
      });
      if (!party || !location) {
        throw new BadRequestException(
          'Chủ thể hoặc địa điểm nguồn gốc không hợp lệ',
        );
      }
      if (
        currentUser.role !== RoleName.ADMIN &&
        !party.isVerified &&
        party.createdById !== currentUser.id
      ) {
        throw new ForbiddenException(
          'Không được sử dụng chủ thể chưa xác minh của người khác',
        );
      }

      const previousRevision = batch.originDeclarations[0]?.revision ?? 0;
      if (previousRevision > 0 && !dto.changeReason?.trim()) {
        throw new BadRequestException(
          'Hiệu chỉnh nguồn gốc phải ghi rõ lý do thay đổi',
        );
      }
      const revision = previousRevision + 1;
      const countryCode = (
        dto.countryCode ?? location.countryCode
      ).toUpperCase();
      const partySnapshot: Prisma.InputJsonObject = {
        id: party.id,
        code: party.code,
        name: party.name,
        type: party.type,
        gln: party.gln,
        taxCode: party.taxCode,
        isVerified: party.isVerified,
      };
      const locationSnapshot: Prisma.InputJsonObject = {
        id: location.id,
        code: location.code,
        name: location.name,
        type: location.type,
        gln: location.gln,
        address: location.address,
        ward: location.ward,
        province: location.province,
        countryCode: location.countryCode,
        latitude: location.latitude?.toString() ?? null,
        longitude: location.longitude?.toString() ?? null,
        isVerified: location.isVerified,
      };
      const canonical = JSON.stringify({
        batchId,
        revision,
        party: partySnapshot,
        location: locationSnapshot,
        sourceLotCode: dto.sourceLotCode.trim(),
        countryCode,
        harvestDate: harvestDate?.toISOString() ?? null,
        manufactureDate: manufactureDate?.toISOString() ?? null,
        productionMethod: dto.productionMethod?.trim() ?? null,
        evidenceUrls: dto.evidenceUrls ?? [],
      });

      return tx.batchOriginDeclaration.create({
        data: {
          batchId,
          revision,
          partyId: party.id,
          partySnapshot,
          locationId: location.id,
          locationSnapshot,
          sourceLotCode: dto.sourceLotCode.trim(),
          countryCode,
          harvestDate,
          manufactureDate,
          productionMethod: dto.productionMethod?.trim() || null,
          evidenceUrls: dto.evidenceUrls ?? [],
          declarationHash: createHash('sha256').update(canonical).digest('hex'),
          changeReason: dto.changeReason?.trim() || null,
          declaredById: currentUser.id,
        },
        include: { party: true, location: true },
      });
    });
  }

  async linkInputMaterial(
    outputBatchId: string,
    dto: LinkBatchMaterialDto,
    currentUser: RequestUser,
  ) {
    if (dto.inputBatchId === outputBatchId) {
      throw new BadRequestException(
        'Lô đầu vào và đầu ra không được trùng nhau',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "inventory_batches"
        WHERE "id" IN (${dto.inputBatchId}::uuid, ${outputBatchId}::uuid)
        ORDER BY "id" FOR UPDATE
      `;
      const batches = await tx.inventoryBatch.findMany({
        where: { id: { in: [dto.inputBatchId, outputBatchId] } },
        include: {
          inventory: {
            include: {
              product: { include: { seller: true } },
              warehouse: true,
            },
          },
        },
      });
      const input = batches.find((batch) => batch.id === dto.inputBatchId);
      const output = batches.find((batch) => batch.id === outputBatchId);
      if (!input || !output) {
        throw new NotFoundException('Lô đầu vào hoặc đầu ra không tồn tại');
      }
      this.assertBatchWriteAccess(input, currentUser);
      this.assertBatchWriteAccess(output, currentUser);

      const allLinks = await tx.batchMaterialLink.findMany({
        select: { inputBatchId: true, outputBatchId: true },
      });
      if (this.hasPath(allLinks, outputBatchId, dto.inputBatchId)) {
        throw new BadRequestException(
          'Quan hệ này tạo vòng lặp trong phả hệ lô hàng',
        );
      }

      const priorUsage = await tx.batchMaterialLink.findMany({
        where: { inputBatchId: dto.inputBatchId },
        select: { quantity: true, unit: true },
      });
      if (priorUsage.some((item) => item.unit !== dto.unit.trim())) {
        throw new BadRequestException(
          'Không thể cộng dồn lượng sử dụng khi đơn vị không đồng nhất',
        );
      }
      const totalUsed = priorUsage.reduce(
        (sum, item) => sum + Number(item.quantity),
        dto.quantity,
      );
      if (totalUsed > input.initialQuantity) {
        throw new BadRequestException(
          `Tổng lượng nguyên liệu ${totalUsed} vượt số lượng ban đầu ${input.initialQuantity}`,
        );
      }

      try {
        return await tx.batchMaterialLink.create({
          data: {
            inputBatchId: dto.inputBatchId,
            outputBatchId,
            quantity: dto.quantity,
            unit: dto.unit.trim(),
            processReference: dto.processReference.trim(),
            evidenceUrls: dto.evidenceUrls ?? [],
            createdById: currentUser.id,
          },
          include: {
            inputBatch: {
              include: { inventory: { include: { product: true } } },
            },
          },
        });
      } catch (error) {
        this.rethrowUnique(
          error,
          'Quan hệ lô đầu vào/đầu ra với mã công đoạn này đã tồn tại',
        );
      }
    });
  }

  private hasPath(
    links: Array<{ inputBatchId: string; outputBatchId: string }>,
    start: string,
    target: string,
  ) {
    const nextByInput = new Map<string, string[]>();
    for (const link of links) {
      nextByInput.set(link.inputBatchId, [
        ...(nextByInput.get(link.inputBatchId) ?? []),
        link.outputBatchId,
      ]);
    }
    const queue = [start];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...(nextByInput.get(current) ?? []));
    }
    return false;
  }

  private assertBatchWriteAccess(
    batch: {
      inventory: {
        product: { sellerId: string };
        warehouse: { managerId: string | null };
      };
    },
    currentUser: RequestUser,
  ) {
    const allowed =
      (currentUser.role === RoleName.SELLER &&
        batch.inventory.product.sellerId === currentUser.id) ||
      (currentUser.role === RoleName.WAREHOUSE_MANAGER &&
        batch.inventory.warehouse.managerId === currentUser.id);
    if (!allowed) {
      throw new ForbiddenException(
        'Bạn không có quyền khai báo nguồn gốc cho lô này',
      );
    }
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
