import React from 'react';
import { Eye, Route, QrCode, ShieldCheck, MapPin } from 'lucide-react';
import type { BatchSummary } from '@/types/supply-chain';
import { Button } from '../ui/button';
import { lotStatusLabel } from './lot-status';

interface BatchTableProps {
  batches: BatchSummary[];
  onSelect: (batchId: string, tab?: 'overview' | 'timeline' | 'map' | 'blockchain') => void;
  onShowQR: (batch: BatchSummary) => void;
}

export function BatchTable({ batches, onSelect, onShowQR }: BatchTableProps) {
  const getStageBadge = (journeys: NonNullable<BatchSummary['journeys']>) => {
    if (!journeys || journeys.length === 0) return <span className="text-slate-400 italic text-xs">Chưa có hành trình</span>;
    const last = journeys[journeys.length - 1];
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
        <MapPin className="w-3 h-3 text-slate-400" />
        {last.stage?.displayName || last.stage?.name}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Batch Code</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Sản phẩm</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Người bán</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Trạng thái</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Công đoạn HT</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Tồn kho</th>
              <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {batches.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">Không có lô hàng nào</td>
              </tr>
            ) : (
              batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-5 py-3 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                    <button 
                      onClick={() => onSelect(batch.id, 'overview')}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      {batch.batchNumber}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                      {batch.inventory?.product?.name || '---'}
                    </div>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <div className="text-slate-500 text-xs line-clamp-1">
                      {batch.inventory?.product?.seller?.sellerProfile?.displayName ?? batch.inventory?.product?.seller?.fullName ?? '---'}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{lotStatusLabel(batch)}</span>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    {getStageBadge(batch.journeys || [])}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{batch.quantity}</span>
                    <span className="text-xs text-slate-400 ml-1">/ {batch.initialQuantity}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-8 w-8 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => onSelect(batch.id, 'overview')} title="Tổng quan">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hidden sm:inline-flex" onClick={() => onSelect(batch.id, 'timeline')} title="Hành trình">
                        <Route className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 text-slate-500 hover:text-purple-600 hover:bg-purple-50 hidden md:inline-flex" onClick={() => onSelect(batch.id, 'blockchain')} title="Blockchain">
                        <ShieldCheck className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-200" onClick={() => onShowQR(batch)} title="QR Code">
                        <QrCode className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
