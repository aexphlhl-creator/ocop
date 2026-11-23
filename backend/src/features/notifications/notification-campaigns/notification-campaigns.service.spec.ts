import { Test, TestingModule } from '@nestjs/testing';
import { NotificationCampaignsService } from './notification-campaigns.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

describe('NotificationCampaignsService', () => {
  let service: NotificationCampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationCampaignsService,
        { provide: PrismaService, useValue: {} },
        { provide: NotificationDispatcherService, useValue: {} },
      ],
    }).compile();

    service = module.get<NotificationCampaignsService>(
      NotificationCampaignsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
