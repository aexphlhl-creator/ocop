import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.OrderCreateInput) {
    return this.prisma.order.create({
      data,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
              }
            }
          }
        },
        business: {
          select: {
            id: true,
            name: true,
          }
        },
        tracking: {
          orderBy: { createdAt: 'asc' }
        }
      },
    });
  }

  async findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
              }
            }
          }
        },
        business: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          }
        },
        tracking: {
          orderBy: { createdAt: 'asc' }
        }
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
              }
            }
          }
        },
        business: {
          select: {
            id: true,
            name: true,
          }
        },
        tracking: {
          orderBy: { createdAt: 'asc' }
        }
      },
    });
  }

  async findBySellerId(sellerId: string) {
    return this.prisma.order.findMany({
      where: {
        business: {
          userId: sellerId,
        }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          }
        },
        tracking: {
          orderBy: { createdAt: 'asc' }
        }
      },
    });
  }

  async updateStatus(id: string, status: OrderStatus, description?: string) {
    return this.prisma.order.update({
      where: { id },
      data: { 
        status,
        tracking: {
          create: {
            status,
            description,
          }
        }
      },
    });
  }

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus, vnpayTxnRef?: string) {
    return this.prisma.order.update({
      where: { id },
      data: { 
        paymentStatus,
        ...(vnpayTxnRef && { vnpayTxnRef })
      },
    });
  }
}
