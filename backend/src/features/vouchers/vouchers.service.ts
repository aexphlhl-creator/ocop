import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { VouchersRepository } from './vouchers.repository';
import { CreateVoucherDto, ApplyVoucherDto } from './dto/voucher.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@Injectable()
export class VouchersService {
  constructor(private readonly vouchersRepository: VouchersRepository) {}

  async create(dto: CreateVoucherDto, user: RequestUser) {
    const sellerId =
      user.role === RoleName.SELLER ? user.id : (dto.sellerId ?? null);

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
      sellerId,
    });
  }

  async getAll(user: RequestUser) {
    if (user.role === RoleName.ADMIN) {
      return this.vouchersRepository.findAll();
    } else {
      return this.vouchersRepository.findAll(user.id);
    }
  }

  async apply(dto: ApplyVoucherDto) {
    const voucher = await this.vouchersRepository.findByCode(
      dto.code.toUpperCase(),
    );

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
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${Number(voucher.minOrderValue).toLocaleString('vi-VN')} đ`,
      );
    }

    const isPlatformVoucher = voucher.sellerId === null;
    if (!isPlatformVoucher && voucher.sellerId !== dto.sellerId) {
      throw new BadRequestException(
        'Mã giảm giá này không áp dụng cho gian hàng hiện tại',
      );
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

  async delete(id: string, user: RequestUser) {
    const voucher = await this.vouchersRepository.findById(id);
    if (!voucher) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    if (user.role !== RoleName.ADMIN && voucher.sellerId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền xóa mã giảm giá này');
    }

    const orderCount =
      (voucher._count?.platformOrders || 0) +
      (voucher._count?.shopOrders || 0) +
      voucher.usedCount;

    if (orderCount > 0) {
      await this.vouchersRepository.update(id, { isActive: false });
      return {
        id,
        message:
          'Mã giảm giá đã được sử dụng trong đơn hàng nên được chuyển sang trạng thái Đã khóa để bảo toàn lịch sử giao dịch.',
        deactivated: true,
      };
    }

    await this.vouchersRepository.delete(id);
    return {
      id,
      message: 'Xóa mã giảm giá thành công',
      deactivated: false,
    };
  }

  async toggleStatus(id: string, user: RequestUser) {
    const voucher = await this.vouchersRepository.findById(id);
    if (!voucher) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    if (user.role !== RoleName.ADMIN && voucher.sellerId !== user.id) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa trạng thái mã giảm giá này',
      );
    }

    const updated = await this.vouchersRepository.update(id, {
      isActive: !voucher.isActive,
    });

    return {
      id: updated.id,
      isActive: updated.isActive,
      message: updated.isActive
        ? 'Đã kích hoạt mã giảm giá'
        : 'Đã khóa mã giảm giá',
    };
  }
}
