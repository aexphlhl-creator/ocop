import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(private prisma: PrismaService) {}

  async dispatch(campaignId: string) {
    try {
      this.logger.log(`Dispatching campaign ${campaignId}`);

      // Get recipients
      const recipients = await this.prisma.notificationRecipient.findMany({
        where: { campaignId, deliveryStatus: 'PENDING' },
        include: { user: true, campaign: true }
      });

      if (recipients.length === 0) {
        this.logger.log(`No pending recipients for campaign ${campaignId}`);
        return;
      }

      const campaign = recipients[0].campaign;
      let sentCount = 0;
      let failedCount = 0;

      for (const recipient of recipients) {
        try {
          // Channel 1: In-app Notification
          await this.prisma.notification.create({
            data: {
              userId: recipient.userId,
              title: campaign.title,
              message: campaign.message,
              type: 'INFO',
              link: campaign.eventId ? `/events/${campaign.eventId}` : null,
            }
          });

          // Future Channel 2: Email (placeholder)
          // await this.emailService.send(...)

          // Future Channel 3: Push Notification (placeholder)
          // await this.pushService.send(...)

          // Mark recipient as SENT
          await this.prisma.notificationRecipient.update({
            where: { id: recipient.id },
            data: { deliveryStatus: 'SENT' }
          });
          
          sentCount++;
        } catch (error) {
          this.logger.error(`Failed to send to user ${recipient.userId}`, error.stack);
          await this.prisma.notificationRecipient.update({
            where: { id: recipient.id },
            data: { deliveryStatus: 'FAILED' }
          });
          failedCount++;
        }
      }

      // Update Campaign stats
      await this.prisma.notificationCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'COMPLETED',
          sentAt: new Date(),
          sentCount: { increment: sentCount },
          failedCount: { increment: failedCount }
        }
      });

      this.logger.log(`Campaign ${campaignId} dispatched. Sent: ${sentCount}, Failed: ${failedCount}`);
    } catch (error) {
      this.logger.error(`Error dispatching campaign ${campaignId}`, error.stack);
      await this.prisma.notificationCampaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED' }
      });
    }
  }
}
