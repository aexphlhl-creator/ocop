import {
  ShipmentEventType,
  ShipmentRecord,
  ShipmentRouteType,
  ShipmentStatus,
} from './types';

export const statusLabels: Record<ShipmentStatus, string> = {
  DRAFT: 'Nháp',
  ASSIGNED: 'Đã tạo vận đơn',
  HANDED_OVER: 'Đã bàn giao hãng',
  IN_TRANSIT: 'Đang vận chuyển',
  AT_DISTRIBUTOR: 'Tại nhà phân phối',
  AT_RETAIL: 'Tại điểm bán lẻ',
  OUT_FOR_DELIVERY: 'Đang giao chặng cuối',
  DELIVERED: 'Đã giao',
  DELIVERY_FAILED: 'Giao thất bại',
  RETURNING: 'Đang hoàn hàng',
  RETURNED: 'Đã hoàn',
  CANCELLED: 'Đã hủy',
};

export const routeLabels: Record<ShipmentRouteType, string> = {
  DIRECT_TO_CUSTOMER: 'Giao thẳng khách hàng',
  VIA_DISTRIBUTOR: 'Qua nhà phân phối',
  VIA_RETAIL: 'Qua nhà phân phối và bán lẻ',
  INTERNAL_TRANSFER: 'Chuyển kho qua hãng vận chuyển',
};

export const eventLabels: Record<ShipmentEventType, string> = {
  PICKED_UP: 'Hãng đã nhận hàng',
  ARRIVED_DISTRIBUTOR: 'Đã đến nhà phân phối',
  ARRIVED_RETAIL: 'Đã đến điểm bán lẻ',
  OUT_FOR_DELIVERY: 'Bắt đầu giao chặng cuối',
  DELIVERED: 'Xác nhận đã giao',
  DELIVERY_FAILED: 'Ghi nhận giao thất bại',
  DELIVERY_RETRIED: 'Thử giao lại',
  RETURN_STARTED: 'Bắt đầu hoàn hàng',
  RETURNED: 'Xác nhận đã hoàn về kho',
};

export function nextShipmentEvents(shipment: ShipmentRecord): ShipmentEventType[] {
  const { status, routeType } = shipment;
  if (status === 'HANDED_OVER') return ['PICKED_UP'];
  if (status === 'DELIVERY_FAILED') return ['DELIVERY_RETRIED', 'RETURN_STARTED'];
  if (status === 'DELIVERED') return ['RETURN_STARTED'];
  if (status === 'RETURNING') return ['RETURNED'];

  const failure: ShipmentEventType[] = [
    'DELIVERY_FAILED',
  ];
  if (status === 'IN_TRANSIT') {
    if (routeType === 'DIRECT_TO_CUSTOMER') return ['OUT_FOR_DELIVERY', ...failure];
    if (routeType === 'VIA_DISTRIBUTOR' || routeType === 'VIA_RETAIL') {
      return ['ARRIVED_DISTRIBUTOR', ...failure];
    }
    return ['DELIVERED', ...failure];
  }
  if (status === 'AT_DISTRIBUTOR') {
    return routeType === 'VIA_RETAIL'
      ? ['ARRIVED_RETAIL', ...failure]
      : ['OUT_FOR_DELIVERY', ...failure];
  }
  if (status === 'AT_RETAIL') return ['OUT_FOR_DELIVERY', ...failure];
  if (status === 'OUT_FOR_DELIVERY') return ['DELIVERED', ...failure];
  return [];
}

export function activeAssignment(shipment: ShipmentRecord) {
  return shipment.assignments.find(
    (assignment) => assignment.status === 'ASSIGNED' || assignment.status === 'IN_TRANSIT',
  );
}

export function carrierTrackingUrl(shipment: ShipmentRecord) {
  const template = shipment.carrierOrganization.trackingUrlTemplate?.trim();
  const code = shipment.trackingCode?.trim();
  if (!template || !code) return undefined;
  return template.replaceAll('{trackingCode}', encodeURIComponent(code));
}
