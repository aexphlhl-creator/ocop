import { objectContaining } from '../../../test/helpers/matchers';
import { BadRequestException } from '@nestjs/common';
import {
  RoleName,
  ShipmentEventType,
  ShipmentRouteType,
  ShipmentStatus,
} from '@prisma/client';
import { ShipmentsService } from './shipments.service';

type TransitionResolver = {
  resolveTransition(
    route: ShipmentRouteType,
    status: ShipmentStatus,
    event: ShipmentEventType,
  ): ShipmentStatus;
};

type ShipmentInventoryOperations = {
  deductManualShipmentInventory(
    tx: unknown,
    shipment: unknown,
    actorId: string,
  ): Promise<void>;
  releaseManualShipmentReservation(
    tx: unknown,
    shipment: unknown,
  ): Promise<void>;
  receiveReturnedInventory(
    tx: unknown,
    shipment: unknown,
    actorId: string,
    receivedAt: Date,
  ): Promise<void>;
};

const mockPrisma = {
  order: {
    findMany: jest.fn(),
  },
  shipmentItem: {
    findMany: jest.fn(),
  },
  shipment: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('ShipmentsService production state machine', () => {
  let service: ShipmentsService;
  let resolver: TransitionResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ShipmentsService(mockPrisma as never, {} as never);
    resolver = service as unknown as TransitionResolver;
  });

  it('supports a direct-to-customer route without distributor or retail stages', () => {
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.HANDED_OVER,
        ShipmentEventType.PICKED_UP,
      ),
    ).toBe(ShipmentStatus.IN_TRANSIT);
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.IN_TRANSIT,
        ShipmentEventType.OUT_FOR_DELIVERY,
      ),
    ).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentEventType.DELIVERED,
      ),
    ).toBe(ShipmentStatus.DELIVERED);
  });

  it('rejects a distributor event on a direct shipment', () => {
    expect(() =>
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.IN_TRANSIT,
        ShipmentEventType.ARRIVED_DISTRIBUTOR,
      ),
    ).toThrow(BadRequestException);
  });

  it('requires distributor then retail for VIA_RETAIL', () => {
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.VIA_RETAIL,
        ShipmentStatus.IN_TRANSIT,
        ShipmentEventType.ARRIVED_DISTRIBUTOR,
      ),
    ).toBe(ShipmentStatus.AT_DISTRIBUTOR);
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.VIA_RETAIL,
        ShipmentStatus.AT_DISTRIBUTOR,
        ShipmentEventType.ARRIVED_RETAIL,
      ),
    ).toBe(ShipmentStatus.AT_RETAIL);
  });

  it('allows an internal transfer to complete immediately after transit', () => {
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.INTERNAL_TRANSFER,
        ShipmentStatus.IN_TRANSIT,
        ShipmentEventType.DELIVERED,
      ),
    ).toBe(ShipmentStatus.DELIVERED);
  });

  it('supports failure, retry, and return compensation paths', () => {
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentEventType.DELIVERY_FAILED,
      ),
    ).toBe(ShipmentStatus.DELIVERY_FAILED);
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.DELIVERY_FAILED,
        ShipmentEventType.DELIVERY_RETRIED,
      ),
    ).toBe(ShipmentStatus.IN_TRANSIT);
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.DELIVERY_FAILED,
        ShipmentEventType.RETURN_STARTED,
      ),
    ).toBe(ShipmentStatus.RETURNING);
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.RETURNING,
        ShipmentEventType.RETURNED,
      ),
    ).toBe(ShipmentStatus.RETURNED);
  });

  it('supports a post-delivery return without rewriting delivery history', () => {
    expect(
      resolver.resolveTransition(
        ShipmentRouteType.DIRECT_TO_CUSTOMER,
        ShipmentStatus.DELIVERED,
        ShipmentEventType.RETURN_STARTED,
      ),
    ).toBe(ShipmentStatus.RETURNING);
  });

  it('does not expose the shipment list to legacy logistics users', async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([]);
    mockPrisma.shipment.count.mockResolvedValue(0);

    await service.list(
      { page: 1, limit: 20 },
      {
        id: '10000000-0000-4000-8000-000000000001',
        email: 'logistics@example.com',
        fullName: 'Logistics User',
        phone: null,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
        role: RoleName.LOGISTICS,
      },
    );

    expect(mockPrisma.shipment.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: { id: '__forbidden__' },
      }),
    );
  });

  it('only exposes fulfillment orders whose complete reservation set belongs to the managed warehouse', async () => {
    const managedWarehouse = {
      id: '20000000-0000-4000-8000-000000000001',
      code: 'WH-01',
      name: 'Managed warehouse',
      managerId: '10000000-0000-4000-8000-000000000001',
      isActive: true,
    };
    const baseOrder = {
      id: '40000000-0000-4000-8000-000000000001',
      status: 'PACKING',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      shippingAddress: 'Customer address',
      phone: '0900000000',
      createdAt: new Date(),
      user: { fullName: 'Customer', email: 'customer@example.com' },
      seller: {
        id: '50000000-0000-4000-8000-000000000001',
        fullName: 'Seller',
        sellerProfile: { displayName: 'Seller shop' },
      },
      items: [
        {
          id: '60000000-0000-4000-8000-000000000001',
          quantity: 2,
          product: {
            id: '70000000-0000-4000-8000-000000000001',
            name: 'Product',
          },
          batchReservations: [
            {
              quantity: 2,
              status: 'ACTIVE',
              batch: {
                id: '80000000-0000-4000-8000-000000000001',
                batchNumber: 'BATCH-01',
                quantity: 10,
                status: 'ACTIVE',
                qualityStatus: 'PASSED',
                lifecycleStatus: 'RELEASED',
                expiryDate: null,
                inventory: { warehouse: managedWarehouse },
              },
            },
          ],
        },
      ],
    };
    mockPrisma.order.findMany.mockResolvedValue([
      baseOrder,
      {
        ...baseOrder,
        id: '40000000-0000-4000-8000-000000000002',
        items: [
          ...baseOrder.items,
          {
            ...baseOrder.items[0],
            id: '60000000-0000-4000-8000-000000000002',
            batchReservations: [
              {
                quantity: 1,
                status: 'ACTIVE',
                batch: {
                  ...baseOrder.items[0].batchReservations[0].batch,
                  id: '80000000-0000-4000-8000-000000000002',
                  inventory: {
                    warehouse: {
                      ...managedWarehouse,
                      id: '20000000-0000-4000-8000-000000000002',
                      managerId: '10000000-0000-4000-8000-000000000099',
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    ]);
    mockPrisma.shipmentItem.findMany.mockResolvedValue([]);

    const result = await service.getFulfillmentOrders({
      id: managedWarehouse.managerId,
      email: 'manager@example.com',
      fullName: 'Warehouse Manager',
      phone: null,
      isActive: true,
      createdAt: new Date(),
      mustChangePassword: false,
      role: RoleName.WAREHOUSE_MANAGER,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      objectContaining({
        id: baseOrder.id,
        fulfillmentKey: `${baseOrder.id}:${managedWarehouse.id}`,
        warehouse: managedWarehouse,
        items: baseOrder.items,
      }),
    );
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: objectContaining({
          items: {
            some: {
              batchReservations: {
                some: objectContaining({
                  batch: {
                    inventory: {
                      warehouse: objectContaining({
                        managerId: managedWarehouse.managerId,
                      }),
                    },
                  },
                }),
              },
            },
          },
        }),
      }),
    );
  });

  it('deducts a manual shipment from batch, inventory and shipment audit atomically', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      shipmentItem: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              batchId: '20000000-0000-4000-8000-000000000001',
              quantity: 4,
              batch: {
                inventoryId: '30000000-0000-4000-8000-000000000001',
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              quantity: 4,
              batch: {
                id: '20000000-0000-4000-8000-000000000001',
                batchNumber: 'LOT-001',
                quantity: 10,
                status: 'ACTIVE',
                qualityStatus: 'PASSED',
                lifecycleStatus: 'RELEASED',
                expiryDate: null,
                inventoryId: '30000000-0000-4000-8000-000000000001',
              },
            },
          ]),
      },
      inventoryBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      inventory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const operations = service as unknown as ShipmentInventoryOperations;
    await operations.deductManualShipmentInventory(
      tx,
      {
        id: '40000000-0000-4000-8000-000000000001',
        shipmentNumber: 'SHP-001',
      },
      '10000000-0000-4000-8000-000000000001',
    );

    expect(tx.inventoryBatch.updateMany).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ quantity: { decrement: 4 } }),
      }),
    );
    expect(tx.inventory.updateMany).toHaveBeenCalledWith(
      objectContaining({
        data: {
          currentQuantity: { decrement: 4 },
          reservedQuantity: { decrement: 4 },
        },
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          quantity: -4,
          referenceType: 'SHIPMENT',
          referenceId: '40000000-0000-4000-8000-000000000001',
        }),
      }),
    );
  });

  it('releases reserved inventory when a manual shipment is cancelled', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      shipmentItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantity: 3,
            batch: {
              inventoryId: '30000000-0000-4000-8000-000000000001',
            },
          },
        ]),
      },
      inventory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const operations = service as unknown as ShipmentInventoryOperations;
    await operations.releaseManualShipmentReservation(tx, {
      id: '40000000-0000-4000-8000-000000000001',
    });

    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: {
        id: '30000000-0000-4000-8000-000000000001',
        reservedQuantity: { gte: 3 },
      },
      data: { reservedQuantity: { decrement: 3 } },
    });
  });

  it('receives returned goods into a quarantine batch instead of saleable stock', async () => {
    const returnedAt = new Date('2026-08-26T08:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      shipmentItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantity: 2,
            batch: {
              batchNumber: 'LOT-001',
              inventoryId: '30000000-0000-4000-8000-000000000001',
              manufactureDate: null,
              harvestDate: null,
              expiryDate: null,
            },
          },
        ]),
      },
      inventoryBatch: {
        create: jest.fn().mockResolvedValue({
          id: '50000000-0000-4000-8000-000000000001',
        }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-2' }),
      },
      inventory: { update: jest.fn().mockResolvedValue({}) },
    };
    const operations = service as unknown as ShipmentInventoryOperations;
    await operations.receiveReturnedInventory(
      tx,
      {
        id: '40000000-0000-4000-8000-000000000001',
        shipmentNumber: 'SHP-001',
      },
      '10000000-0000-4000-8000-000000000001',
      returnedAt,
    );

    expect(tx.inventoryBatch.create).toHaveBeenCalledWith({
      data: objectContaining({
        quantity: 2,
        qualityStatus: 'QUARANTINE',
        warehouseLocation: 'RETURN-QUARANTINE',
      }),
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          movementType: 'RETURN',
          referenceType: 'SHIPMENT_RETURN',
        }),
      }),
    );
  });
});
