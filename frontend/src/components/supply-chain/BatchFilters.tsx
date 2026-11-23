import React from 'react';
import { Filter, X } from 'lucide-react';
import { Input } from '../ui/input';

interface BatchFiltersProps {
  filter: HistoryFilter;
  setFilter: React.Dispatch<React.SetStateAction<HistoryFilter>>;
  stages: Array<{ id: string; displayName: string }>;
}

interface HistoryFilter { stageId: string; actorName: string; dateFrom: string; dateTo: string; page: number }

export function BatchFilters({ filter, setFilter, stages }: BatchFiltersProps) {
  const hasActiveFilters = filter.stageId || filter.actorName || filter.dateFrom || filter.dateTo;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <Filter className="w-4 h-4" /> Bộ lọc Lịch sử
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Công đoạn</label>
          <select
            value={filter.stageId}
            onChange={(e) => setFilter((f) => ({ ...f, stageId: e.target.value, page: 1 }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Tất cả</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Người thực hiện</label>
          <Input
            placeholder="Tìm theo tên..."
            value={filter.actorName}
            onChange={(e) => setFilter((f) => ({ ...f, actorName: e.target.value, page: 1 }))}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Từ ngày</label>
          <Input
            type="date"
            value={filter.dateFrom}
            onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value, page: 1 }))}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Đến ngày</label>
          <Input
            type="date"
            value={filter.dateTo}
            onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value, page: 1 }))}
          />
        </div>
      </div>
      {hasActiveFilters && (
        <button
          onClick={() => setFilter({ stageId: '', actorName: '', dateFrom: '', dateTo: '', page: 1 })}
          className="mt-3 text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Xóa bộ lọc
        </button>
      )}
    </div>
  );
}
