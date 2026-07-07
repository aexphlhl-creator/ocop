'use client';

import React, { useEffect, useState } from 'react';
import { useCurrentUser } from '../../../hooks/use-auth';
import {
  useAdminDashboard,
  useMonthlyProducts,
  useProductsByCategory,
  useProductsByOcopLevel,
  useMyProducts,
} from '../../../hooks/use-dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  ShieldAlert,
  ShoppingBag,
  Store,
  Newspaper,
  Users,
  BarChart3,
  CheckCircle,
  XCircle,
  HelpCircle,
  ListOrdered,
} from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isSeller = user?.role === 'SELLER';

  // API Admin Queries
  const { data: adminCounts, isLoading: isCountsLoading } = useAdminDashboard(isAdmin);
  const { data: monthlyData, isLoading: isMonthlyLoading } = useMonthlyProducts(isAdmin);

  // API Seller Queries
  const { data: myProductsData, isLoading: isMyProductsLoading } = useMyProducts(isSeller);

  // Common Queries
  const { data: categoryData, isLoading: isCategoryLoading } = useProductsByCategory();
  const { data: ocopLevelData, isLoading: isLevelLoading } = useProductsByOcopLevel();

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      </div>
    );
  }

  // ----------------------------------------------------
  // ADMIN DASHBOARD VIEW
  // ----------------------------------------------------
  if (isAdmin) {
    const statsCards = [
      {
        title: 'Tổng sản phẩm',
        value: adminCounts?.products ?? 0,
        icon: ShoppingBag,
        color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
        detail: `Duyệt: ${adminCounts?.approvedProducts ?? 0} | Chờ: ${adminCounts?.pendingProducts ?? 0}`,
      },
      {
        title: 'Chủ thể kinh tế',
        value: adminCounts?.businesses ?? 0,
        icon: Store,
        color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
        detail: 'Hợp tác xã & Doanh nghiệp',
      },
      {
        title: 'Tin tức đã đăng',
        value: adminCounts?.news ?? 0,
        icon: Newspaper,
        color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
        detail: 'Thông tin chính sách OCOP',
      },
      {
        title: 'Người dùng',
        value: adminCounts?.users ?? 0,
        icon: Users,
        color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30',
        detail: 'Thành viên hệ thống',
      },
    ];

    // Tạo biểu đồ cấp sao
    const pieData = ocopLevelData?.map((item: any) => ({
      name: `${item.level} Sao`,
      value: item.count,
    })) || [];

    return (
      <div className="flex flex-col gap-8 dark:text-slate-100">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
            Bảng trị sự quản trị hệ thống
          </h1>
          <p className="text-xs text-slate-400">Xem báo cáo tổng hợp ranh giới và phân bổ OCOP toàn quốc</p>
        </div>

        {/* Indicator Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <Card key={i} className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.title}</span>
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-800 dark:text-white">
                    {isCountsLoading ? '...' : card.value}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{card.detail}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Line/Area Chart: Rolling Monthly Creation */}
          <Card className="lg:col-span-2 dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="h-4.5 w-4.5 text-slate-400" />
                Sản phẩm mới phát triển 12 tháng gần nhất
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {isClient && monthlyData && monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                    <XAxis dataKey="month" className="text-[10px] fill-slate-400 font-medium" />
                    <YAxis className="text-[10px] fill-slate-400 font-medium" />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '11px',
                      }}
                    />
                    <Area type="monotone" dataKey="count" name="Sản phẩm" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  {isMonthlyLoading ? 'Đang tải dữ liệu biểu đồ...' : 'Chưa có sản phẩm nào phát triển'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pie Chart: Ocop Level Distribution */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ListOrdered className="h-4.5 w-4.5 text-slate-400" />
                Tỉ lệ phân hạng sao OCOP
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 flex flex-col justify-center">
              {isClient && pieData.length > 0 ? (
                <div className="h-full w-full relative">
                  <ResponsiveContainer width="100%" height="90%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {pieData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center text-xs text-slate-400">
                  {isLevelLoading ? 'Đang tải tỉ lệ...' : 'Không tìm thấy dữ liệu sao'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Category statistics */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Store className="h-4.5 w-4.5 text-slate-400" />
              Số lượng sản phẩm theo ngành nông sản chủ lực
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isClient && categoryData && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                  <XAxis dataKey="categoryName" className="text-[10px] fill-slate-400 font-semibold" />
                  <YAxis className="text-[10px] fill-slate-400 font-semibold" />
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="count" name="Số lượng" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                {isCategoryLoading ? 'Đang phân tích dữ liệu ngành hàng...' : 'Chưa có phân chia ngành hàng'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------------------------------
  // SELLER DASHBOARD VIEW
  // ----------------------------------------------------
  if (isSeller) {
    const productsList = myProductsData?.items || [];

    // Tính trạng thái phê duyệt sản phẩm của Seller
    const approvedCount = productsList.filter((p: any) => p.status === 'APPROVED').length;
    const pendingCount = productsList.filter((p: any) => p.status === 'PENDING').length;
    const rejectedCount = productsList.filter((p: any) => p.status === 'REJECTED').length;

    const statsCards = [
      {
        title: 'Sản phẩm đã tạo',
        value: productsList.length,
        icon: ShoppingBag,
        color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
        detail: 'Đặc sản OCOP của tôi',
      },
      {
        title: 'Sản phẩm Đang bán',
        value: approvedCount,
        icon: CheckCircle,
        color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
        detail: 'Đã duyệt đạt chuẩn sao',
      },
      {
        title: 'Hồ sơ Chờ duyệt',
        value: pendingCount,
        icon: HelpCircle,
        color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
        detail: 'Đang kiểm định chất lượng',
      },
      {
        title: 'Hồ sơ Từ chối',
        value: rejectedCount,
        icon: XCircle,
        color: 'text-red-500 bg-red-50 dark:bg-red-950/30',
        detail: 'Yêu cầu sửa đổi hồ sơ',
      },
    ];

    const getStatusBadge = (status: string) => {
      if (status === 'APPROVED') return <Badge variant="success">Đã duyệt</Badge>;
      if (status === 'PENDING') return <Badge variant="warning">Chờ duyệt</Badge>;
      return <Badge variant="error">Từ chối</Badge>;
    };

    return (
      <div className="flex flex-col gap-8 dark:text-slate-100">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
            Quản trị gian hàng
          </h1>
          <p className="text-xs text-slate-400">Xem trạng thái kiểm tra hồ sơ nông nghiệp OCOP của chủ thể</p>
        </div>

        {/* Indicator Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <Card key={i} className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.title}</span>
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-800 dark:text-white">
                    {isMyProductsLoading ? '...' : card.value}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{card.detail}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Dashboard Table of Seller's Products */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShoppingBag className="h-4.5 w-4.5 text-slate-400" />
              Danh sách sản phẩm do chủ thể đăng ký
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isMyProductsLoading ? (
              <div className="text-center py-6 text-xs text-slate-400">Đang đồng bộ danh sách sản phẩm...</div>
            ) : productsList.length > 0 ? (
              <Table className="dark:border-slate-800">
                <TableHeader className="dark:bg-slate-950/50 dark:border-slate-800">
                  <TableRow className="dark:border-slate-800">
                    <TableHead className="dark:text-slate-400">Tên sản phẩm</TableHead>
                    <TableHead className="dark:text-slate-400">Giá bán</TableHead>
                    <TableHead className="dark:text-slate-400">Đơn vị</TableHead>
                    <TableHead className="dark:text-slate-400">Hạng OCOP</TableHead>
                    <TableHead className="dark:text-slate-400">Trạng thái</TableHead>
                    <TableHead className="dark:text-slate-400">Ngày đăng ký</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsList.map((product: any) => (
                    <TableRow key={product.id} className="dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <TableCell className="font-bold text-slate-800 dark:text-slate-200">{product.name}</TableCell>
                      <TableCell className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {product.price.toLocaleString('vi-VN')} đ
                      </TableCell>
                      <TableCell className="dark:text-slate-300">{product.unit}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-50 border border-amber-200/50 text-amber-600 font-bold rounded-full text-[10px]">
                          {product.ocopLevel?.level ?? 3} ★
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {new Date(product.createdAt).toLocaleDateString('vi-VN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                Chủ thể chưa đăng ký sản phẩm OCOP nào.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------------------------------
  // VISITOR DASHBOARD VIEW
  // ----------------------------------------------------
  return (
    <div className="flex flex-col gap-6 dark:text-slate-100">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Hồ sơ người tiêu dùng</h1>
        <p className="text-xs text-slate-400">Xem và lưu trữ lịch sử tương tác đặc sản OCOP</p>
      </div>

      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardContent className="py-12 text-center flex flex-col items-center gap-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 rounded-full">
            <CheckCircle className="h-10 w-10" />
          </div>
          <h2 className="font-extrabold text-slate-700 dark:text-slate-200 text-sm">Chào mừng bạn ghé thăm cổng thông tin</h2>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
            Với tài khoản khách hàng, bạn có thể tự do lưu lại các đặc sản ưa thích và theo dõi sự kiện xúc tiến thương mại nông sản.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
