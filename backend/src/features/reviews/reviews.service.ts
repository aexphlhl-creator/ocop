import { Injectable, NotFoundException } from '@nestjs/common';
import { ReviewsRepository } from './reviews.repository';
import { CreateReviewDto } from './dto/create-review.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { ProductsRepository } from '../products/products.repository';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly productsRepository: ProductsRepository,
  ) {}

  async create(dto: CreateReviewDto, user: RequestUser) {
    const product = await this.productsRepository.findById(dto.productId);
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    const review = await this.reviewsRepository.create({
      product: { connect: { id: dto.productId } },
      user: { connect: { id: user.id } },
      rating: dto.rating,
      comment: dto.comment,
    });

    // Update product stats
    await this.reviewsRepository.updateProductStats(dto.productId);

    return review;
  }

  async getByProductId(productId: string) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    return this.reviewsRepository.findByProductId(productId);
  }

  async getAllReviews() {
    return this.reviewsRepository.findAll();
  }

  async delete(id: string) {
    const review = await this.reviewsRepository.delete(id);
    if (!review) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }
    
    // Update product stats after deleting review
    await this.reviewsRepository.updateProductStats(review.productId);
    
    return { success: true, message: 'Xóa đánh giá thành công' };
  }
}
