import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@Injectable()
export class NotificationCampaignsService {
  constructor(
    private prisma: PrismaService,
    private dispatcher: NotificationDispatcherService
  ) {}

  async create(dto: CreateCampaignDto, user: RequestUser) {
    // 1. Resolve Target Audience Users
    const targetUsers = await this.resolveTargetUsers(dto.targetAudience, dto.targetDetails);
    
    if (targetUsers.length === 0) {
      throw new BadRequestException('Không tìm thấy người nhận nào phù hợp với đối tượng mục tiêu');
    }

    // 2. Determine initial status
    const isScheduled = !!dto.scheduledAt && new Date(dto.scheduledAt) > new Date();
    const status = isScheduled ? 'SCHEDULED' : 'SENDING';

    // 3. Create Campaign and Recipients transactionally
    const campaign = await this.prisma.$transaction(async (tx: any) => {
      const camp = await tx.notificationCampaign.create({
        data: {
          title: dto.title,
          message: dto.message,
          eventId: dto.eventId,
          targetAudience: dto.targetAudience,
          targetDetails: dto.targetDetails,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
          status: status,
          totalRecipients: targetUsers.length,
          createdById: user.id
        }
      });

      // Prepare recipient records
      const recipientData = targetUsers.map((u: any) => ({
        campaignId: camp.id,
        userId: u.id,
        deliveryStatus: 'PENDING' as any
      }));

      // Create recipients
      await tx.notificationRecipient.createMany({
        data: recipientData
      });

      return camp;
    });

    // 4. Trigger Dispatcher immediately if not scheduled
    if (!isScheduled) {
      // Run async
      this.dispatcher.dispatch(campaign.id).catch(e => console.error(e));
    }

    return campaign;
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    
    const [items, total] = await Promise.all([
      this.prisma.notificationCampaign.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { fullName: true } } }
      }),
      this.prisma.notificationCampaign.count()
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        event: { select: { title: true } }
      }
    });

    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch');
    return campaign;
  }

  async cancel(id: string, user: RequestUser) {
    const campaign = await this.findOne(id);
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new BadRequestException('Chỉ có thể hủy chiến dịch DRAFT hoặc SCHEDULED');
    }

    return this.prisma.notificationCampaign.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });
  }

  private async resolveTargetUsers(target: string, details?: any) {
    const where: any = { isActive: true };

    switch (target) {
      case 'SELLERS':
        where.role = { name: RoleName.SELLER };
        break;
      case 'CUSTOMERS':
        where.role = { name: RoleName.VISITOR };
        break;
      case 'ALL':
        break; // Everyone except maybe admins? We'll send to all active users.
      case 'BUSINESSES':
        if (!details?.businessIds || !Array.isArray(details.businessIds)) {
          throw new BadRequestException('Danh sách businessIds không hợp lệ');
        }
        where.businesses = { some: { id: { in: details.businessIds } } };
        break;
      case 'PROVINCES':
        if (!details?.provinceIds || !Array.isArray(details.provinceIds)) {
          throw new BadRequestException('Danh sách provinceIds không hợp lệ');
        }
        where.businesses = { some: { provinceId: { in: details.provinceIds } } };
        break;
      case 'WARDS':
        if (!details?.wardIds || !Array.isArray(details.wardIds)) {
          throw new BadRequestException('Danh sách wardIds không hợp lệ');
        }
        where.businesses = { some: { wardId: { in: details.wardIds } } };
        break;
      default:
        throw new BadRequestException('Đối tượng nhận không hợp lệ');
    }

    return this.prisma.user.findMany({
      where,
      select: { id: true }
    });
  }
}
