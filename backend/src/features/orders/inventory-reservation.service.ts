import { BadRequestException, Injectable } from '@nestjs/common';
import { BatchStatus, Prisma, ReservationStatus } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

interface ReservationRow {
  id: string;
  order_item_id: string;
  batch_id: string;
  inventory_id: string;
  quantity: number;
  batch_quantity: number;
  current_quantity: number;
  reserved_quantity: number;
}

interface ShipmentReservationRow extends ReservationRow {
  shipment_quantity: number;
}

@Injectable()
export class InventoryReservationService {
  async lockOrder(tx: TransactionClient, orderId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
      Prisma.sql`SELECT "id", "status" FROM "orders"
        WHERE "id" = ${orderId}::uuid FOR UPDATE`,
    );
    return rows[0] ?? null;
  }

  async releaseOrder(tx: TransactionClient, orderId: string) {
    await this.lockOrder(tx, orderId);
    const reservations = await this.lockActiveReservations(tx, orderId);
    if (reservations.length === 0) return 0;

    const byInventory = this.sumByInventory(reservations);
    for (const [inventoryId, quantity] of byInventory) {
      const updated = await tx.inventory.updateMany({
        where: { id: inventoryId, reservedQuantity: { gte: quantity } },
        data: { reservedQuantity: { decrement: quantity } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Dữ liệu tồn kho reserve không nhất quán; đã hủy thao tác',
        );
      }
    }
    const now = new Date();
    for (const reservation of reservations) {
      const updated = await tx.orderItemBatchReservation.updateMany({
        where: { id: reservation.id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.RELEASED, releasedAt: now },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Reservation đã được xử lý bởi một yêu cầu khác',
        );
      }
    }
    return reservations.length;
  }

  async releaseAggregate(tx: TransactionClient, aggregateId: string) {
    const orders = await tx.order.findMany({
      where: { paymentAggregateId: aggregateId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let released = 0;
    for (const order of orders) {
      released += await this.releaseOrder(tx, order.id);
    }
    return released;
  }

  async deductOrder(tx: TransactionClient, orderId: string, actorId: string) {
    await this.lockOrder(tx, orderId);
    const reservations = await this.lockActiveReservations(tx, orderId);
    if (reservations.length === 0) {
      throw new BadRequestException(
        'Đơn hàng không còn reservation ACTIVE để xuất kho',
      );
    }

    const expectedItems = await tx.orderItem.findMany({
      where: { orderId },
      select: { id: true, quantity: true },
    });
    const reservedByItem = new Map<string, number>();
    for (const reservation of reservations) {
      reservedByItem.set(
        reservation.order_item_id,
        (reservedByItem.get(reservation.order_item_id) ?? 0) +
          reservation.quantity,
      );
    }
    for (const item of expectedItems) {
      if ((reservedByItem.get(item.id) ?? 0) !== item.quantity) {
        throw new BadRequestException(
          'Reservation không bao phủ đủ số lượng order item',
        );
      }
    }

    await this.deductReservations(
      tx,
      reservations,
      actorId,
      orderId,
      'ORDER',
      'Xuất kho từ reservation của đơn hàng',
    );
    return reservations.length;
  }

  async deductShipment(
    tx: TransactionClient,
    shipmentId: string,
    orderId: string,
    actorId: string,
  ) {
    await this.lockOrder(tx, orderId);
    const shipmentItems = await tx.shipmentItem.findMany({
      where: { shipmentId },
      select: {
        orderItemId: true,
        batchId: true,
        batch: { select: { inventoryId: true } },
      },
      orderBy: { id: 'asc' },
    });
    if (
      shipmentItems.length === 0 ||
      shipmentItems.some((item) => !item.orderItemId)
    ) {
      throw new BadRequestException(
        'Chuyến theo đơn phải liên kết đầy đủ order item và lô đã reserve',
      );
    }
    const inventoryIds = Array.from(
      new Set(shipmentItems.map((item) => item.batch.inventoryId)),
    ).sort();
    const batchIds = Array.from(
      new Set(shipmentItems.map((item) => item.batchId)),
    ).sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventories"
        WHERE "id" IN (${Prisma.join(inventoryIds)})
        ORDER BY "id" FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventory_batches"
        WHERE "id" IN (${Prisma.join(batchIds)})
        ORDER BY "id" FOR UPDATE`,
    );
    const reservations = await tx.$queryRaw<ShipmentReservationRow[]>(
      Prisma.sql`SELECT r."id", r."order_item_id", r."batch_id",
        b."inventory_id", r."quantity", b."quantity" AS "batch_quantity",
        i."current_quantity", i."reserved_quantity",
        si."quantity" AS "shipment_quantity"
        FROM "shipment_items" si
        JOIN "order_item_batch_reservations" r
          ON r."order_item_id" = si."order_item_id"
          AND r."batch_id" = si."batch_id"
        JOIN "order_items" oi ON oi."id" = r."order_item_id"
        JOIN "inventory_batches" b ON b."id" = r."batch_id"
        JOIN "inventories" i ON i."id" = b."inventory_id"
        WHERE si."shipment_id" = ${shipmentId}::uuid
          AND oi."order_id" = ${orderId}::uuid
          AND r."status" = 'ACTIVE'
        ORDER BY r."id" FOR UPDATE OF r`,
    );
    if (
      reservations.length !== shipmentItems.length ||
      reservations.some(
        (reservation) => reservation.shipment_quantity !== reservation.quantity,
      )
    ) {
      throw new BadRequestException(
        'Phân bổ chuyến không khớp chính xác reservation ACTIVE của đơn',
      );
    }
    await this.deductReservations(
      tx,
      reservations,
      actorId,
      shipmentId,
      'SHIPMENT_ORDER',
      'Xuất kho khi bàn giao chuyến theo đơn hàng',
    );
    return reservations.length;
  }

  private async deductReservations(
    tx: TransactionClient,
    reservations: ReservationRow[],
    actorId: string,
    referenceId: string,
    referenceType: string,
    note: string,
  ) {
    const byInventory = this.sumByInventory(reservations);
    const currentBatchQuantities = new Map<string, number>();
    for (const reservation of reservations) {
      const beforeQuantity =
        currentBatchQuantities.get(reservation.batch_id) ??
        reservation.batch_quantity;
      if (beforeQuantity < reservation.quantity) {
        throw new BadRequestException('Lô hàng không đủ số lượng đã reserve');
      }
      const afterQuantity = beforeQuantity - reservation.quantity;
      const updatedBatch = await tx.inventoryBatch.updateMany({
        where: {
          id: reservation.batch_id,
          quantity: beforeQuantity,
          status: BatchStatus.ACTIVE,
          lifecycleStatus: 'RELEASED',
          qualityStatus: 'PASSED',
          OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
        },
        data: {
          quantity: { decrement: reservation.quantity },
          ...(afterQuantity === 0 ? { status: BatchStatus.DEPLETED } : {}),
        },
      });
      if (updatedBatch.count !== 1) {
        throw new BadRequestException('Lô hàng đã thay đổi trong lúc xuất kho');
      }
      await tx.stockMovement.create({
        data: {
          inventoryId: reservation.inventory_id,
          batchId: reservation.batch_id,
          reservationId: reservation.id,
          movementType: 'OUT',
          quantity: -reservation.quantity,
          beforeQuantity,
          afterQuantity,
          referenceId,
          referenceType,
          note,
          createdById: actorId,
        },
      });
      currentBatchQuantities.set(reservation.batch_id, afterQuantity);
    }

    for (const [inventoryId, quantity] of byInventory) {
      const updated = await tx.inventory.updateMany({
        where: {
          id: inventoryId,
          currentQuantity: { gte: quantity },
          reservedQuantity: { gte: quantity },
        },
        data: {
          currentQuantity: { decrement: quantity },
          reservedQuantity: { decrement: quantity },
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Tổng tồn kho không nhất quán; đã rollback xuất kho',
        );
      }
    }

    const now = new Date();
    for (const reservation of reservations) {
      const updated = await tx.orderItemBatchReservation.updateMany({
        where: { id: reservation.id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.DEDUCTED, deductedAt: now },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Reservation đã được xử lý bởi một yêu cầu khác',
        );
      }
    }
  }

  async isAggregateRecoverable(tx: TransactionClient, aggregateId: string) {
    const orders = await tx.order.findMany({
      where: { paymentAggregateId: aggregateId },
      select: {
        status: true,
        items: {
          select: {
            quantity: true,
            batchReservations: {
              where: { status: ReservationStatus.ACTIVE },
              select: { quantity: true },
            },
          },
        },
      },
    });
    if (
      orders.length === 0 ||
      orders.some((order) => order.status === 'CANCELLED')
    ) {
      return false;
    }
    return orders.every((order) =>
      order.items.every(
        (item) =>
          item.batchReservations.reduce(
            (total, reservation) => total + reservation.quantity,
            0,
          ) === item.quantity,
      ),
    );
  }

  private async lockActiveReservations(tx: TransactionClient, orderId: string) {
    const references = await tx.orderItemBatchReservation.findMany({
      where: { orderItem: { orderId }, status: ReservationStatus.ACTIVE },
      select: { batchId: true, batch: { select: { inventoryId: true } } },
    });
    if (references.length === 0) return [];
    const inventoryIds = Array.from(
      new Set(references.map((row) => row.batch.inventoryId)),
    ).sort();
    const batchIds = Array.from(
      new Set(references.map((row) => row.batchId)),
    ).sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventories"
        WHERE "id" IN (${Prisma.join(inventoryIds)})
        ORDER BY "id" FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventory_batches"
        WHERE "id" IN (${Prisma.join(batchIds)})
        ORDER BY "id" FOR UPDATE`,
    );
    return tx.$queryRaw<ReservationRow[]>(
      Prisma.sql`SELECT r."id", r."order_item_id", r."batch_id",
        b."inventory_id", r."quantity", b."quantity" AS "batch_quantity",
        i."current_quantity", i."reserved_quantity"
        FROM "order_item_batch_reservations" r
        JOIN "order_items" oi ON oi."id" = r."order_item_id"
        JOIN "inventory_batches" b ON b."id" = r."batch_id"
        JOIN "inventories" i ON i."id" = b."inventory_id"
        WHERE oi."order_id" = ${orderId}::uuid AND r."status" = 'ACTIVE'
        ORDER BY r."id" FOR UPDATE OF r`,
    );
  }

  private sumByInventory(reservations: ReservationRow[]) {
    const sums = new Map<string, number>();
    for (const reservation of reservations) {
      sums.set(
        reservation.inventory_id,
        (sums.get(reservation.inventory_id) ?? 0) + reservation.quantity,
      );
    }
    return Array.from(sums.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }
}
