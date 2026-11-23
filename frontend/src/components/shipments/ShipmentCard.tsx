'use client';

import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Handshake,
  MapPin,
  Package,
  Route,
  Truck,
  XCircle,
  Printer,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { carrierTrackingUrl, routeLabels, statusLabels } from './shipment-workflow';
import { ShipmentActionKind } from './ShipmentActionModal';
import { ShipmentRecord } from './types';
import { ShipmentWaybillModal } from './ShipmentWaybillModal';

interface ShipmentCardProps {
  shipment: ShipmentRecord;
  role: string;
  onAction: (kind: ShipmentActionKind, shipment: ShipmentRecord) => void;
}

const statusStyles: Record<string, string> = {
  DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  RETURNED: 'bg-violet-50 text-violet-700 border-violet-200',
  DELIVERY_FAILED: 'bg-red-50 text-red-700 border-red-200',
  IN_TRANSIT: 'bg-blue-50 text-blue-700 border-blue-200',
  OUT_FOR_DELIVERY: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

export function ShipmentCard({ shipment, role, onAction }: ShipmentCardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showWaybill, setShowWaybill] = useState(false);
  const trackingUrl = carrierTrackingUrl(shipment);
  const managerCanHandover = role === 'WAREHOUSE_MANAGER' && shipment.status === 'ASSIGNED';
  const managerCanCancel =
    role === 'WAREHOUSE_MANAGER' && ['DRAFT', 'ASSIGNED'].includes(shipment.status);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-black text-slate-900 dark:text-white">
              {shipment.shipmentNumber}
            </h2>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusStyles[shipment.status] ?? 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              {statusLabels[shipment.status]}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              v{shipment.version}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Route className="h-3.5 w-3.5" />{routeLabels[shipment.routeType]}</span>
            <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />{shipment.carrierOrganization.name}</span>
            <span className="font-mono">{shipment.trackingCode || 'Chưa có mã vận đơn'}</span>
            {trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700"
              >
                Tracking ngoài <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowWaybill(true)}
            className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          >
            <Printer className="h-4 w-4" /> In Vận đơn / Phiếu xuất
          </Button>
          {managerCanHandover && (
            <Button type="button" size="sm" onClick={() => onAction('handover', shipment)}>
              <Handshake className="h-4 w-4" /> Bàn giao hãng
            </Button>
          )}
          {managerCanCancel && (
            <Button type="button" size="sm" variant="destructive" onClick={() => onAction('cancel', shipment)}>
              <XCircle className="h-4 w-4" /> Hủy
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Điểm đến</p>
          <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{shipment.destinationName}</p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{shipment.destinationAddress}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Theo dõi vận chuyển</p>
          <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{shipment.carrierOrganization.name}</p>
          <p className="mt-1 font-mono text-xs text-slate-500">{shipment.trackingCode}</p>
          <p className="mt-1 text-xs text-slate-500">Kho xuất: {shipment.originWarehouse.name}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hàng hóa</p>
          <div className="mt-1 space-y-1">
            {shipment.items.map((item) => (
              <p key={item.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <Package className="h-3.5 w-3.5 text-blue-500" />
                {item.batch.batchNumber} · {item.batch.inventory.product.name} · <strong>{item.quantity}</strong>
              </p>
            ))}
          </div>
        </div>
      </div>

      {shipment.status === 'DELIVERY_FAILED' && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Chuyến giao thất bại theo trạng thái hãng vận chuyển. Theo dõi trên
          trang carrier hoặc xử lý hoàn hàng khi webhook carrier gửi trạng thái
          tương ứng.
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowHistory((value) => !value)}
        className="flex w-full items-center justify-center gap-2 border-t border-slate-100 px-5 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
      >
        <CalendarClock className="h-4 w-4" /> Audit trail ({shipment.events.length})
        {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {showHistory && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/30">
          <ol className="space-y-3">
            {shipment.events.map((event) => (
              <li key={event.id} className="relative border-l-2 border-emerald-200 pl-4 text-xs">
                <p className="font-bold text-slate-800 dark:text-slate-100">{event.eventType} → {statusLabels[event.toStatus]}</p>
                <p className="mt-0.5 text-slate-500">{event.actor?.fullName ?? 'Webhook nhà vận chuyển'} · {new Date(event.eventTime).toLocaleString('vi-VN')} {event.location ? `· ${event.location}` : ''}</p>
                {(event.failureReason || event.note) && <p className="mt-1 text-slate-600 dark:text-slate-300">{event.failureReason || event.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ShipmentWaybillModal
        isOpen={showWaybill}
        onClose={() => setShowWaybill(false)}
        shipment={shipment}
      />
    </article>
  );
}
