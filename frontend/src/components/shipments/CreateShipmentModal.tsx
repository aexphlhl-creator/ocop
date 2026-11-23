"use client";

import { Minus, PackagePlus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import {
  FulfillmentOrderOption,
  LogisticsOrganization,
  ShipmentBatchOption,
  ShipmentRouteType,
} from "./types";
import { routeLabels } from "./shipment-workflow";

export interface CreateShipmentPayload {
  idempotencyKey: string;
  originWarehouseId: string;
  carrierOrganizationId: string;
  routeType: ShipmentRouteType;
  orderId?: string;
  trackingCode?: string;
  destinationName: string;
  destinationAddress: string;
  destinationPhone?: string;
  items: Array<{ batchId: string; orderItemId?: string; quantity: number }>;
}

interface CreateShipmentModalProps {
  batches: ShipmentBatchOption[];
  organizations: LogisticsOrganization[];
  fulfillmentOrders: FulfillmentOrderOption[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateShipmentPayload) => void;
}

export function CreateShipmentModal({
  batches,
  organizations,
  fulfillmentOrders,
  isPending,
  onClose,
  onSubmit,
}: CreateShipmentModalProps) {
  const eligibleBatches = useMemo(
    () =>
      batches.filter(
        (batch) => batch.qualityStatus === "PASSED" && batch.quantity > 0,
      ),
    [batches],
  );
  const warehouses = useMemo(
    () =>
      Array.from(
        new Map(
          eligibleBatches.map((batch) => [
            batch.inventory.warehouse.id,
            batch.inventory.warehouse,
          ]),
        ).values(),
      ),
    [eligibleBatches],
  );
  const [originWarehouseId, setOriginWarehouseId] = useState("");
  const [carrierOrganizationId, setCarrierOrganizationId] = useState("");
  const [routeType, setRouteType] =
    useState<ShipmentRouteType>("DIRECT_TO_CUSTOMER");
  const [sourceType, setSourceType] = useState<"ORDER" | "MANUAL">("ORDER");
  const [selectedFulfillmentKey, setSelectedFulfillmentKey] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationPhone, setDestinationPhone] = useState("");
  const [items, setItems] = useState<
    Array<{ batchId: string; quantity: number }>
  >([{ batchId: "", quantity: 1 }]);

  const effectiveOriginWarehouseId = warehouses.some(
    (warehouse) => warehouse.id === originWarehouseId,
  )
    ? originWarehouseId
    : warehouses[0]?.id ?? "";
  const effectiveCarrierOrganizationId = organizations.some(
    (organization) => organization.id === carrierOrganizationId,
  )
    ? carrierOrganizationId
    : organizations[0]?.id ?? "";
  const effectiveFulfillmentKey = fulfillmentOrders.some(
    (order) => order.fulfillmentKey === selectedFulfillmentKey,
  )
    ? selectedFulfillmentKey
    : fulfillmentOrders[0]?.fulfillmentKey ?? "";

  const selectedOrder = fulfillmentOrders.find(
    (order) => order.fulfillmentKey === effectiveFulfillmentKey,
  );
  const orderShipmentItems = useMemo(
    () =>
      selectedOrder?.items.flatMap((item) =>
        item.batchReservations.map((reservation) => ({
          batchId: reservation.batch.id,
          orderItemId: item.id,
          quantity: reservation.quantity,
        })),
      ) ?? [],
    [selectedOrder],
  );
  const orderWarehouse = selectedOrder?.warehouse;

  const availableBatches = eligibleBatches.filter(
    (batch) => batch.inventory.warehouse.id === effectiveOriginWarehouseId,
  );
  const duplicateBatch =
    new Set(items.map((item) => item.batchId).filter(Boolean)).size !==
    items.filter((item) => item.batchId).length;
  const itemsValid =
    items.length > 0 &&
    items.every((item) => {
      const batch = availableBatches.find(
        (candidate) => candidate.id === item.batchId,
      );
      return batch && item.quantity > 0 && item.quantity <= batch.quantity;
    });
  const formValid = Boolean(
    effectiveCarrierOrganizationId &&
    trackingCode.trim() &&
    (sourceType === "ORDER"
      ? selectedOrder && orderWarehouse && orderShipmentItems.length > 0
      : effectiveOriginWarehouseId &&
        destinationName.trim() &&
        destinationAddress.trim() &&
        itemsValid &&
        !duplicateBatch),
  );

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const labelClass =
    "mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500";

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Tạo chuyến hàng"
      className="max-w-4xl"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!formValid || isPending) return;
          if (sourceType === "ORDER" && selectedOrder && orderWarehouse) {
            onSubmit({
              idempotencyKey: crypto.randomUUID(),
              orderId: selectedOrder.id,
              originWarehouseId: orderWarehouse.id,
              carrierOrganizationId: effectiveCarrierOrganizationId,
              routeType,
              trackingCode: trackingCode.trim() || undefined,
              destinationName: selectedOrder.user.fullName,
              destinationAddress: selectedOrder.shippingAddress,
              destinationPhone: selectedOrder.phone,
              items: orderShipmentItems,
            });
            return;
          }
          onSubmit({
            idempotencyKey: crypto.randomUUID(),
            originWarehouseId: effectiveOriginWarehouseId,
            carrierOrganizationId: effectiveCarrierOrganizationId,
            routeType,
            trackingCode: trackingCode.trim() || undefined,
            destinationName: destinationName.trim(),
            destinationAddress: destinationAddress.trim(),
            destinationPhone: destinationPhone.trim() || undefined,
            items,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSourceType("ORDER")}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              sourceType === "ORDER"
                ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400"
                : "text-slate-500"
            }`}
          >
            Xuất theo đơn hàng
          </button>
          <button
            type="button"
            onClick={() => setSourceType("MANUAL")}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              sourceType === "MANUAL"
                ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400"
                : "text-slate-500"
            }`}
          >
            Điều chuyển thủ công
          </button>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
          {sourceType === "ORDER"
            ? "Chọn đơn đã đóng gói. Người nhận, địa chỉ và các lô đã giữ được lấy trực tiếp từ đơn để tránh nhập sai hoặc xuất trùng."
            : "Chỉ dùng cho điều chuyển không phát sinh từ đơn bán. Hệ thống khóa tồn và kiểm tra lại tại server để chống cấp phát trùng."}
          {" "}Sau khi tạo, trạng thái giao hàng do hãng vận chuyển cập nhật qua webhook/tracking ngoài.
        </div>

        {sourceType === "ORDER" && (
          <div>
            <label className={labelClass}>Đơn sẵn sàng xuất *</label>
            <select
              value={effectiveFulfillmentKey}
              onChange={(event) =>
                setSelectedFulfillmentKey(event.target.value)
              }
              className={inputClass}
              required
            >
              {fulfillmentOrders.length === 0 && (
                <option value="">
                  -- Không có đơn đã đóng gói tại kho của bạn --
                </option>
              )}
              {fulfillmentOrders.map((order) => (
                <option key={order.fulfillmentKey} value={order.fulfillmentKey}>
                  #{order.id.slice(0, 8).toUpperCase()} · {order.user.fullName}{" "}
                  ·{" "}
                  {order.seller.sellerProfile?.displayName ??
                    order.seller.fullName}{" "}
                  · {order.warehouse.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Kho xuất *</label>
            {sourceType === "ORDER" ? (
              <div className={`${inputClass} bg-slate-50 dark:bg-slate-800`}>
                {orderWarehouse
                  ? `${orderWarehouse.name} · ${orderWarehouse.code}`
                  : "Chưa xác định"}
              </div>
            ) : (
              <select
                value={effectiveOriginWarehouseId}
                onChange={(event) => {
                  setOriginWarehouseId(event.target.value);
                  setItems([{ batchId: "", quantity: 1 }]);
                }}
                className={inputClass}
                required
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} · {warehouse.code}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelClass}>Đơn vị vận chuyển *</label>
            <select
              value={effectiveCarrierOrganizationId}
              onChange={(event) => setCarrierOrganizationId(event.target.value)}
              className={inputClass}
              required
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} · {organization.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tuyến giao nhận *</label>
            <select
              value={routeType}
              onChange={(event) =>
                setRouteType(event.target.value as ShipmentRouteType)
              }
              className={inputClass}
            >
              {Object.entries(routeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Mã vận đơn từ hãng *</label>
            <input
              value={trackingCode}
              onChange={(event) => setTrackingCode(event.target.value)}
              className={inputClass}
              placeholder="VD: GHN123456789"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Tên điểm nhận/người nhận *</label>
            {sourceType === "ORDER" ? (
              <div className={`${inputClass} bg-slate-50 dark:bg-slate-800`}>
                {selectedOrder?.user.fullName ?? "Chưa xác định"}
              </div>
            ) : (
              <input
                value={destinationName}
                onChange={(event) => setDestinationName(event.target.value)}
                className={inputClass}
                required
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Số điện thoại</label>
            {sourceType === "ORDER" ? (
              <div className={`${inputClass} bg-slate-50 dark:bg-slate-800`}>
                {selectedOrder?.phone ?? "Chưa có"}
              </div>
            ) : (
              <input
                value={destinationPhone}
                onChange={(event) => setDestinationPhone(event.target.value)}
                className={inputClass}
                inputMode="tel"
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Địa chỉ giao *</label>
            {sourceType === "ORDER" ? (
              <div
                className={`${inputClass} min-h-20 bg-slate-50 dark:bg-slate-800`}
              >
                {selectedOrder?.shippingAddress ?? "Chưa xác định"}
              </div>
            ) : (
              <textarea
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                required
              />
            )}
          </div>
        </div>

        {sourceType === "ORDER" ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <PackagePlus className="h-4 w-4 text-emerald-600" /> Lô đã giữ cho
              đơn
            </h3>
            {selectedOrder?.items.map((item) =>
              item.batchReservations.map((reservation) => (
                <div
                  key={`${item.id}:${reservation.batch.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
                >
                  <span>
                    <strong>{item.product.name}</strong> ·{" "}
                    {reservation.batch.batchNumber}
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {reservation.quantity}
                  </span>
                </div>
              )),
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <PackagePlus className="h-4 w-4 text-emerald-600" /> Phân bổ
                  lô hàng
                </h3>
                <p className="text-xs text-slate-400">
                  Chỉ hiển thị lô đã đạt kiểm định và còn tồn.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    { batchId: "", quantity: 1 },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Thêm lô
              </Button>
            </div>
            {items.map((item, index) => {
              const batch = availableBatches.find(
                (candidate) => candidate.id === item.batchId,
              );
              return (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_120px_40px] gap-2"
                >
                  <select
                    aria-label={`Lô hàng ${index + 1}`}
                    value={item.batchId}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, batchId: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    className={inputClass}
                    required
                  >
                    <option value="">-- Chọn lô --</option>
                    {availableBatches.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.batchNumber} ·{" "}
                        {candidate.inventory.product.name} · Seller:{" "}
                        {candidate.inventory.product.seller?.sellerProfile
                          ?.displayName ??
                          candidate.inventory.product.seller?.fullName ??
                          "Chưa xác định"}{" "}
                        · còn {candidate.quantity}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Số lượng lô ${index + 1}`}
                    type="number"
                    min={1}
                    max={batch?.quantity}
                    value={item.quantity}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                quantity: Number(event.target.value),
                              }
                            : candidate,
                        ),
                      )
                    }
                    className={inputClass}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-10 p-0 text-red-500"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) =>
                        current.filter(
                          (_, candidateIndex) => candidateIndex !== index,
                        ),
                      )
                    }
                    aria-label="Xóa lô"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {duplicateBatch && (
              <p className="text-xs font-semibold text-red-600">
                Một lô đang được chọn nhiều lần.
              </p>
            )}
          </div>
        )}

        {(organizations.length === 0 ||
          (sourceType === "ORDER"
            ? fulfillmentOrders.length === 0
            : eligibleBatches.length === 0)) && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
            {sourceType === "ORDER"
              ? "Cần đơn ở trạng thái Đang đóng gói, có reservation hợp lệ tại một kho bạn quản lý và một đơn vị vận chuyển."
              : "Cần ít nhất một đơn vị vận chuyển và một lô đạt kiểm định còn tồn để tạo chuyến."}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={!formValid || isPending}
            isLoading={isPending}
          >
            Tạo chuyến hàng
          </Button>
        </div>
      </form>
    </Modal>
  );
}
