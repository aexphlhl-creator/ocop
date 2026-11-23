export type ShipmentRouteType =
  "DIRECT_TO_CUSTOMER" | "VIA_DISTRIBUTOR" | "VIA_RETAIL" | "INTERNAL_TRANSFER";

export type ShipmentStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "HANDED_OVER"
  | "IN_TRANSIT"
  | "AT_DISTRIBUTOR"
  | "AT_RETAIL"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "RETURNING"
  | "RETURNED"
  | "CANCELLED";

export type ShipmentEventType =
  | "PICKED_UP"
  | "ARRIVED_DISTRIBUTOR"
  | "ARRIVED_RETAIL"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "DELIVERY_RETRIED"
  | "RETURN_STARTED"
  | "RETURNED";

export interface LogisticsOrganization {
  id: string;
  code: string;
  name: string;
  type: "INTERNAL" | "THIRD_PARTY";
  providerCode?: string | null;
  trackingUrlTemplate?: string | null;
  isActive?: boolean;
}

export interface LogisticsUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  logisticsMemberships?: Array<{ organization: LogisticsOrganization }>;
}

export interface ShipmentBatchOption {
  id: string;
  batchNumber: string;
  quantity: number;
  qualityStatus: string;
  inventory: {
    warehouse: { id: string; name: string; code: string };
    product: {
      name: string;
      unit?: string;
      seller?: {
        fullName: string;
        sellerProfile?: { displayName: string } | null;
      };
    };
  };
}

export interface FulfillmentOrderOption {
  id: string;
  fulfillmentKey: string;
  warehouse: { id: string; code: string; name: string };
  status: "PACKING" | "PROCESSING";
  paymentMethod: "COD" | "VNPAY";
  paymentStatus: string;
  shippingAddress: string;
  phone: string;
  createdAt: string;
  user: { fullName: string; email: string };
  seller: {
    id: string;
    fullName: string;
    sellerProfile?: { displayName: string } | null;
  };
  items: Array<{
    id: string;
    quantity: number;
    product: { id: string; name: string };
    batchReservations: Array<{
      quantity: number;
      status: "ACTIVE" | "DEDUCTED";
      batch: {
        id: string;
        batchNumber: string;
        quantity: number;
        inventory: {
          warehouse: { id: string; code: string; name: string };
        };
      };
    }>;
  }>;
}

export interface ShipmentRecord {
  id: string;
  shipmentNumber: string;
  version: number;
  status: ShipmentStatus;
  routeType: ShipmentRouteType;
  trackingCode?: string | null;
  destinationName: string;
  destinationAddress: string;
  destinationPhone?: string | null;
  createdAt: string;
  updatedAt: string;
  handedOverAt?: string | null;
  deliveredAt?: string | null;
  cancellationReason?: string | null;
  carrierOrganization: LogisticsOrganization;
  originWarehouse: {
    id: string;
    code: string;
    name: string;
    address: string;
  };
  items: Array<{
    id: string;
    quantity: number;
    batch: {
      id: string;
      batchNumber: string;
      inventory: {
        product: {
          name: string;
          unit?: string;
          seller: {
            fullName: string;
            sellerProfile?: { displayName: string } | null;
          };
        };
      };
    };
  }>;
  assignments: Array<{
    id: string;
    logisticsUserId: string;
    status: "ASSIGNED" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
    assignmentReason?: string | null;
    cancellationReason?: string | null;
    logisticsUser: LogisticsUser;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    fromStatus?: ShipmentStatus | null;
    toStatus: ShipmentStatus;
    eventTime: string;
    location?: string | null;
    recipientName?: string | null;
    failureReason?: string | null;
    note?: string | null;
    imageUrls: string[];
    attachmentUrls: string[];
    actor?: { fullName: string; email: string } | null;
  }>;
}
