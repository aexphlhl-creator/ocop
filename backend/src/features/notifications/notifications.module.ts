import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { NotificationCampaignsService } from './notification-campaigns/notification-campaigns.service';
import { NotificationCampaignsController } from './notification-campaigns/notification-campaigns.controller';
import { NotificationDispatcherService } from './notification-campaigns/notification-dispatcher.service';
import { CampaignTask } from './notification-campaigns/tasks/campaign.task';

@Module({
  imports: [
    PrismaModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('SMTP_HOST') || 'sandbox.smtp.mailtrap.io',
          port: config.get('SMTP_PORT') || 2525,
          auth: {
            user: config.get('SMTP_USER') || 'user',
            pass: config.get('SMTP_PASS') || 'pass',
          },
        },
        defaults: {
          from: '"Hệ thống OCOP" <noreply@ocop.vn>',
        },
      }),
    }),
  ],
  controllers: [NotificationsController, NotificationCampaignsController],
  providers: [
    NotificationsService, 
    NotificationCampaignsService,
    NotificationDispatcherService,
    CampaignTask
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
