import { objectContaining } from '../../../test/helpers/matchers';
import { ConflictException, GoneException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';
import { RedisService } from '../redis/redis.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('secure-hash'),
}));

describe('UsersService warehouse managers', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
    logisticsOrganization: {
      findFirst: jest.fn(),
    },
  };

  let service: UsersService;
  const redis = {
    deleteByPatterns: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  it('creates an active account with the dedicated warehouse manager role', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: 'warehouse-role-id' });
    prisma.user.create.mockResolvedValue({
      id: 'manager-1',
      email: 'manager@ocop.vn',
      fullName: 'Quản Lý Kho',
      role: { name: RoleName.WAREHOUSE_MANAGER },
    });

    const result = await service.createWarehouseManager({
      fullName: '  Quản Lý Kho  ',
      email: '  MANAGER@OCOP.VN ',
      password: 'Secure123',
      phone: ' 0901234567 ',
    });

    expect(argon2.hash).toHaveBeenCalledWith('Secure123', {
      type: argon2.argon2id,
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          email: 'manager@ocop.vn',
          fullName: 'Quản Lý Kho',
          phone: '0901234567',
          passwordHash: 'secure-hash',
          isActive: true,
          mustChangePassword: true,
          role: { connect: { id: 'warehouse-role-id' } },
        }),
      }),
    );
    expect(result.role.name).toBe(RoleName.WAREHOUSE_MANAGER);
    expect(redis.deleteByPatterns).not.toHaveBeenCalled();
  });

  it('rejects an email that already exists case-insensitively', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.createWarehouseManager({
        fullName: 'Quản Lý Kho',
        email: 'Manager@Ocop.vn',
        password: 'Secure123',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a Seller and its one-to-one profile atomically', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: 'seller-role-id' });
    prisma.user.create.mockResolvedValue({
      id: 'seller-1',
      email: 'seller@ocop.vn',
      fullName: 'Người bán OCOP',
      role: { name: RoleName.SELLER },
      sellerProfile: { id: 'profile-1', displayName: 'Người bán OCOP' },
    });

    await service.createSeller({
      fullName: ' Người bán OCOP ',
      email: ' SELLER@OCOP.VN ',
      password: 'Secure123',
      phone: ' 0901000000 ',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          mustChangePassword: true,
          role: { connect: { id: 'seller-role-id' } },
          sellerProfile: {
            create: {
              displayName: 'Người bán OCOP',
              email: 'seller@ocop.vn',
              phone: '0901000000',
            },
          },
        }),
      }),
    );
    expect(redis.deleteByPatterns).toHaveBeenCalledWith(
      expect.arrayContaining(['seller-profiles:list:*', 'products:list:*']),
    );
  });

  it('allows Admin workflow to deactivate and reactivate only Seller accounts', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'seller-1' });
    prisma.user.update.mockResolvedValue({ id: 'seller-1', isActive: false });

    const result = await service.updateSellerStatus('seller-1', false);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'seller-1', role: { name: RoleName.SELLER } },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'seller-1' },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
    expect(redis.deleteByPatterns).toHaveBeenCalled();
  });

  it('rejects creating legacy internal Logistics accounts', async () => {
    await expect(
      service.createLogisticsUser({
        fullName: ' Nhân viên giao hàng ',
        email: ' SHIPPER@OCOP.VN ',
        password: 'Secure123',
        phone: ' 0909000000 ',
        organizationId: '10000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toThrow(GoneException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects listing legacy internal Logistics accounts', async () => {
    await expect(service.getLogisticsUsers('giao')).rejects.toThrow(
      GoneException,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('includes warehouse managers in the assignable user filter', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.getUsers(true);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: objectContaining({
          role: {
            name: {
              in: [RoleName.WAREHOUSE_MANAGER],
            },
          },
          isActive: true,
        }),
      }),
    );
  });
});
