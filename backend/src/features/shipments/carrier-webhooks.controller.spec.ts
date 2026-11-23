import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShipmentEventType } from '@prisma/client';
import { createHmac } from 'crypto';
import { CarrierWebhooksController } from './carrier-webhooks.controller';
import { ShipmentsService } from './shipments.service';

describe('CarrierWebhooksController', () => {
  const secret = 'test-carrier-secret-that-is-longer-than-32-characters';
  const shipmentsService = {
    processCarrierWebhook: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue(JSON.stringify({ GHN: secret })),
  };
  const dto = {
    externalEventId: 'event-001',
    trackingCode: 'GHN-001',
    eventType: ShipmentEventType.PICKED_UP,
    eventTime: '2026-08-24T01:00:00.000Z',
    location: 'Kho Hà Nội',
  };

  let controller: CarrierWebhooksController;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(JSON.stringify({ GHN: secret }));
    shipmentsService.processCarrierWebhook.mockResolvedValue({
      accepted: true,
    });
    controller = new CarrierWebhooksController(
      shipmentsService as unknown as ShipmentsService,
      config as unknown as ConfigService,
    );
  });

  it('verifies HMAC against the exact raw request body', async () => {
    const rawBody = Buffer.from(JSON.stringify(dto));
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    await controller.handle('ghn', signature, dto, { rawBody } as never);

    expect(shipmentsService.processCarrierWebhook).toHaveBeenCalledWith(
      'GHN',
      dto,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects an invalid signature before touching shipment state', () => {
    const rawBody = Buffer.from(JSON.stringify(dto));

    expect(() =>
      controller.handle('GHN', `sha256=${'0'.repeat(64)}`, dto, {
        rawBody,
      } as never),
    ).toThrow(UnauthorizedException);
    expect(shipmentsService.processCarrierWebhook).not.toHaveBeenCalled();
  });
});
