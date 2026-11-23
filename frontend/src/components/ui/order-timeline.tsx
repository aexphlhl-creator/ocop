import React from 'react';
import { CheckCircle2, Clock, Package, Truck, XCircle, FileText } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Tracking {
  id: string;
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'PACKING'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'RETURNED';
  description?: string | null;
  createdAt: string;
}

interface OrderTimelineProps {
  trackingHistory: Tracking[];
}

export function OrderTimeline({ trackingHistory }: OrderTimelineProps) {
  if (!trackingHistory || trackingHistory.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <FileText className="h-5 w-5 text-amber-500" />;
      case 'PROCESSING':
        return <Package className="h-5 w-5 text-blue-500" />;
      case 'CONFIRMED':
        return <CheckCircle2 className="h-5 w-5 text-blue-500" />;
      case 'PACKING':
        return <Package className="h-5 w-5 text-indigo-500" />;
      case 'SHIPPED':
        return <Truck className="h-5 w-5 text-indigo-500" />;
      case 'DELIVERED':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'CANCELLED':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'RETURNED':
        return <XCircle className="h-5 w-5 text-orange-500" />;
      default:
        return <Clock className="h-5 w-5 text-slate-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Chờ xác nhận';
      case 'CONFIRMED': return 'Đã xác nhận';
      case 'PACKING': return 'Đang đóng gói';
      case 'PROCESSING': return 'Đang xử lý / Chuẩn bị hàng';
      case 'SHIPPED': return 'Đang giao hàng';
      case 'DELIVERED': return 'Giao hàng thành công';
      case 'CANCELLED': return 'Đã hủy';
      case 'RETURNED': return 'Đã hoàn/đổi trả';
      default: return status;
    }
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {trackingHistory.map((event, eventIdx) => (
          <li key={event.id}>
            <div className="relative pb-8">
              {eventIdx !== trackingHistory.length - 1 ? (
                <span
                  className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-700"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white dark:ring-slate-900 bg-slate-50 dark:bg-slate-800"
                  )}>
                    {getStatusIcon(event.status)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {getStatusText(event.status)}
                    </p>
                    {event.description && (
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {event.description}
                      </p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right text-xs text-slate-500">
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString('vi-VN')}
                    </time>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
