import React from 'react';
import { LoadingSpinner } from '../ui/loading-spinner';
import { Button } from '../ui/button';
import { MapPin, User } from 'lucide-react';

type HistoryFilter = {
  stageId: string;
  actorName: string;
  dateFrom: string;
  dateTo: string;
  page: number;
};

type HistoryItem = {
  id: string;
  batchId: string;
  actorName: string;
  location: string;
  eventTime?: string | null;
  createdAt: string;
  stage?: { name?: string; displayName?: string } | null;
  batch?: {
    batchNumber?: string;
    inventory?: { product?: { name?: string } | null } | null;
  } | null;
};

type HistoryData = {
  items: HistoryItem[];
  meta?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
  };
};

interface BatchHistoryProps {
  historyData?: HistoryData;
  isLoading: boolean;
  filter: HistoryFilter;
  setFilter: React.Dispatch<React.SetStateAction<HistoryFilter>>;
  onSelectBatch: (batchId: string) => void;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function BatchHistory({ historyData, isLoading, filter, setFilter, onSelectBatch }: BatchHistoryProps) {
  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Công đoạn</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Sản phẩm</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Địa điểm & Người thực hiện</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Thời gian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {historyData?.items?.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-slate-400">Không có dữ liệu lịch sử</td>
              </tr>
            ) : (
              historyData?.items?.map((item) => (
                <tr 
                  key={item.id} 
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                  onClick={() => onSelectBatch(item.batchId)}
                >
                  <td className="px-5 py-3 font-medium text-slate-700 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      {item.stage?.displayName || item.stage?.name}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 mb-0.5">{item.batch?.batchNumber}</div>
                    <div className="text-slate-600 dark:text-slate-300 line-clamp-1 max-w-[200px]">{item.batch?.inventory?.product?.name}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1 line-clamp-1"><MapPin className="w-3 h-3" /> {item.location}</span>
                      <span className="flex items-center gap-1 line-clamp-1"><User className="w-3 h-3" /> {item.actorName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400 text-xs">
                    {formatDate(item.eventTime ?? item.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {historyData?.meta && historyData.meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-400">
            Trang {historyData.meta.currentPage} / {historyData.meta.totalPages} ({historyData.meta.totalItems} bản ghi)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={filter.page <= 1}
              onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))}
              className="text-xs px-3 py-1.5 h-auto"
            >
              ← Trước
            </Button>
            <Button
              variant="outline"
              disabled={filter.page >= historyData.meta.totalPages}
              onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}
              className="text-xs px-3 py-1.5 h-auto"
            >
              Sau →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
