import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

const orderShipmentInclude = Prisma.validator<Prisma.ShipmentInclude>()({
  carrierOrganization: {
    select: {
      id: true,
      code: true,
      name: true,
      providerCode: true,
      trackingUrlTemplate: true,
    },
  },
  events: {
    orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      eventType: true,
      source: true,
      fromStatus: true,
      toStatus: true,
      eventTime: true,
      location: true,
      recipientName: true,
      failureReason: true,
      note: true,
      imageUrls: true,
      attachmentUrls: true,
      createdAt: true,
    },
  },
});

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
              },
            },
          },
        },
        seller: {
          select: { id: true, fullName: true, sellerProfile: true },
        },
        tracking: {
          orderBy: { createdAt: 'asc' },
        },
        shipments: {
          include: orderShipmentInclude,
          orderBy: { createdAt: 'asc' },
        },
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
              },
            },
          },
        },
        seller: { include: { sellerProfile: true } },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        tracking: {
          orderBy: { createdAt: 'asc' },
        },
        shipments: {
          include: orderShipmentInclude,
          orderBy: { createdAt: 'asc' },
        },
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
              },
            },
          },
        },
        seller: { include: { sellerProfile: true } },
        tracking: {
          orderBy: { createdAt: 'asc' },
        },
        shipments: {
          include: orderShipmentInclude,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findBySellerId(sellerId: string) {
    return this.prisma.order.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        seller: { include: { sellerProfile: true } },
        tracking: {
          orderBy: { createdAt: 'asc' },
        },
        shipments: {
          include: orderShipmentInclude,
          orderBy: { createdAt: 'asc' },
        },
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
          },
        },
      },
    });
  }

  async updatePaymentStatus(
    id: string,
    paymentStatus: PaymentStatus,
    vnpayTxnRef?: string,
  ) {
    return this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus,
        ...(vnpayTxnRef && { vnpayTxnRef }),
      },
    });
  }
}
