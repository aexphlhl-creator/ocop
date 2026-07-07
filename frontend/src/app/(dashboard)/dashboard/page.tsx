'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { useCurrentUser } from '../../../hooks/use-auth';
import { Shield, ShoppingBag, Store, Newspaper, Users, BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      </div>
    );
  }

  const isSeller = user.role === 'SELLER';

  return (
    <div className="flex flex-col gap-8">
      {/* Welcome header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
          Xin chào, {user.fullName}!
        </h1>
        <p className="text-sm text-slate-400">
          Vai trò của bạn: <span className="font-bold text-emerald-600 uppercase text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">{user.role}</span>
        </p>
      </div>

      {/* Grid of statistics skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {isSeller ? 'Sản phẩm của tôi' : 'Tổng sản phẩm OCOP'}
            </span>
            <ShoppingBag className="h-4.5 w-4.5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">12</div>
            <p className="text-[10px] text-emerald-500 font-semibold mt-1">
              +2 sản phẩm mới tuần này
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {isSeller ? 'Chủ thể sở hữu' : 'Chủ thể sản xuất'}
            </span>
            <Store className="h-4.5 w-4.5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{isSeller ? '1' : '45'}</div>
            <p className="text-[10px] text-blue-500 font-semibold mt-1">
              Đã xác thực thông tin
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {isSeller ? 'Hồ sơ chờ duyệt' : 'Sản phẩm chờ duyệt'}
            </span>
            <Shield className="h-4.5 w-4.5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">3</div>
            <p className="text-[10px] text-amber-500 font-semibold mt-1">
              Yêu cầu kiểm định sao
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Tin tức đã đăng
            </span>
            <Newspaper className="h-4.5 w-4.5 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">18</div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              Tin tức phổ biến chính sách
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main charts or lists skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="h-4.5 w-4.5 text-slate-400" />
              Biểu đồ số liệu giao thương (Skeleton)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center border border-dashed border-slate-200 rounded-xl bg-slate-50/20 m-6 mt-0">
            <span className="text-xs font-semibold text-slate-400 animate-pulse">
              [Khu vực hiển thị biểu đồ TanStack Chart / Recharts]
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-slate-400" />
              Thông tin liên kết
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 p-3 border border-slate-100 rounded-lg">
              <span className="text-xs font-bold text-slate-700">Tên cơ sở:</span>
              <span className="text-xs text-slate-500">HTX chè hữu cơ Đà Lạt</span>
            </div>
            <div className="flex flex-col gap-2 p-3 border border-slate-100 rounded-lg">
              <span className="text-xs font-bold text-slate-700">Mã số thuế:</span>
              <span className="text-xs text-slate-500">010987654321</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
