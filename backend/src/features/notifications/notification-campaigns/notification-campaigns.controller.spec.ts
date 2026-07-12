import { Test, TestingModule } from '@nestjs/testing';
import { NotificationCampaignsController } from './notification-campaigns.controller';

describe('NotificationCampaignsController', () => {
  let controller: NotificationCampaignsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationCampaignsController],
    }).compile();

    controller = module.get<NotificationCampaignsController>(NotificationCampaignsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
