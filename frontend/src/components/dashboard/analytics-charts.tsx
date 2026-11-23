'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { useRevenue, useOrdersStatus, useTopProducts } from '../../hooks/use-dashboard';
import { LoadingSpinner } from '../ui/loading-spinner';
import { LineChart, PieChart as PieChartIcon, Trophy, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

const PIE_COLORS = ['#3B82F6', '#F59E0B', '#16A34A', '#EF4444'];
const STATUS_LABELS: Record<string, string> = {
  'PENDING': 'Chờ xử lý',
  'PROCESSING': 'Đang chuẩn bị',
  'SHIPPED': 'Đang giao',
  'DELIVERED': 'Hoàn thành',
  'CANCELLED': 'Đã hủy',
};

const tooltipStyle = {
  background: '#0F172A',
  border: 'none',
  borderRadius: '10px',
  color: '#F8FAFC',
  fontSize: '11px',
  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
};

export function AnalyticsCharts() {
  const [days, setDays] = useState(30);

  const { data: revenueData, isLoading: isLoadingRevenue } = useRevenue(days);
  const { data: ordersStatusData, isLoading: isLoadingStatus } = useOrdersStatus();
  const { data: topProductsData, isLoading: isLoadingTopProducts } = useTopProducts(5);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toString();
  };

  const formattedPieData = ordersStatusData?.map((item: { name: string; value: number }) => ({
    name: STATUS_LABELS[item.name] || item.name,
    value: item.value,
  })) || [];

  return (
    <div className="flex flex-col gap-6 mt-8">
      {/* Revenue Chart */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 md:p-8 md:pb-4 gap-4">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
              <LineChart className="h-5 w-5 text-emerald-500" />
              Doanh thu theo ngày
            </CardTitle>
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <select 
                className="bg-transparent border-none text-slate-600 dark:text-slate-300 text-sm font-semibold focus:ring-0 cursor-pointer outline-none w-28 appearance-none"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={7}>7 ngày qua</option>
                <option value={15}>15 ngày qua</option>
                <option value={30}>30 ngày qua</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="h-[320px] px-2 md:px-8 pb-8">
            {isLoadingRevenue ? (
              <div className="flex h-full items-center justify-center"><LoadingSpinner /></div>
            ) : revenueData && revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickFormatter={formatCurrency} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={tooltipStyle} 
                    formatter={(value) => [`${Number(value).toLocaleString('vi-VN')}đ`, 'Doanh thu']}
                    labelStyle={{ color: '#94A3B8', marginBottom: '4px', fontWeight: 600 }}
                    cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="#10B981" strokeWidth={4} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">Không có dữ liệu doanh thu</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders Status Pie Chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none h-full flex flex-col">
            <CardHeader className="pb-2 md:p-8 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                <PieChartIcon className="h-5 w-5 text-blue-500" />
                Trạng thái đơn hàng
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px] flex flex-col justify-center px-2 md:px-8 pb-8">
              {isLoadingStatus ? (
                <div className="flex h-full items-center justify-center"><LoadingSpinner /></div>
              ) : formattedPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={formattedPieData} 
                      cx="50%" cy="45%" 
                      innerRadius={70} 
                      outerRadius={95} 
                      paddingAngle={6} 
                      dataKey="value"
                      stroke="none"
                    >
                      {formattedPieData.map((_: unknown, index: number) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">Chưa có đơn hàng nào</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Products Bar Chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
          <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none h-full flex flex-col">
            <CardHeader className="pb-2 md:p-8 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                <Trophy className="h-5 w-5 text-amber-500" />
                Top 5 Sản phẩm bán chạy
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px] px-2 md:px-8 pb-8">
              {isLoadingTopProducts ? (
                <div className="flex h-full items-center justify-center"><LoadingSpinner /></div>
              ) : topProductsData && topProductsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsData} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={true} vertical={false} opacity={0.5} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} width={120} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={tooltipStyle} 
                      formatter={(value) => [`${value} sản phẩm`, 'Đã bán']}
                      cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                    />
                    <Bar dataKey="totalSold" name="Đã bán" fill="#F59E0B" radius={[0, 6, 6, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">Chưa có sản phẩm nào được bán</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
