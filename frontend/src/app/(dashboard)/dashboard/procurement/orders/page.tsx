'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ClipboardList, Search, Filter, Eye, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';
import Link from 'next/link';

const PO_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-600' },
  SUBMITTED: { label: 'Trình duyệt', color: 'bg-blue-50 text-blue-600' },
  APPROVED: { label: 'Đã duyệt', color: 'bg-emerald-50 text-emerald-600' },
  ORDERED: { label: 'Đã đặt hàng', color: 'bg-violet-50 text-violet-600' },
  RECEIVING: { label: 'Đang nhận', color: 'bg-cyan-50 text-cyan-600' },
  PARTIALLY_RECEIVED: { label: 'Nhận một phần', color: 'bg-amber-50 text-amber-600' },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: 'Đã đóng', color: 'bg-slate-200 text-slate-700' },
  CANCELLED: { label: 'Đã hủy', color: 'bg-rose-50 text-rose-600' },
};

export default function PurchaseOrderListPage() {
  const [filter, setFilter] = useState({
    search: '',
    status: '',
    startDate: '',
    endDate: '',
    page: 1,
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['po-list', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.search) params.append('search', filter.search);
      if (filter.status) params.append('status', filter.status);
      if (filter.startDate) params.append('startDate', filter.startDate);
      if (filter.endDate) params.append('endDate', filter.endDate);
      params.append('page', String(filter.page));
      params.append('limit', '15');

      const res = await api.get(`/api/v1/purchase-orders?${params}`);
      return res.data;
    },
  });

  const orders = ordersData?.data ?? [];
  const meta = ordersData?.meta ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Link href="/dashboard/procurement" className="hover:text-emerald-600 flex items-center gap-1"><Briefcase className="w-4 h-4"/> Mua sắm ERP</Link>
        <span>/</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">Đơn mua hàng (PO)</span>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" /> Đơn Mua Hàng (PO)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Quản lý toàn bộ vòng đời đơn mua sắm từ tạo nháp đến đóng sổ.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <Filter className="w-4 h-4" /> Bộ lọc tìm kiếm
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tìm kiếm</label>
            <div className="relative">
              <Input
                placeholder="Mã PO, Tên NCC..."
                value={filter.search}
                onChange={(e: any) => setFilter((f) => ({ ...f, search: e.target.value, page: 1 }))}
              />
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Trạng thái</label>
            <select
              value={filter.status}
              onChange={(e: any) => setFilter((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tất cả</option>
              {Object.entries(PO_STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Từ ngày</label>
            <Input type="date" value={filter.startDate} onChange={(e: any) => setFilter((f) => ({ ...f, startDate: e.target.value, page: 1 }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Đến ngày</label>
            <Input type="date" value={filter.endDate} onChange={(e: any) => setFilter((f) => ({ ...f, endDate: e.target.value, page: 1 }))} />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ClipboardList className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Chưa có đơn mua hàng nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Mã PO</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Nhà cung cấp</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Kho nhận</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Mặt hàng</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Ngày tạo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po: any) => {
                  const statusCfg = PO_STATUS_CONFIG[po.status] || { label: po.status, color: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={po.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-400">{po.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{po.supplier?.name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{po.warehouse?.name}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {po.items?.length || 0} SP
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{new Date(po.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/procurement/orders/${po.id}`} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-2 py-1.5 rounded-lg w-max transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Chi tiết
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">Trang {meta.currentPage}/{meta.totalPages} ({meta.totalItems} PO)</p>
            <div className="flex gap-2">
              <Button disabled={filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))} variant="outline" size="sm"><ChevronLeft className="w-4 h-4"/></Button>
              <Button disabled={filter.page >= meta.totalPages} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))} variant="outline" size="sm"><ChevronRight className="w-4 h-4"/></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
