import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/supplier.dto';
import { Prisma, RoleName } from '@prisma/client';
import { createPaginationResponse } from '../../../common/pagination/pagination.helper';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  private async getBusinessIdForUser(user: RequestUser): Promise<string | undefined> {
    if (user.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({ where: { userId: user.id } });
      return business?.id;
    }
    return undefined;
  }

  async createSupplier(dto: CreateSupplierDto) {
    const code = await this.generateSupplierCode();
    return this.prisma.supplier.create({
      data: {
        ...dto,
        code,
      },
    });
  }

  async getSuppliers(query: any, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const { 
      page = 1, limit = 50, search, 
      supplierType, isActive, country, province,
      sort = 'createdAt', order = 'desc' 
    } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.SupplierWhereInput = {
      ...(businessId ? { businessId } : {}),
      ...(supplierType ? { supplierType } : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      ...(country ? { country } : {}),
      ...(province ? { province } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sort]: order },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return createPaginationResponse(items, total, Number(page), Number(limit));
  }

  async getSupplierById(id: string, user: RequestUser) {
    const businessId = await this.getBusinessIdForUser(user);
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!supplier || (businessId && supplier.businessId !== businessId)) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }
    return supplier;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, user: RequestUser) {
    await this.getSupplierById(id, user); // Validate existence and ownership
    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async deleteSupplier(id: string, user: RequestUser) {
    await this.getSupplierById(id, user); // Validate existence and ownership
    // Soft delete if possible, or actual delete
    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async generateSupplierCode(): Promise<string> {
    const count = await this.prisma.supplier.count();
    return `SUP-${(count + 1).toString().padStart(5, '0')}`;
  }
}
