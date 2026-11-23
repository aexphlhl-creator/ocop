import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { CreateWarehouseManagerDto } from './dto/create-warehouse-manager.dto';
import { CreateLogisticsUserDto } from './dto/create-logistics-user.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createSeller(dto: CreateWarehouseManagerDto) {
    const seller = await this.createOperationalUser(
      dto,
      RoleName.SELLER,
      'người bán',
      undefined,
      true,
    );
    await this.invalidateSellerCaches();
    return seller;
  }

  async createWarehouseManager(dto: CreateWarehouseManagerDto) {
    return this.createOperationalUser(
      dto,
      RoleName.WAREHOUSE_MANAGER,
      'quản lý kho',
    );
  }

  async createQualityAssurance(dto: CreateWarehouseManagerDto) {
    return this.createOperationalUser(dto, RoleName.QUALITY_ASSURANCE, 'QA/QC');
  }

  async getQualityAssuranceUsers(search?: string) {
    return this.prisma.user.findMany({
      where: {
        role: { name: RoleName.QUALITY_ASSURANCE },
        isActive: true,
        ...(search?.trim()
          ? {
              OR: [
                {
                  fullName: {
                    contains: search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  email: {
                    contains: search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        role: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async updateSellerStatus(sellerId: string, isActive: boolean) {
    const seller = await this.prisma.user.findFirst({
      where: { id: sellerId, role: { name: RoleName.SELLER } },
      select: { id: true },
    });
    if (!seller) {
      throw new NotFoundException('Không tìm thấy tài khoản SELLER');
    }

    const updated = await this.prisma.user.update({
      where: { id: sellerId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        role: { select: { name: true } },
        sellerProfile: {
          select: { id: true, displayName: true, isVerified: true },
        },
      },
    });
    await this.invalidateSellerCaches();
    return updated;
  }

  createLogisticsUser(dto: CreateLogisticsUserDto) {
    void dto;
    return Promise.reject(
      new GoneException(
        'Hệ thống không tạo tài khoản nhân viên vận chuyển nội bộ. Hãy cấu hình hãng vận chuyển và nhận trạng thái qua webhook/API của hãng.',
      ),
    );
  }

  private async createOperationalUser(
    dto: CreateWarehouseManagerDto,
    roleName: RoleName,
    roleLabel: string,
    logisticsOrganizationId?: string,
    createSellerProfile = false,
  ) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      select: { id: true },
    });
    if (!role) {
      throw new ConflictException(
        `Hệ thống chưa thiết lập vai trò ${roleLabel}. Vui lòng chạy migration mới nhất.`,
      );
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      return await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          role: { connect: { id: role.id } },
          ...(createSellerProfile
            ? {
                sellerProfile: {
                  create: {
                    displayName: dto.fullName.trim(),
                    email,
                    phone: dto.phone?.trim() || null,
                  },
                },
              }
            : {}),
          ...(logisticsOrganizationId
            ? {
                logisticsMemberships: {
                  create: {
                    organizationId: logisticsOrganizationId,
                    isActive: true,
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          isActive: true,
          mustChangePassword: true,
          role: { select: { name: true } },
          sellerProfile: {
            select: { id: true, displayName: true, isVerified: true },
          },
          logisticsMemberships: {
            where: { isActive: true },
            select: {
              organization: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email đã được sử dụng');
      }
      throw error;
    }
  }

  getLogisticsUsers(search?: string, organizationId?: string) {
    void search;
    void organizationId;
    return Promise.reject(
      new GoneException(
        'Danh sách nhân viên vận chuyển nội bộ đã ngừng dùng. Shipment chỉ theo dõi hãng vận chuyển và mã vận đơn.',
      ),
    );
  }

  async getUsers(
    assignable: boolean,
    search?: string,
    page: number = 1,
    limit: number = 50,
    sort: string = 'fullName',
    order: 'asc' | 'desc' = 'asc',
  ) {
    const whereClause: Prisma.UserWhereInput = {};

    if (assignable) {
      whereClause.role = {
        name: {
          in: [RoleName.WAREHOUSE_MANAGER],
        },
      };
      whereClause.isActive = true;
    }

    if (search) {
      whereClause.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;
    const orderBy: Prisma.UserOrderByWithRelationInput =
      sort === 'email'
        ? { email: order }
        : sort === 'createdAt'
          ? { createdAt: order }
          : { fullName: order };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: { select: { name: true } },
          sellerProfile: { select: { displayName: true } },
        },
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.user.count({ where: whereClause }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async invalidateSellerCaches() {
    await this.redis.deleteByPatterns([
      'seller-profiles:list:*',
      'products:list:*',
      'dashboard:*',
      'statistics:*',
    ]);
  }
}
