import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateStatus, Prisma, RoleName } from '@prisma/client';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { BlockchainQueueService } from '../blockchain-queue/blockchain-queue.service';
import { CertificatesRepository } from './certificates.repository';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { GetCertificatesQueryDto } from './dto/get-certificates-query.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';
import type { StorageProvider } from './storage/storage-provider.interface';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly certificatesRepository: CertificatesRepository,
    private readonly blockchainQueueService: BlockchainQueueService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async getTypes() {
    return this.certificatesRepository.findTypes();
  }

  async findAll(query: GetCertificatesQueryDto, currentUser: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.certificatesRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      certificateTypeId: query.certificateTypeId,
      status: query.status,
      productId: query.productId,
      batchId: query.batchId,
      expiryFrom: query.expiryFrom ? new Date(query.expiryFrom) : undefined,
      expiryTo: query.expiryTo ? new Date(query.expiryTo) : undefined,
      search: query.search,
      userContext: currentUser,
    });
    return createPaginationResponse(await this.attachDownloadUrls(items), total, page, limit);
  }

  async findOne(id: string, currentUser: RequestUser) {
    const certificate = await this.certificatesRepository.findById(id, currentUser);
    if (!certificate) {
      throw new NotFoundException('Không tìm thấy chứng nhận');
    }
    return this.attachDownloadUrls(certificate);
  }

  async create(dto: CreateCertificateDto, files: Express.Multer.File[], currentUser: RequestUser) {
    await this.validateReferences(dto, currentUser, true);
    const storedFiles = await this.storeFiles(files);
    if (storedFiles.length === 0) {
      throw new BadRequestException('Cần tải lên ít nhất một file chứng nhận để tạo documentHash');
    }

    const data: Prisma.CertificateCreateInput = {
      certificateNumber: dto.certificateNumber,
      issuingOrganization: dto.issuingOrganization,
      issueDate: new Date(dto.issueDate),
      expiryDate: new Date(dto.expiryDate),
      status: dto.status ?? CertificateStatus.ACTIVE,
      verificationUrl: dto.verificationUrl ?? null,
      note: dto.note ?? null,
      documentHash: storedFiles[0].documentHash,
      certificateType: { connect: { id: dto.certificateTypeId } },
      createdBy: { connect: { id: currentUser.id } },
      product: dto.productId ? { connect: { id: dto.productId } } : undefined,
      batch: dto.batchId ? { connect: { id: dto.batchId } } : undefined,
      files: {
        create: storedFiles.map(({ documentHash: _documentHash, ...file }) => file),
      },
    };

    const certificate = await this.certificatesRepository.create(data);
    this.enqueueCertificateRecord(certificate, currentUser.id);

    return this.attachDownloadUrls(certificate);
  }

  async update(
    id: string,
    dto: UpdateCertificateDto,
    files: Express.Multer.File[],
    currentUser: RequestUser,
  ) {
    const existing = await this.findOne(id, currentUser);
    await this.validateReferences(dto, currentUser, false);

    const storedFiles = await this.storeFiles(files);
    const data: Prisma.CertificateUpdateInput = {
      certificateNumber: dto.certificateNumber,
      issuingOrganization: dto.issuingOrganization,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      status: dto.status,
      verificationUrl: dto.verificationUrl,
      note: dto.note,
      certificateType: dto.certificateTypeId ? { connect: { id: dto.certificateTypeId } } : undefined,
      product: dto.productId !== undefined
        ? dto.productId ? { connect: { id: dto.productId } } : { disconnect: true }
        : undefined,
      batch: dto.batchId !== undefined
        ? dto.batchId ? { connect: { id: dto.batchId } } : { disconnect: true }
        : undefined,
      documentHash: storedFiles[0]?.documentHash ?? existing.documentHash,
      files: storedFiles.length > 0
        ? { create: storedFiles.map(({ documentHash: _documentHash, ...file }) => file) }
        : undefined,
    };

    return this.attachDownloadUrls(await this.certificatesRepository.update(id, data));
  }

  async remove(id: string, currentUser: RequestUser) {
    await this.findOne(id, currentUser);
    await this.certificatesRepository.softDelete(id);
    return { id, message: 'Xóa mềm chứng nhận thành công' };
  }

  async findByProduct(productId: string, currentUser: RequestUser) {
    return this.attachDownloadUrls(await this.certificatesRepository.findByProduct(productId, currentUser));
  }

  async findByBatch(batchId: string, currentUser: RequestUser) {
    return this.attachDownloadUrls(await this.certificatesRepository.findByBatch(batchId, currentUser));
  }

  async findExpiring(daysAhead: number, currentUser: RequestUser) {
    return this.attachDownloadUrls(await this.certificatesRepository.findExpiring(daysAhead, currentUser));
  }

  async cleanup(currentUser: RequestUser) {
    if (currentUser.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN được phép chạy cleanup certificate storage');
    }

    const candidates = await this.certificatesRepository.findSoftDeletedFiles();
    return {
      dryRun: true,
      candidates: candidates.length,
      files: candidates,
      message: 'Cleanup đang ở chế độ chuẩn bị; file chưa bị xóa khỏi MinIO.',
    };
  }

  async getDashboardStats(currentUser: RequestUser) {
    const [all, expiring] = await Promise.all([
      this.certificatesRepository.findAndCount({
        skip: 0,
        take: 1,
        userContext: currentUser,
      }),
      this.findExpiring(30, currentUser),
    ]);

    const expired = await this.certificatesRepository.findAndCount({
      skip: 0,
      take: 1,
      expiryTo: new Date(),
      userContext: currentUser,
    });

    const activeItems = await this.certificatesRepository.findAndCount({
      skip: 0,
      take: 1000,
      userContext: currentUser,
    });

    const byType = activeItems.items.reduce((acc: Record<string, number>, cert: any) => {
      const key = cert.certificateType?.name ?? 'Khác';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total: all.total,
      expiringSoon: expiring.length,
      expired: expired.total,
      byType,
    };
  }

  private async validateReferences(
    dto: Partial<CreateCertificateDto>,
    currentUser: RequestUser,
    requireTarget: boolean,
  ) {
    if (!requireTarget && dto.productId === undefined && dto.batchId === undefined) {
      if (dto.certificateTypeId && !(await this.certificatesRepository.certificateTypeExists(dto.certificateTypeId))) {
        throw new NotFoundException('Loại chứng nhận không tồn tại');
      }
      return;
    }
    if (!dto.productId && !dto.batchId) {
      throw new BadRequestException('Chứng nhận phải gắn với Product hoặc Batch');
    }
    if (dto.certificateTypeId && !(await this.certificatesRepository.certificateTypeExists(dto.certificateTypeId))) {
      throw new NotFoundException('Loại chứng nhận không tồn tại');
    }
    if (dto.productId && !(await this.certificatesRepository.productExists(dto.productId))) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }
    if (dto.batchId && !(await this.certificatesRepository.batchExists(dto.batchId))) {
      throw new NotFoundException('Batch không tồn tại');
    }
    if (currentUser.role === RoleName.SELLER) {
      const ownsProduct = dto.productId
        ? await this.certificatesRepository.userOwnsProduct(dto.productId, currentUser.id)
        : true;
      const ownsBatch = dto.batchId
        ? await this.certificatesRepository.userOwnsBatch(dto.batchId, currentUser.id)
        : true;
      if (!ownsProduct || !ownsBatch) {
        throw new ForbiddenException('Bạn không có quyền thao tác chứng nhận này');
      }
    }
  }

  private async storeFiles(files: Express.Multer.File[] = []) {
    return Promise.all(files.map((file) => this.storageProvider.upload(file, 'certificates')));
  }

  private enqueueCertificateRecord(certificate: {
    id: string;
    productId: string | null;
    batchId: string | null;
    documentHash: string;
  }, actorId: string) {
    void this.resolveCertificateProductId(certificate)
      .then((productId) => {
        if (!productId) {
          return undefined;
        }

        return this.blockchainQueueService.addCertificateRecordJob({
          certificateId: certificate.id,
          productId,
          batchId: certificate.batchId,
          documentHash: certificate.documentHash,
          actorId,
        });
      })
      .catch(() => undefined);
  }

  private async resolveCertificateProductId(certificate: {
    productId: string | null;
    batchId: string | null;
  }) {
    if (certificate.productId) {
      return certificate.productId;
    }
    if (!certificate.batchId) {
      return null;
    }

    return this.certificatesRepository.findProductIdByBatchId(certificate.batchId);
  }

  private async attachDownloadUrls<T>(payload: T): Promise<T> {
    if (Array.isArray(payload)) {
      return Promise.all(payload.map((item) => this.attachDownloadUrlsToCertificate(item))) as Promise<T>;
    }
    return this.attachDownloadUrlsToCertificate(payload) as Promise<T>;
  }

  private async attachDownloadUrlsToCertificate<T>(certificate: T): Promise<T> {
    const target = certificate as any;
    if (!target?.files || !Array.isArray(target.files)) {
      return certificate;
    }

    return {
      ...target,
      files: await Promise.all(
        target.files.map(async (file: any) => ({
          ...file,
          fileUrl: await this.storageProvider.getDownloadUrl(file.fileUrl),
        })),
      ),
    };
  }
}
