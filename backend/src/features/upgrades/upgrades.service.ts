import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UpgradesRepository } from './upgrades.repository';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { UpgradeStatus } from '@prisma/client';
import { ProductsRepository } from '../products/products.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UpgradesService {
  constructor(
    private readonly upgradesRepository: UpgradesRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createRequest(
    businessId: string, 
    productId: string, 
    targetLevelId: string, 
    reason: string, 
    documentUrls: string[]
  ) {
    const product = await this.productsRepository.findById(productId);
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    if (product.businessId !== businessId) throw new BadRequestException('Sản phẩm không thuộc doanh nghiệp của bạn');

    // Check if there's already a pending request for this product
    const existing = await this.prisma.ocopUpgradeRequest.findFirst({
      where: { productId, status: 'PENDING' }
    });
    if (existing) {
      throw new BadRequestException('Sản phẩm này đang có yêu cầu nâng hạng chờ duyệt');
    }

    return this.upgradesRepository.create({
      product: { connect: { id: productId } },
      business: { connect: { id: businessId } },
      currentLevel: { connect: { id: product.ocopLevelId } },
      targetLevel: { connect: { id: targetLevelId } },
      reason,
      documentUrls,
    });
  }

  async getMyRequests(businessId: string) {
    return this.upgradesRepository.findByBusinessId(businessId);
  }

  async getAllRequests() {
    return this.upgradesRepository.findAll();
  }

  async updateStatus(id: string, status: UpgradeStatus, adminComment?: string) {
    const request = await this.upgradesRepository.findById(id);
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu');
    
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu này đã được xử lý');
    }

    // Update the request status
    const updated = await this.upgradesRepository.updateStatus(id, status, adminComment);

    // If APPROVED, update the product's ocopLevel
    if (status === 'APPROVED') {
      await this.prisma.product.update({
        where: { id: request.productId },
        data: { ocopLevelId: request.targetLevelId }
      });
    }

    return updated;
  }
}
