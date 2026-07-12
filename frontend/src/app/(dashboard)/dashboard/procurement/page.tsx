'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, AlertCircle, Clock, Truck, Star, Users, ClipboardList, DollarSign, TrendingUp, PackageOpen } from 'lucide-react';
import Link from 'next/link';

function StatCard({ title, value, icon: Icon, colorClass, detail, isLoading }: any) {
  return (
    <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden group">
      <CardContent className="p-6 relative">
        <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${colorClass} opacity-10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110 duration-500`} />
        
        <div className="flex justify-between items-start relative z-10">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
            {isLoading ? (
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            ) : (
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{value}</h3>
              </div>
            )}
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              {detail}
            </p>
          </div>
          
          <div className={`p-4 rounded-2xl bg-gradient-to-br ${colorClass} shadow-lg text-white group-hover:rotate-12 transition-transform duration-500`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProcurementDashboardPage() {
  const { user } = useAuthStore();
  const isAdminOrSeller = user?.role === 'ADMIN' || user?.role === 'SELLER';

  const { data: stats, isLoading } = useQuery({
    queryKey: ['procurement-dashboard-stats'],
    queryFn: async () => {
      // Mocked endpoint - In real app, this would hit a dedicated dashboard endpoint
      // const res = await api.get('/api/v1/procurement/dashboard');
      // return res.data.data;
      
      // Returning mock data for now since backend endpoint is not built yet
      return {
        overdueOrders: 3,
        receivingToday: 12,
        supplierRating: '4.8/5.0',
        avgLeadTime: '4.5 ngày',
        topSupplier: 'VinaCafe',
        pendingApproval: 5,
        totalSpend: '2.5B VND',
        openOrders: 42,
      };
    },
    enabled: isAdminOrSeller,
  });

  if (!isAdminOrSeller) {
    return <div className="p-6 text-center text-slate-500">Bạn không có quyền truy cập trang này.</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Briefcase className="w-10 h-10 text-emerald-600" />
            Dashboard Mua Sắm (ERP)
          </h1>
          <p className="text-slate-500 mt-2 text-lg font-medium">Quản lý toàn diện chuỗi cung ứng, nhà cung cấp và đơn mua hàng</p>
        </div>
        
        <div className="flex gap-4">
          <Link href="/dashboard/procurement/suppliers" className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all">
            Quản lý Nhà Cung Cấp
          </Link>
          <Link href="/dashboard/procurement/orders" className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Đơn Mua Hàng (PO)
          </Link>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Đơn đang chờ duyệt"
          value={stats?.pendingApproval ?? 0}
          icon={AlertCircle}
          colorClass="from-amber-400 to-orange-500"
          detail="Cần xử lý ngay"
          isLoading={isLoading}
        />
        <StatCard
          title="Nhận hàng hôm nay"
          value={stats?.receivingToday ?? 0}
          icon={Truck}
          colorClass="from-blue-400 to-indigo-500"
          detail="Tại các kho"
          isLoading={isLoading}
        />
        <StatCard
          title="Đơn hàng trễ hẹn"
          value={stats?.overdueOrders ?? 0}
          icon={Clock}
          colorClass="from-red-400 to-rose-600"
          detail="Cần giục NCC"
          isLoading={isLoading}
        />
        <StatCard
          title="Tổng chi tiêu (Tháng)"
          value={stats?.totalSpend ?? '0'}
          icon={DollarSign}
          colorClass="from-emerald-400 to-teal-600"
          detail="Tăng 12% so với tháng trước"
          isLoading={isLoading}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Đánh giá NCC"
          value={stats?.supplierRating ?? '0'}
          icon={Star}
          colorClass="from-yellow-400 to-amber-500"
          detail="Trung bình 30 ngày qua"
          isLoading={isLoading}
        />
        <StatCard
          title="Thời gian giao hàng (Avg)"
          value={stats?.avgLeadTime ?? '0'}
          icon={TrendingUp}
          colorClass="from-cyan-400 to-blue-500"
          detail="Rút ngắn 0.5 ngày"
          isLoading={isLoading}
        />
        <StatCard
          title="Đơn hàng đang mở (Open)"
          value={stats?.openOrders ?? 0}
          icon={PackageOpen}
          colorClass="from-violet-400 to-purple-600"
          detail="Đang xử lý / Đang giao"
          isLoading={isLoading}
        />
        <StatCard
          title="Nhà cung cấp nổi bật"
          value={stats?.topSupplier ?? '-'}
          icon={Users}
          colorClass="from-fuchsia-400 to-pink-600"
          detail="Doanh số mua cao nhất"
          isLoading={isLoading}
        />
      </div>

      {/* Extra Section: Quick Links or Charts would go here */}
      <div className="mt-8 bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-100 dark:border-slate-800 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Tính năng ERP Nổi Bật</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:shadow-lg transition-all duration-300">
             <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mb-4 text-emerald-600">
               <ClipboardList className="w-6 h-6" />
             </div>
             <h3 className="font-bold text-lg mb-2">Quy trình duyệt tự động</h3>
             <p className="text-slate-500 text-sm leading-relaxed">Hệ thống phân quyền 3 lớp: Tạo nháp, Trình duyệt, Phê duyệt. Kiểm soát rủi ro mua sắm một cách chặt chẽ.</p>
           </div>
           <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:shadow-lg transition-all duration-300">
             <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4 text-blue-600">
               <Truck className="w-6 h-6" />
             </div>
             <h3 className="font-bold text-lg mb-2">Quản lý nhận hàng 3 bước</h3>
             <p className="text-slate-500 text-sm leading-relaxed">Nhận hàng, Kiểm định chất lượng (QA/QC), Nhập kho tự động liên kết với mã lô (Batch) & Supply Chain.</p>
           </div>
           <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:shadow-lg transition-all duration-300">
             <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center mb-4 text-violet-600">
               <Star className="w-6 h-6" />
             </div>
             <h3 className="font-bold text-lg mb-2">Đánh giá Nhà cung cấp</h3>
             <p className="text-slate-500 text-sm leading-relaxed">Theo dõi KPI theo thời gian thực như: thời gian giao hàng trễ, tỷ lệ hàng lỗi, biểu đồ giá cả cạnh tranh.</p>
           </div>
        </div>
      </div>
    </div>
  );
}
