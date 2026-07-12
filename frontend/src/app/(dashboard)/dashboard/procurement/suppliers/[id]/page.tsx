'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Briefcase, Star, Clock, AlertTriangle, TrendingUp, DollarSign, Package } from 'lucide-react';
import Link from 'next/link';

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', params.id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/suppliers/${params.id}`);
      return res.data.data;
    },
  });

  if (isLoading) return <div className="flex justify-center p-16"><LoadingSpinner /></div>;
  if (!supplier) return <div className="p-16 text-center text-slate-500">Không tìm thấy nhà cung cấp</div>;

  // Mocking metrics that would normally come from the backend's analytics engine
  const metrics = {
    deliveryPerformance: '98%',
    avgLeadTime: '3.2 ngày',
    rejectionRate: '1.5%',
    totalSpend: '1.2B VND',
    outstandingPOs: 4,
    purchaseTrend: '+15%',
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Link href="/dashboard/procurement" className="hover:text-emerald-600 flex items-center gap-1"><Briefcase className="w-4 h-4"/> Mua sắm ERP</Link>
        <span>/</span>
        <Link href="/dashboard/procurement/suppliers" className="hover:text-emerald-600">Nhà cung cấp</Link>
        <span>/</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{supplier.code}</span>
      </div>

      <div className="flex justify-between items-start bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              {supplier.name}
              {supplier.isActive ? (
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-semibold">Hoạt động</span>
              ) : (
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs font-semibold">Ngưng GD</span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{supplier.supplierType} | {supplier.email} | {supplier.phone}</p>
            <p className="text-sm text-slate-500">{supplier.address}, {supplier.province}, {supplier.country}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">Đánh giá chung</p>
          <p className="text-3xl font-black text-amber-500">{supplier.rating ? `${supplier.rating} ⭐` : 'N/A'}</p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-800 dark:text-white mt-4">Chỉ số Hiệu suất (KPI)</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 text-center">
            <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold uppercase">Tỉ lệ giao đúng hạn</p>
            <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{metrics.deliveryPerformance}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 text-cyan-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold uppercase">Thời gian chờ (Lead Time)</p>
            <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{metrics.avgLeadTime}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold uppercase">Tỉ lệ hàng lỗi (QA/QC)</p>
            <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{metrics.rejectionRate}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold uppercase">Tổng chi tiêu (YTD)</p>
            <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{metrics.totalSpend}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 text-center">
            <Package className="w-6 h-6 text-violet-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold uppercase">PO Đang mở</p>
            <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{metrics.outstandingPOs}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 text-center">
            <Star className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold uppercase">Xu hướng mua</p>
            <p className="text-xl font-black text-emerald-600 mt-1">{metrics.purchaseTrend}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white">Thông tin Tài chính</h3>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs">Mã số thuế</p>
              <p className="font-medium text-slate-700 dark:text-slate-200">{supplier.taxCode || 'Chưa cập nhật'}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Điều khoản thanh toán</p>
              <p className="font-medium text-slate-700 dark:text-slate-200">{supplier.paymentTerms || 'Chưa cập nhật'}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Ngân hàng</p>
              <p className="font-medium text-slate-700 dark:text-slate-200">{supplier.bankName || 'Chưa cập nhật'}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Số tài khoản</p>
              <p className="font-medium text-slate-700 dark:text-slate-200 font-mono">{supplier.bankAccount || 'Chưa cập nhật'}</p>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">Lịch sử giao dịch gần đây</h3>
          </div>
          {supplier.orders && supplier.orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Mã PO</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Ngày tạo</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.orders.map((po: any) => (
                    <tr key={po.id} className="border-b border-slate-50 dark:border-slate-800/60">
                      <td className="px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">
                        <Link href={`/dashboard/procurement/orders/${po.id}`} className="hover:text-emerald-600 hover:underline">{po.code}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{new Date(po.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td className="px-4 py-3">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs font-semibold">{po.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">Chưa có giao dịch nào</div>
          )}
        </div>
      </div>
    </div>
  );
}
