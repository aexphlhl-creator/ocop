'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, Search, Filter, Eye, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';
import Link from 'next/link';

export default function SupplierListPage() {
  const [filter, setFilter] = useState({
    search: '',
    supplierType: '',
    page: 1,
  });

  const { data: suppliersData, isLoading } = useQuery({
    queryKey: ['suppliers-list', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.search) params.append('search', filter.search);
      if (filter.supplierType) params.append('supplierType', filter.supplierType);
      params.append('page', String(filter.page));
      params.append('limit', '15');

      const res = await api.get(`/api/v1/suppliers?${params}`);
      return res.data;
    },
  });

  const suppliers = suppliersData?.data ?? [];
  const meta = suppliersData?.meta ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Link href="/dashboard/procurement" className="hover:text-emerald-600 flex items-center gap-1"><Briefcase className="w-4 h-4"/> Mua sắm ERP</Link>
        <span>/</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">Nhà cung cấp</span>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" /> Quản lý Nhà cung cấp
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Danh sách đối tác cung ứng, đánh giá năng lực và lịch sử giao dịch.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <Filter className="w-4 h-4" /> Bộ lọc tìm kiếm
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tìm kiếm</label>
            <div className="relative">
              <Input
                placeholder="Tên NCC, Mã, Email..."
                value={filter.search}
                onChange={(e: any) => setFilter((f) => ({ ...f, search: e.target.value, page: 1 }))}
              />
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Loại hình</label>
            <select
              value={filter.supplierType}
              onChange={(e: any) => setFilter((f) => ({ ...f, supplierType: e.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tất cả loại hình</option>
              <option value="MANUFACTURER">Nhà sản xuất</option>
              <option value="DISTRIBUTOR">Nhà phân phối</option>
              <option value="FARMER">Nông trại / Nông dân</option>
              <option value="OTHER">Khác</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Chưa có nhà cung cấp nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Mã NCC</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Tên NCC</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Loại hình</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Đánh giá</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((sup: any) => (
                  <tr key={sup.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-400">{sup.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{sup.name}</p>
                      <p className="text-xs text-slate-400">{sup.email} | {sup.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-semibold">{sup.supplierType}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-500">
                      {sup.rating ? `${sup.rating} ⭐` : 'Chưa có'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sup.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {sup.isActive ? 'Hoạt động' : 'Ngưng GD'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/procurement/suppliers/${sup.id}`} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-2 py-1.5 rounded-lg w-max transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">Trang {meta.currentPage}/{meta.totalPages} ({meta.totalItems} NCC)</p>
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
