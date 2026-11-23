import { objectContaining } from '../../../test/helpers/matchers';
import { BadRequestException } from '@nestjs/common';
import {
  RoleName,
  TraceabilityLocationType,
  TraceabilityPartyType,
} from '@prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TraceabilityMasterDataService } from './traceability-master-data.service';

const seller: RequestUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'seller@example.com',
  fullName: 'Seller',
  phone: null,
  role: RoleName.SELLER,
  isActive: true,
  mustChangePassword: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const admin: RequestUser = {
  ...seller,
  id: '00000000-0000-4000-8000-000000000002',
  email: 'admin@example.com',
  role: RoleName.ADMIN,
};

describe('TraceabilityMasterDataService', () => {
  const prisma = {
    traceabilityParty: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    traceabilityLocation: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: TraceabilityMasterDataService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TraceabilityMasterDataService(
      prisma as unknown as PrismaService,
    );
  });

  it('normalizes party identity and keeps seller declarations unverified', async () => {
    let capturedData: Record<string, unknown> | undefined;
    prisma.traceabilityParty.create.mockImplementation((args: unknown) => {
      const { data } = args as { data: Record<string, unknown> };
      capturedData = data;
      return Promise.resolve({ id: 'party-1', ...data });
    });

    const result = await service.createParty(
      {
        code: '  htx-ocop-01  ',
        name: '  Hợp tác xã OCOP  ',
        type: TraceabilityPartyType.PRODUCER,
        email: '  ORIGIN@EXAMPLE.COM ',
      },
      seller,
    );

    expect(capturedData).toMatchObject({
      code: 'HTX-OCOP-01',
      name: 'Hợp tác xã OCOP',
      email: 'origin@example.com',
      isVerified: false,
      verifiedAt: null,
      verifiedById: null,
    });
    expect(result).toEqual(objectContaining({ id: 'party-1' }));
  });

  it('does not auto-verify master data created by an admin', async () => {
    let capturedData: Record<string, unknown> | undefined;
    prisma.traceabilityParty.create.mockImplementation((args: unknown) => {
      const { data } = args as { data: Record<string, unknown> };
      capturedData = data;
      return Promise.resolve({ id: 'party-2', ...data });
    });

    await service.createParty(
      {
        code: 'ADMIN-SOURCE-01',
        name: 'Nguồn do Admin khai báo',
        type: TraceabilityPartyType.PRODUCER,
      },
      admin,
    );

    expect(capturedData).toMatchObject({
      isVerified: false,
      verifiedAt: null,
      verifiedById: null,
      createdById: admin.id,
    });
  });

  it('requires a physical source location before verification', async () => {
    prisma.traceabilityParty.findUnique.mockResolvedValue({
      id: 'party-1',
      _count: { locations: 0 },
    });

    await expect(service.verifyParty('party-1', true, admin)).rejects.toThrow(
      new BadRequestException(
        'Không thể xác minh chủ thể khi chưa có địa điểm nguồn gốc',
      ),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires harvest or manufacture date for an origin revision', async () => {
    await expect(
      service.declareBatchOrigin(
        '00000000-0000-4000-8000-000000000010',
        {
          partyId: '00000000-0000-4000-8000-000000000020',
          locationId: '00000000-0000-4000-8000-000000000030',
          sourceLotCode: 'SOURCE-LOT-01',
        },
        seller,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Phải có ngày thu hoạch hoặc ngày sản xuất/chế biến',
      ),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a self-referencing material genealogy edge', async () => {
    const batchId = '00000000-0000-4000-8000-000000000010';

    await expect(
      service.linkInputMaterial(
        batchId,
        {
          inputBatchId: batchId,
          quantity: 1,
          unit: 'kg',
          processReference: 'PROCESS-01',
        },
        seller,
      ),
    ).rejects.toThrow(
      new BadRequestException('Lô đầu vào và đầu ra không được trùng nhau'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires paired coordinates for source locations', async () => {
    prisma.traceabilityParty.findUnique.mockResolvedValue({
      id: 'party-1',
      createdById: seller.id,
      isVerified: false,
    });

    await expect(
      service.createLocation(
        'party-1',
        {
          code: 'FARM-01',
          name: 'Vùng nguyên liệu',
          type: TraceabilityLocationType.FARM,
          address: 'Lâm Đồng',
          latitude: 11.9,
        },
        seller,
      ),
    ).rejects.toThrow(
      new BadRequestException('Vĩ độ và kinh độ phải được cung cấp cùng nhau'),
    );
  });

  it('allows seller to create location under a verified party created by admin', async () => {
    prisma.traceabilityParty.findUnique.mockResolvedValue({
      id: 'party-admin',
      createdById: admin.id,
      isVerified: true,
    });
    prisma.traceabilityLocation.create.mockResolvedValue({
      id: 'loc-1',
      partyId: 'party-admin',
      code: 'FARM-02',
      name: 'Vườn chè',
      isVerified: false,
    });

    const result = await service.createLocation(
      'party-admin',
      {
        code: 'FARM-02',
        name: 'Vườn chè',
        type: TraceabilityLocationType.FARM,
        address: 'Thái Nguyên',
      },
      seller,
    );

    expect(result).toEqual(objectContaining({ id: 'loc-1' }));
    expect(prisma.traceabilityLocation.create).toHaveBeenCalledWith({
      data: objectContaining({
        partyId: 'party-admin',
        code: 'FARM-02',
        createdById: seller.id,
        isVerified: false,
      }),
    });
  });

  it('forbids seller from creating location under unverified party of another user', async () => {
    prisma.traceabilityParty.findUnique.mockResolvedValue({
      id: 'party-other',
      createdById: 'other-user-id',
      isVerified: false,
    });

    await expect(
      service.createLocation(
        'party-other',
        {
          code: 'FARM-03',
          name: 'Vườn khác',
          type: TraceabilityLocationType.FARM,
          address: 'Hà Nội',
        },
        seller,
      ),
    ).rejects.toThrow(
      'Chỉ Admin, người tạo chủ thể hoặc Seller (đối với chủ thể đã xác minh) mới được thêm địa điểm',
    );
  });
});
