import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentEventType,
  ShipmentRouteType,
  ShipmentStatus,
} from '@prisma/client';
import { createHmac } from 'crypto';
import { CarrierWebhooksController } from './carrier-webhooks.controller';
import { ShipmentsService } from './shipments.service';

describe('Carrier Integration & COD Settlement with Mock Carrier (GHN/GHTK)', () => {
  const secret = 'carrier-webhook-secret-longer-than-32-chars-for-hmac';
  let controller: CarrierWebhooksController;
  let service: ShipmentsService;
  let mockPrisma: any;

  const mockOrg = {
    id: 'org-ghn-001',
    code: 'GHN',
    providerCode: 'GHN',
    name: 'Giao Hàng Nhanh Mock',
    isActive: true,
  };

  const mockOrder = {
    id: 'order-001',
    status: OrderStatus.CONFIRMED,
    paymentMethod: PaymentMethod.COD,
    paymentAggregateId: 'pay-agg-001',
    paymentStatus: PaymentStatus.PENDING,
  };

  const mockShipment: any = {
    id: 'shipment-001',
    shipmentNumber: 'SHIP-2026-0001',
    carrierOrganizationId: mockOrg.id,
    carrierOrganization: { name: 'Giao Hàng Nhanh Mock' },
    trackingCode: 'GHN-TRACK-001',
    routeType: ShipmentRouteType.DIRECT_TO_CUSTOMER,
    status: ShipmentStatus.HANDED_OVER,
    orderId: mockOrder.id,
    createdById: 'user-wh-01',
    events: [
      {
        id: 'event-init',
        eventType: ShipmentEventType.CREATED,
        eventTime: new Date('2026-09-01T08:00:00Z'),
      },
    ],
    assignments: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockShipment.status = ShipmentStatus.HANDED_OVER;

    mockPrisma = {
      $transaction: jest.fn(async (callback) => callback(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'shipment-001' }]),
      logisticsOrganization: {
        findFirst: jest.fn().mockResolvedValue(mockOrg),
      },
      carrierWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cwe-001' }),
      },
      shipment: {
        findUnique: jest.fn().mockResolvedValue(mockShipment),
        update: jest.fn().mockResolvedValue(mockShipment),
        count: jest.fn().mockResolvedValue(0),
      },
      shipmentEvent: {
        create: jest.fn().mockResolvedValue({ id: 'se-001' }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue(mockOrder),
        findMany: jest.fn().mockResolvedValue([{ id: mockOrder.id, status: OrderStatus.DELIVERED }]),
        update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.DELIVERED }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderTracking: {
        create: jest.fn().mockResolvedValue({ id: 'ot-001' }),
      },
      orderItemBatchReservation: {
        count: jest.fn().mockResolvedValue(0),
      },
      paymentAggregate: {
        update: jest.fn().mockResolvedValue({ id: 'pay-agg-001', status: 'COMPLETED' }),
      },
      inventoryBatch: {
        create: jest.fn().mockResolvedValue({ id: 'ib-returned' }),
      },
      inventory: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'CARRIER_WEBHOOK_SECRETS') {
          return JSON.stringify({ GHN: secret });
        }
        return undefined;
      }),
    };

    service = new ShipmentsService(mockPrisma, {} as any);
    controller = new CarrierWebhooksController(
      service,
      configService as unknown as ConfigService,
    );
  });

  function signPayload(body: unknown, hmacSecret = secret): { signature: string; rawBody: Buffer } {
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', hmacSecret).update(rawBody).digest('hex')}`;
    return { signature, rawBody };
  }

  it('verifies HMAC and transitions shipment from HANDED_OVER to IN_TRANSIT on PICKED_UP event', async () => {
    const dto = {
      externalEventId: 'evt-picked-up-001',
      trackingCode: 'GHN-TRACK-001',
      eventType: ShipmentEventType.PICKED_UP,
      eventTime: '2026-09-01T09:00:00.000Z',
      location: 'Bưu cục GHN Quận 1, TP.HCM',
    };

    const { signature, rawBody } = signPayload(dto);
    const result: any = await controller.handle('GHN', signature, dto as any, { rawBody } as any);

    expect(result.accepted).toBe(true);
    expect(result.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(mockPrisma.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockShipment.id },
        data: expect.objectContaining({ status: ShipmentStatus.IN_TRANSIT }),
      }),
    );
  });

  it('DELIVERED event transitions shipment, updates order to DELIVERED, and settles COD payment', async () => {
    mockShipment.status = ShipmentStatus.OUT_FOR_DELIVERY;

    const dto = {
      externalEventId: 'evt-delivered-001',
      trackingCode: 'GHN-TRACK-001',
      eventType: ShipmentEventType.DELIVERED,
      eventTime: '2026-09-01T14:30:00.000Z',
      location: 'Đã giao tại nhà khách hàng',
      recipientName: 'Nguyễn Văn A',
    };

    const { signature, rawBody } = signPayload(dto);
    const result: any = await controller.handle('GHN', signature, dto as any, { rawBody } as any);

    expect(result.accepted).toBe(true);
    expect(result.status).toBe(ShipmentStatus.DELIVERED);

    // Order status updated to DELIVERED and COD marked COMPLETED
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockOrder.id },
        data: expect.objectContaining({
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.COMPLETED,
        }),
      }),
    );

    // COD Aggregate settlement completed
    expect(mockPrisma.paymentAggregate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-agg-001' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('rejects tampered or invalid HMAC signature before touching database state', async () => {
    const dto = {
      externalEventId: 'evt-tampered',
      trackingCode: 'GHN-TRACK-001',
      eventType: ShipmentEventType.DELIVERED,
      eventTime: '2026-09-01T14:30:00.000Z',
      location: 'Somewhere',
    };

    const { signature, rawBody } = signPayload(dto, 'different-wrong-secret-key-that-is-long-enough');

    expect(() =>
      controller.handle('GHN', signature, dto as any, { rawBody } as any),
    ).toThrow(UnauthorizedException);

    expect(mockPrisma.shipment.update).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('deduplicates replayed webhook events idempotently', async () => {
    const dto = {
      externalEventId: 'evt-replay-001',
      trackingCode: 'GHN-TRACK-001',
      eventType: ShipmentEventType.PICKED_UP,
      eventTime: '2026-09-01T10:00:00.000Z',
      location: 'Trung tâm khai thác GHN',
    };

    // Simulate event already exists
    mockPrisma.carrierWebhookEvent.findUnique.mockResolvedValueOnce({
      shipmentId: mockShipment.id,
    });

    const { signature, rawBody } = signPayload(dto);
    const result = await controller.handle('GHN', signature, dto as any, { rawBody } as any);

    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(mockPrisma.shipment.update).not.toHaveBeenCalled();
  });
});
