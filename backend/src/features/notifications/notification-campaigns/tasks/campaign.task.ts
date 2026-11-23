import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationDispatcherService } from '../notification-dispatcher.service';

@Injectable()
export class CampaignTask {
  private readonly logger = new Logger(CampaignTask.name);

  constructor(
    private prisma: PrismaService,
    private dispatcher: NotificationDispatcherService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledCampaigns() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.logger.debug('Checking for scheduled campaigns...');

    const now = new Date();

    // Find all SCHEDULED campaigns whose scheduledAt is in the past
    const campaigns = await this.prisma.notificationCampaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
    });

    for (const campaign of campaigns) {
      this.logger.log(`Triggering scheduled campaign ${campaign.id}`);

      // Update status to SENDING to prevent multiple triggers
      await this.prisma.notificationCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENDING' },
      });

      // Dispatch async
      this.dispatcher.dispatch(campaign.id).catch((e) => {
        this.logger.error(`Error in dispatching campaign ${campaign.id}`, e);
      });
    }
  }
}
