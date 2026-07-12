import { Test, TestingModule } from '@nestjs/testing';
import { NotificationCampaignsService } from './notification-campaigns.service';

describe('NotificationCampaignsService', () => {
  let service: NotificationCampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationCampaignsService],
    }).compile();

    service = module.get<NotificationCampaignsService>(NotificationCampaignsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
