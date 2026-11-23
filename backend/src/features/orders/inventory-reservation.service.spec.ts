import { BadRequestException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { InventoryReservationService } from './inventory-reservation.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-1',
    order_item_id: 'item-1',
    batch_id: 'batch-1',
    inventory_id: 'inventory-1',
    quantity: 3,
    batch_quantity: 10,
    current_quantity: 10,
    reserved_quantity: 5,
    ...overrides,
  };
}

function transactionMock(rows: Array<ReturnType<typeof reservation>>) {
  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ id: 'order-1', status: 'CONFIRMED' }])
      .mockResolvedValueOnce([{ id: 'inventory-1' }])
      .mockResolvedValueOnce([{ id: 'batch-1' }])
      .mockResolvedValueOnce(rows),
    orderItemBatchReservation: {
      findMany: jest.fn().mockResolvedValue(
        rows.map((row) => ({
          batchId: row.batch_id,
          batch: { inventoryId: row.inventory_id },
        })),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue(
        rows.map((row) => ({
          id: row.order_item_id,
          quantity: row.quantity,
        })),
      ),
    },
    shipmentItem: {
      findMany: jest.fn().mockResolvedValue(
        rows.map((row) => ({
          orderItemId: row.order_item_id,
          batchId: row.batch_id,
          batch: { inventoryId: row.inventory_id },
        })),
      ),
    },
    inventory: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryBatch: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    stockMovement: {
      create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    },
  };
}

describe('InventoryReservationService', () => {
  const service = new InventoryReservationService();

  it('releases only reserved quantity without changing physical batch stock', async () => {
    const tx = transactionMock([reservation()]);

    await service.releaseOrder(tx as never, 'order-1');

    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { id: 'inventory-1', reservedQuantity: { gte: 3 } },
      data: { reservedQuantity: { decrement: 3 } },
    });
    expect(tx.inventoryBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.orderItemBatchReservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'reservation-1', status: ReservationStatus.ACTIVE },
      data: {
        status: ReservationStatus.RELEASED,
        releasedAt: expect.any(Date),
      },
    });
  });

  it('deducts multiple reservations from the same batch using current quantities', async () => {
    const rows = [
      reservation(),
      reservation({
        id: 'reservation-2',
        order_item_id: 'item-2',
        quantity: 2,
      }),
    ];
    const tx = transactionMock(rows);

    await service.deductOrder(tx as never, 'order-1', 'actor-1');

    expect(tx.inventoryBatch.updateMany).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        id: 'batch-1',
        quantity: 10,
        status: 'ACTIVE',
        lifecycleStatus: 'RELEASED',
        qualityStatus: 'PASSED',
      }),
      data: { quantity: { decrement: 3 } },
    });
    expect(tx.inventoryBatch.updateMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        id: 'batch-1',
        quantity: 7,
        status: 'ACTIVE',
        lifecycleStatus: 'RELEASED',
        qualityStatus: 'PASSED',
      }),
      data: { quantity: { decrement: 2 } },
    });
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inventory-1',
        currentQuantity: { gte: 5 },
        reservedQuantity: { gte: 5 },
      },
      data: {
        currentQuantity: { decrement: 5 },
        reservedQuantity: { decrement: 5 },
      },
    });
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          reservationId: 'reservation-2',
          beforeQuantity: 7,
          afterQuantity: 5,
        }),
      }),
    );
  });

  it('aborts when active reservations do not cover an order item', async () => {
    const tx = transactionMock([reservation({ quantity: 2 })]);
    tx.orderItem.findMany.mockResolvedValue([{ id: 'item-1', quantity: 3 }]);

    await expect(
      service.deductOrder(tx as never, 'order-1', 'actor-1'),
    ).rejects.toThrow(BadRequestException);
    expect(tx.inventoryBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('deducts only the reservations included in an order shipment', async () => {
    const tx = transactionMock([reservation({ shipment_quantity: 3 })]);

    await service.deductShipment(
      tx as never,
      'shipment-1',
      'order-1',
      'manager-1',
    );

    expect(tx.orderItem.findMany).not.toHaveBeenCalled();
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inventory-1',
        currentQuantity: { gte: 3 },
        reservedQuantity: { gte: 3 },
      },
      data: {
        currentQuantity: { decrement: 3 },
        reservedQuantity: { decrement: 3 },
      },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservationId: 'reservation-1',
          referenceId: 'shipment-1',
          referenceType: 'SHIPMENT_ORDER',
        }),
      }),
    );
  });

  it('aborts release when reserved totals are inconsistent', async () => {
    const tx = transactionMock([reservation()]);
    tx.inventory.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.releaseOrder(tx as never, 'order-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.orderItemBatchReservation.updateMany).not.toHaveBeenCalled();
  });
});
