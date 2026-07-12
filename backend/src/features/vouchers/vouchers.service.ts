import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { VouchersRepository } from './vouchers.repository';
import { CreateVoucherDto, ApplyVoucherDto } from './dto/voucher.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';
import { BusinessesRepository } from '../businesses/businesses.repository';

@Injectable()
export class VouchersService {
  constructor(
    private readonly vouchersRepository: VouchersRepository,
    private readonly businessesRepository: BusinessesRepository,
  ) {}

  async create(dto: CreateVoucherDto, user: RequestUser) {
    let businessId = null;

    if (user.role === RoleName.SELLER) {
      const business = await this.businessesRepository.findByUserId(user.id);
      if (!business) {
        throw new BadRequestException('Bạn chưa có cửa hàng để tạo mã giảm giá');
      }
      businessId = business.id;
    }
    // If ADMIN, businessId remains null -> Platform Voucher

    const existing = await this.vouchersRepository.findByCode(dto.code);
    if (existing) {
      throw new BadRequestException('Mã giảm giá này đã tồn tại');
    }

    return this.vouchersRepository.create({
      code: dto.code.toUpperCase(),
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderValue: dto.minOrderValue,
      maxDiscount: dto.maxDiscount,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      usageLimit: dto.usageLimit,
      isActive: dto.isActive !== false,
      businessId,
    });
  }

  async getAll(user: RequestUser) {
    if (user.role === RoleName.ADMIN) {
      return this.vouchersRepository.findAll();
    } else {
      const business = await this.businessesRepository.findByUserId(user.id);
      if (!business) return [];
      return this.vouchersRepository.findAll(business.id);
    }
  }

  async apply(dto: ApplyVoucherDto) {
    const voucher = await this.vouchersRepository.findByCode(dto.code.toUpperCase());
    
    if (!voucher) {
      throw new NotFoundException('Mã giảm giá không tồn tại');
    }
    if (!voucher.isActive) {
      throw new BadRequestException('Mã giảm giá đã bị khóa');
    }
    
    const now = new Date();
    if (now < voucher.startDate) {
      throw new BadRequestException('Mã giảm giá chưa có hiệu lực');
    }
    if (now > voucher.endDate) {
      throw new BadRequestException('Mã giảm giá đã hết hạn');
    }
    if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }
    if (dto.orderValue < voucher.minOrderValue) {
      throw new BadRequestException(`Đơn hàng chưa đạt giá trị tối thiểu ${Number(voucher.minOrderValue).toLocaleString('vi-VN')} đ`);
    }

    // Check if voucher is applicable to this business
    // If businessId is null, it's a platform voucher (applicable to all).
    // If businessId is set, it must match the order's businessId.
    const isPlatformVoucher = voucher.businessId === null;
    if (!isPlatformVoucher && voucher.businessId !== dto.businessId) {
      throw new BadRequestException('Mã giảm giá này không áp dụng cho gian hàng hiện tại');
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (voucher.discountType === 'FIXED_AMOUNT') {
      discountAmount = voucher.discountValue;
    } else {
      discountAmount = (dto.orderValue * voucher.discountValue) / 100;
      if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
        discountAmount = voucher.maxDiscount;
      }
    }

    // Don't discount more than the order value
    if (discountAmount > dto.orderValue) {
      discountAmount = dto.orderValue;
    }

    return {
      id: voucher.id,
      code: voucher.code,
      type: isPlatformVoucher ? 'PLATFORM' : 'SHOP',
      discountAmount,
    };
  }
}
