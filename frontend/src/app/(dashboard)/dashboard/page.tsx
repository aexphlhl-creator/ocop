'use client';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useCurrentUser } from '../../../hooks/use-auth';
import {
  useAdminDashboard,
  useMonthlyProducts,
  useProductsByCategory,
  useProductsByOcopLevel,
  useMyProducts,
  useProductsByProvince,
  useSellerViews,
} from '../../../hooks/use-dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { LoadingSpinner } from '../../../components/ui/loading-spinner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  ShoppingBag, Store, Newspaper, Users,
  BarChart3, CheckCircle, XCircle, HelpCircle, ListOrdered, TrendingUp, Map, Eye, EyeOff, QrCode, Download, X, ShieldCheck, Warehouse,
  ArrowRight, Calendar
} from 'lucide-react';
import { AnalyticsCharts } from '../../../components/dashboard/analytics-charts';
import { EventsWidget } from '../../../components/dashboard/events-widget';
import { QRCodeSVG } from 'qrcode.react';

import type { Product, NewsArticle } from '@/types/catalog';
const subscribeClient = () => () => {};
const COLORS = ['#16A34A', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];


const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };


// ─── All hooks calls preserved 100% ─────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const isClient = useSyncExternalStore(subscribeClient, () => true, () => false);
  const [selectedQrProduct, setSelectedQrProduct] = useState<Product | null>(null);
  

  const isAdmin = user?.role === 'ADMIN';
  const isSeller = user?.role === 'SELLER';
  const isWarehouseManager = user?.role === 'WAREHOUSE_MANAGER';

  const { data: adminCounts, isLoading: isCountsLoading } = useAdminDashboard(isAdmin);
  const { data: recentNews = [], isLoading: isNewsLoading } = useQuery({
    queryKey: ['dashboardRecentNews'],
    queryFn: async () => {
      const res = await api.get('/api/v1/news', { params: { page: 1, limit: 4 } });
      const raw = res.data;
      const rawData = raw?.data;
      return Array.isArray(rawData) ? rawData : (rawData?.items || raw?.items || []);
    },
    enabled: isAdmin,
    staleTime: 3 * 60 * 1000,
  });
  const { data: monthlyData, isLoading: isMonthlyLoading } = useMonthlyProducts(isAdmin);
  const { data: myProductsData, isLoading: isMyProductsLoading } = useMyProducts(isSeller);
  const { data: sellerViews, isLoading: isSellerViewsLoading } = useSellerViews(isSeller);
  const { data: categoryData, isLoading: isCategoryLoading } = useProductsByCategory();
  const { data: ocopLevelData, isLoading: isLevelLoading } = useProductsByOcopLevel();
  const { data: provinceData, isLoading: isProvinceLoading } = useProductsByProvince();

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const KpiCard = ({
    title, value, icon: Icon, colorClass, detail, isLoading,
  }: {
    title: string; value: number | string; icon: React.ElementType;
    colorClass: string; detail: string; isLoading?: boolean;
  }) => {
    // Extract base color from colorClass (e.g. 'text-emerald-600') for the gradient glow
    const baseColorClass = colorClass.split(' ').find(c => c.startsWith('text-'))?.replace('text-', '') || 'emerald-600';
    
    return (
      <motion.div variants={fadeUp} className="relative group">
        <div className={`absolute inset-0 bg-${baseColorClass}/10 rounded-[2rem] blur-xl transition-all duration-500 group-hover:bg-${baseColorClass}/30 group-hover:blur-2xl opacity-0 group-hover:opacity-100 pointer-events-none`}></div>
        <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] transition-all duration-500 overflow-hidden relative z-10">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">{title}</span>
                <div className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
                  {isLoading ? <span className="skeleton w-24 h-10 inline-block rounded-xl" /> : value}
                </div>
              </div>
              <div className={`p-4 rounded-[1.25rem] ${colorClass.replace('text-', 'bg-').replace('600', '500')} text-white shadow-lg shadow-${baseColorClass}/30`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-500">{detail}</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // ─── ADMIN VIEW ───────────────────────────────────────────────────────────
  if (user.role === 'QUALITY_ASSURANCE') {
    return <section className="rounded-2xl border bg-white p-8 dark:bg-slate-900">
      <h1 className="text-2xl font-bold">Kiểm định & phát hành lô</h1>
      <p className="my-4">Kiểm tra chứng từ nguồn gốc, ghi kết quả kiểm định độc lập và phát hành lô sau khi kho xác nhận vị trí lưu trữ.</p>
      <Link href="/dashboard/supply-chain" className="font-semibold text-emerald-600 underline">Mở danh sách lô chờ QA</Link>
    </section>;
  }
  if (isAdmin) {
    const newsCount = (adminCounts?.news !== undefined && adminCounts?.news !== null) ? adminCounts.news : recentNews.length;
    const statsCards = [
      { title: 'Tổng sản phẩm', value: adminCounts?.products ?? 0, icon: ShoppingBag, colorClass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30', detail: `Duyệt: ${adminCounts?.approvedProducts ?? 0} | Chờ: ${adminCounts?.pendingProducts ?? 0}` },
      { title: 'Người bán', value: adminCounts?.sellers ?? 0, icon: Store, colorClass: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', detail: 'Tài khoản Seller đang quản lý' },
      { title: 'Tin tức đã đăng', value: newsCount, icon: Newspaper, colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', detail: 'Thông tin chính sách OCOP' },
      { title: 'Người dùng', value: adminCounts?.users ?? 0, icon: Users, colorClass: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30', detail: 'Thành viên hệ thống' },
    ];

    const pieData = ocopLevelData?.map((item: { level: number; count: number }) => ({
      name: `${item.level} Sao`,
      value: item.count,
    })) || [];

    const topProvincesData = (provinceData ? [...provinceData] : [])
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
      .slice(0, 5) || [];

    const tooltipStyle = {
      background: '#0F172A',
      border: 'none',
      borderRadius: '10px',
      color: '#F8FAFC',
      fontSize: '11px',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
    };

    return (
      <div className="flex flex-col gap-10 max-w-[1600px] mx-auto w-full">
        {/* Page title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[2.5rem] border border-white dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold tracking-widest uppercase mb-4 shadow-md shadow-emerald-500/30">
              <ShieldCheck className="w-4 h-4" /> Quản trị tối cao
            </span>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.1]">
              Trung tâm <span className="text-emerald-600 dark:text-emerald-400 italic">điều hành</span>
            </h1>
            <p className="text-sm md:text-base font-medium text-slate-500 dark:text-slate-400 mt-2">
              Giám sát toàn diện hệ sinh thái sản phẩm OCOP quốc gia.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/v1/statistics/export/excel`}
              download="Bao_cao_so_hoa_OCOP_Bo_NNPTNT.xlsx"
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Báo Cáo Excel (Bộ NN&PTNT)</span>
            </a>
          </div>
        </div>

        {/* KPI Cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {statsCards.map((card) => (
            <KpiCard key={card.title} {...card} isLoading={isCountsLoading} />
          ))}
        </motion.div>

        {/* Analytics Dashboard Component */}
        <AnalyticsCharts />

        {/* Charts row */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-5"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {/* Area Chart */}
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none h-full flex flex-col">
              <CardHeader className="pb-2 md:p-8 md:pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                  <BarChart3 className="h-5 w-5 text-emerald-500" />
                  Sản phẩm mới – 12 tháng gần nhất
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px] px-2 md:px-8 pb-8">
                {isClient && monthlyData && monthlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} opacity={0.5} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }} />
                      <Area type="monotone" dataKey="count" name="Sản phẩm" stroke="#10B981" strokeWidth={4} fill="url(#colorCount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    {isMonthlyLoading ? <LoadingSpinner size="md" /> : 'Chưa có dữ liệu tháng'}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Pie Chart */}
          <motion.div variants={fadeUp}>
            <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none h-full flex flex-col">
              <CardHeader className="pb-2 md:p-8 md:pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                  <ListOrdered className="h-5 w-5 text-amber-500" />
                  Phân hạng sao OCOP
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px] flex flex-col justify-center px-2 md:px-8 pb-8">
                {isClient && pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="45%" innerRadius={70} outerRadius={95} paddingAngle={6} dataKey="value" stroke="none">
                        {pieData.map((_: unknown, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-sm text-slate-400">
                    {isLevelLoading ? <LoadingSpinner size="md" /> : 'Không có dữ liệu'}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Bar Chart */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none">
            <CardHeader className="md:p-8 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Sản phẩm theo ngành nông sản chủ lực
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 px-2 md:px-8 pb-8">
              {isClient && categoryData && categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} opacity={0.5} />
                    <XAxis dataKey="categoryName" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
                    <Bar dataKey="count" name="Số lượng" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  {isCategoryLoading ? <LoadingSpinner size="md" /> : 'Chưa có phân chia ngành hàng'}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Provinces Bar Chart */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none">
            <CardHeader className="md:p-8 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                <Map className="h-5 w-5 text-orange-500" />
                Top 5 Tỉnh/Thành phố nhiều sản phẩm nhất
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 px-2 md:px-8 pb-8">
              {isClient && topProvincesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProvincesData} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={true} vertical={false} opacity={0.5} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="provinceName" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} width={120} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }} />
                    <Bar dataKey="count" name="Sản phẩm" fill="#F59E0B" radius={[0, 6, 6, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  {isProvinceLoading ? <LoadingSpinner size="md" /> : 'Chưa có dữ liệu tỉnh thành'}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Events & Fairs Widget */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <EventsWidget />
        </motion.div>

        {/* Recent News Widget */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none overflow-hidden">
            <CardHeader className="p-6 md:p-8 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600">
                  <Newspaper className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Tin tức &amp; Bản tin OCOP mới nhất
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Đồng bộ trực tiếp giữa trang chủ công cộng và trung tâm điều hành
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/news"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                Quản lý tất cả tin tức <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              {isNewsLoading ? (
                <div className="py-12 flex justify-center"><LoadingSpinner size="md" /></div>
              ) : recentNews.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentNews.map((article: NewsArticle) => (
                    <div
                      key={article.id}
                      className="flex items-start gap-3.5 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all duration-200"
                    >
                      {article.thumbnail ? (
                        <AssetImage
                          src={article.thumbnail}
                          alt=""
                          className="h-16 w-24 rounded-xl object-cover shrink-0 bg-slate-100"
                        />
                      ) : (
                        <div className="flex h-16 w-24 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-300 shrink-0">
                          <Newspaper className="h-6 w-6" />
                        </div>
                      )}
                      <div className="flex flex-col flex-1 min-w-0 justify-between h-full">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {article.status === 'PUBLISHED' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                <Eye className="h-2.5 w-2.5" /> Đã đăng
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                <EyeOff className="h-2.5 w-2.5" /> Nháp
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(article.createdAt).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                          <Link
                            href={`/news/${article.slug}`}
                            target="_blank"
                            className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 line-clamp-2 leading-snug transition-colors"
                          >
                            {article.title}
                          </Link>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Tác giả: <span className="font-medium text-slate-600 dark:text-slate-300">{article.author?.fullName || 'Quản trị viên'}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-slate-400">
                  Chưa có bài viết nào được đăng trên hệ thống.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ─── SELLER VIEW ─────────────────────────────────────────────────────────
  if (isSeller) {
    const productsList = myProductsData || [];
    const approvedCount = productsList.filter((p) => p.status === 'APPROVED').length;
    const pendingCount  = productsList.filter((p) => p.status === 'PENDING').length;
    const rejectedCount = productsList.filter((p) => p.status === 'REJECTED').length;

    const statsCards = [
      { title: 'Lượt xem tháng này', value: sellerViews ?? 0, icon: Eye, colorClass: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30', detail: 'Tổng lượt xem các sản phẩm' },
      { title: 'Sản phẩm đã tạo',    value: productsList.length, icon: ShoppingBag, colorClass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30', detail: 'Đặc sản OCOP của tôi' },
      { title: 'Sản phẩm đang bán',   value: approvedCount,       icon: CheckCircle, colorClass: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',           detail: 'Đã duyệt đạt chuẩn sao' },
      { title: 'Hồ sơ chờ duyệt',     value: pendingCount,        icon: HelpCircle,  colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',         detail: 'Đang kiểm định chất lượng' },
    ];

    const getStatusBadge = (status: string) => {
      if (status === 'APPROVED') return <Badge variant="success">Đã duyệt</Badge>;
      if (status === 'PENDING')  return <Badge variant="warning">Chờ duyệt</Badge>;
      return <Badge variant="error">Từ chối</Badge>;
    };

    return (
      <div className="flex flex-col gap-10 max-w-[1600px] mx-auto w-full">
        {/* Page title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[2.5rem] border border-white dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold tracking-widest uppercase mb-4 shadow-md shadow-emerald-500/30">
              <Store className="w-4 h-4" /> Dành cho chủ thể
            </span>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.1]">
              Quản trị <span className="text-emerald-600 dark:text-emerald-400 italic">gian hàng</span>
            </h1>
            <p className="text-sm md:text-base font-medium text-slate-500 dark:text-slate-400 mt-2">
              Xem trạng thái kiểm tra hồ sơ nông nghiệp OCOP
            </p>
          </div>
        </div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {statsCards.map((card) => (
            <KpiCard key={card.title} {...card} isLoading={isMyProductsLoading} />
          ))}
        </motion.div>

        {/* Analytics Dashboard Component */}
        <AnalyticsCharts />

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
          <Card className="rounded-[2.5rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none overflow-hidden">
            <CardHeader className="p-8">
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <ShoppingBag className="h-5 w-5 text-emerald-500" />
                Danh sách sản phẩm đăng ký
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isMyProductsLoading ? (
                <div className="py-12 flex justify-center"><LoadingSpinner /></div>
              ) : productsList.length > 0 ? (
                <Table>
                  <TableHeader className="bg-slate-50/50 dark:bg-slate-800/50">
                    <TableRow className="border-b border-slate-200/50 dark:border-slate-800/50">
                      <TableHead className="font-bold py-4">Tên sản phẩm</TableHead>
                      <TableHead className="font-bold">Giá bán</TableHead>
                      <TableHead className="font-bold">Đơn vị</TableHead>
                      <TableHead className="font-bold">Hạng OCOP</TableHead>
                      <TableHead className="font-bold">Trạng thái</TableHead>
                      <TableHead className="font-bold">Ngày đăng ký</TableHead>
                      <TableHead className="text-right font-bold">Hành động</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsList.map((product) => (
                      <TableRow key={product.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-white/50 dark:hover:bg-slate-800/20 transition-colors">
                        <TableCell className="font-bold text-slate-900 dark:text-slate-100 py-4">{product.name}</TableCell>
                        <TableCell className="text-[#16A34A] dark:text-emerald-400 font-bold">
                          {product.price.toLocaleString('vi-VN')}đ
                        </TableCell>
                        <TableCell className="font-medium text-slate-600">{product.unit}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 font-bold rounded-full text-xs shadow-sm">
                            {product.ocopLevel?.level} ★
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(product.status)}</TableCell>
                        <TableCell className="text-slate-500 font-medium text-sm">
                          {new Date(product.createdAt).toLocaleDateString('vi-VN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => setSelectedQrProduct(product)}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                            title="Lấy mã QR Truy xuất nguồn gốc"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-16 text-sm font-medium text-slate-500">
                  Chủ thể chưa đăng ký sản phẩm OCOP nào.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* QR Code Modal */}
        {selectedQrProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative flex flex-col items-center"
            >
              <button 
                onClick={() => setSelectedQrProduct(null)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">Tem Truy Xuất Nguồn Gốc</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center line-clamp-1">{selectedQrProduct.name}</p>
              
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6" id="qr-code-wrapper">
                <QRCodeSVG 
                  value={typeof window !== 'undefined' ? `${window.location.origin}/traceability/${selectedQrProduct.id}` : ''}
                  size={200}
                  level="H"
                  includeMargin={false}
                />
              </div>

              <div className="flex w-full gap-3">
                <button
                  onClick={() => {
                    const svg = document.querySelector('#qr-code-wrapper svg') as SVGElement;
                    if (svg) {
                      const svgData = new XMLSerializer().serializeToString(svg);
                      const canvas = document.createElement("canvas");
                      const ctx = canvas.getContext("2d");
                      const img = new Image();
                      img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx?.drawImage(img, 0, 0);
                        const pngFile = canvas.toDataURL("image/png");
                        const downloadLink = document.createElement("a");
                        downloadLink.download = `QR_${selectedQrProduct.name.replace(/\s+/g, '_')}.png`;
                        downloadLink.href = pngFile;
                        downloadLink.click();
                      };
                      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                    }
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Tải xuống
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  if (isWarehouseManager) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Không gian quản lý kho
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi và vận hành các kho đã được phân công cho bạn.
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center flex flex-col items-center gap-5">
            <div className="p-5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-2xl">
              <Warehouse className="h-10 w-10" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                Kho hàng được phân công
              </h2>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md leading-relaxed mt-2">
                Bạn chỉ có thể xem và thao tác trên các kho mà quản trị viên đã gán.
              </p>
            </div>
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-colors"
            >
              <Warehouse className="h-4 w-4" /> Đi tới quản lý kho
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── VISITOR VIEW ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Hồ sơ người tiêu dùng</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Xem và lưu trữ lịch sử tương tác đặc sản OCOP</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card>
          <CardContent className="py-16 text-center flex flex-col items-center gap-5">
            <div className="p-5 bg-emerald-50 dark:bg-emerald-950/20 text-[#16A34A] rounded-2xl">
              <CheckCircle className="h-10 w-10" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                Chào mừng bạn ghé thăm cổng thông tin
              </h2>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm leading-relaxed mt-2">
                Với tài khoản khách hàng, bạn có thể tự do lưu lại các đặc sản ưa thích và theo dõi sự kiện xúc tiến thương mại nông sản.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
