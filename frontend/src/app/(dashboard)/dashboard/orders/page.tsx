'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../../../services/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { Badge } from '../../../../components/ui/badge';
import { Modal } from '../../../../components/ui/modal';
import { Input } from '../../../../components/ui/input';
import { Button } from '../../../../components/ui/button';
import { toast } from 'sonner';
import {
  Package, ShoppingCart, Truck, CheckCircle2, XCircle,
  RotateCcw, Clock, DollarSign, Filter, X, ChevronLeft,
  ChevronRight, Eye, RefreshCw, AlertCircle, User,
  MapPin, CalendarDays, CreditCard, Boxes, ArrowRight,
  TrendingUp, PackageOpen,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PACKING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:    { label: 'Chờ xác nhận', color: 'text-amber-700 bg-amber-50 border-amber-200',    icon: <Clock className="w-3 h-3" /> },
  CONFIRMED:  { label: 'Đã xác nhận',  color: 'text-blue-700 bg-blue-50 border-blue-200',       icon: <CheckCircle2 className="w-3 h-3" /> },
  PACKING:    { label: 'Đang đóng gói',color: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: <PackageOpen className="w-3 h-3" /> },
  PROCESSING: { label: 'Đang xử lý',   color: 'text-violet-700 bg-violet-50 border-violet-200', icon: <RefreshCw className="w-3 h-3" /> },
  SHIPPED:    { label: 'Đang giao',    color: 'text-cyan-700 bg-cyan-50 border-cyan-200',       icon: <Truck className="w-3 h-3" /> },
  DELIVERED:  { label: 'Đã giao',      color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  CANCELLED:  { label: 'Đã hủy',       color: 'text-red-700 bg-red-50 border-red-200',          icon: <XCircle className="w-3 h-3" /> },
  RETURNED:   { label: 'Hoàn trả',     color: 'text-slate-700 bg-slate-100 border-slate-300',   icon: <RotateCcw className="w-3 h-3" /> },
};

const PAYMENT_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  PENDING:   { label: 'Chưa thanh toán', color: 'text-amber-700 bg-amber-50' },
  COMPLETED: { label: 'Đã thanh toán',   color: 'text-emerald-700 bg-emerald-50' },
  FAILED:    { label: 'Thất bại',        color: 'text-red-700 bg-red-50' },
  REFUNDED:  { label: 'Đã hoàn tiền',    color: 'text-slate-700 bg-slate-100' },
};

// Status transition map for sellers
const SELLER_TRANSITIONS: Partial<Record<OrderStatus, { value: OrderStatus; label: string }[]>> = {
  PENDING:   [{ value: 'CONFIRMED', label: '✅ Xác nhận đơn' }, { value: 'CANCELLED', label: '❌ Hủy đơn' }],
  CONFIRMED: [{ value: 'PACKING', label: '📦 Bắt đầu đóng gói' }, { value: 'CANCELLED', label: '❌ Hủy đơn' }],
  PACKING:   [{ value: 'SHIPPED', label: '🚚 Giao cho vận chuyển' }, { value: 'CANCELLED', label: '❌ Hủy đơn' }],
  PROCESSING:[{ value: 'SHIPPED', label: '🚚 Giao cho vận chuyển' }, { value: 'CANCELLED', label: '❌ Hủy đơn' }],
  SHIPPED:   [{ value: 'DELIVERED', label: '✅ Xác nhận đã giao' }, { value: 'RETURNED', label: '↩️ Hoàn trả' }],
};

function formatMoney(amount: number) {
  return amount.toLocaleString('vi-VN') + 'đ';
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4"
    >
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest truncate">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-0.5">{value ?? '–'}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as OrderStatus] ?? { label: status, color: 'text-slate-700 bg-slate-100 border-slate-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Order Detail Modal ────────────────────────────────────────────────────────
function OrderDetailModal({
  order,
  onClose,
  user,
  onStatusUpdated,
}: {
  order: any;
  onClose: () => void;
  user: any;
  onStatusUpdated: () => void;
}) {
  const [newStatus, setNewStatus] = useState('');
  const [description, setDescription] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [shippingPartner, setShippingPartner] = useState('GHTK');

  const transitions = SELLER_TRANSITIONS[order.status as OrderStatus] ?? [];
  const canUpdate = ['ADMIN', 'SELLER'].includes(user?.role) && transitions.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: any = { status: newStatus, description };
      if (newStatus === 'SHIPPED' && trackingCode) {
        payload.trackingCode = trackingCode;
        payload.shippingPartner = shippingPartner;
      }
      const res = await api.patch(`/api/v1/orders/${order.id}/status`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Cập nhật trạng thái thành công!');
      onStatusUpdated();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  return (
    <Modal isOpen onClose={onClose} title={`Chi tiết đơn hàng`}>
      <div className="space-y-5 mt-2">
        {/* Order ID + status */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono text-sm text-slate-500">#{order.id?.slice(0, 8).toUpperCase()}</span>
          <StatusBadge status={order.status} />
        </div>

        {/* Customer info */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" /> Thông tin khách hàng
          </p>
          <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
            <div><span className="text-slate-400">Họ tên:</span> {order.user?.fullName}</div>
            <div><span className="text-slate-400">Email:</span> {order.user?.email}</div>
            <div><span className="text-slate-400">SĐT:</span> {order.phone}</div>
            <div><span className="text-slate-400">Thanh toán:</span>{' '}
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${PAYMENT_CONFIG[order.paymentStatus as PaymentStatus]?.color}`}>
                {PAYMENT_CONFIG[order.paymentStatus as PaymentStatus]?.label}
              </span>
            </div>
          </div>
          <div className="flex items-start gap-1 text-slate-600 dark:text-slate-300 pt-1">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>{order.shippingAddress}</span>
          </div>
          {order.note && (
            <p className="text-slate-500 italic text-xs">"Ghi chú: {order.note}"</p>
          )}
        </div>

        {/* Products */}
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-2 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-slate-400" /> Sản phẩm
          </p>
          <div className="space-y-2">
            {order.items?.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
                  {item.product?.images?.[0]?.imageUrl
                    ? <img src={item.product.images[0].imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    : <Package className="w-5 h-5 text-slate-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{item.product?.name}</p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × {formatMoney(Number(item.price))}
                    {item.reservedBatch && (
                      <span className="ml-2 font-mono text-emerald-600">
                        Lô: {item.reservedBatch.batchNumber}
                      </span>
                    )}
                  </p>
                </div>
                <p className="font-bold text-emerald-600 shrink-0">
                  {formatMoney(Number(item.price) * item.quantity)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-sm font-bold">
            <span>Tổng cộng</span>
            <span className="text-emerald-600 text-base">{formatMoney(Number(order.totalAmount))}</span>
          </div>
        </div>

        {/* Tracking history */}
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" /> Lịch sử trạng thái
          </p>
          <div className="space-y-2">
            {order.tracking?.map((t: any, i: number) => (
              <div key={t.id} className="flex gap-3 items-start">
                <div className="flex flex-col items-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  {i < (order.tracking?.length ?? 0) - 1 && (
                    <div className="w-0.5 h-full bg-slate-200 dark:bg-slate-700 my-1" style={{ minHeight: 12 }} />
                  )}
                </div>
                <div className="pb-2">
                  <StatusBadge status={t.status} />
                  {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(t.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status update (Seller/Admin) */}
        {canUpdate && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <p className="font-semibold text-sm text-slate-700 dark:text-slate-200">Cập nhật trạng thái</p>

            <div className="grid grid-cols-2 gap-2">
              {transitions.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setNewStatus(t.value)}
                  className={`py-2 px-3 rounded-xl border text-sm font-medium transition-all ${
                    newStatus === t.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {newStatus === 'SHIPPED' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/40 space-y-2">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Thông tin vận chuyển</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-blue-600 dark:text-blue-400 mb-1 block">Đơn vị</label>
                    <select
                      value={shippingPartner}
                      onChange={(e) => setShippingPartner(e.target.value)}
                      className="w-full text-sm rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 px-2 py-1.5"
                    >
                      <option value="GHTK">GHTK</option>
                      <option value="GHN">Giao Hàng Nhanh</option>
                      <option value="VTP">Viettel Post</option>
                      <option value="VNPOST">VNPost</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-blue-600 dark:text-blue-400 mb-1 block">Mã vận đơn</label>
                    <input
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      placeholder="Nhập mã..."
                      className="w-full text-sm rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 px-2 py-1.5"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ghi chú (tùy chọn)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Mô tả thêm..."
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Đóng</Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={!newStatus || mutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {mutation.isPending ? <LoadingSpinner size="sm" /> : 'Lưu thay đổi'}
              </Button>
            </div>
          </div>
        )}

        {!canUpdate && (
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Đóng</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OrdersManagementPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [filter, setFilter] = useState({
    status: '',
    search: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
  });

  const isAdminOrSeller = user?.role === 'ADMIN' || user?.role === 'SELLER';

  // ── Dashboard Stats ──────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['orders-stats'],
    queryFn: async () => {
      const res = await api.get('/api/v1/orders/dashboard');
      return res.data.data;
    },
    enabled: isAdminOrSeller,
  });

  // ── Orders List ──────────────────────────────────────────────────────────
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders-list', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.search) params.append('search', filter.search);
      if (filter.dateFrom) params.append('dateFrom', filter.dateFrom);
      if (filter.dateTo) params.append('dateTo', filter.dateTo);
      params.append('page', String(filter.page));
      params.append('limit', '15');

      // Admin/Seller uses paginated list
      const endpoint = isAdminOrSeller
        ? `/api/v1/orders?${params}`
        : '/api/v1/orders/my';

      const res = await api.get(endpoint);
      return res.data;
    },
    enabled: !!user,
  });

  // Handle both paginated (admin/seller) and flat array (customer)
  const orders = ordersData?.data ?? [];
  const meta = ordersData?.meta ?? null;

  const statuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-emerald-600" /> Quản lý đơn hàng
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Theo dõi, xử lý và cập nhật trạng thái đơn hàng
        </p>
      </div>

      {/* Stats */}
      {isAdminOrSeller && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={<Package className="w-4 h-4 text-slate-600" />} label="Tổng đơn" value={stats.total} color="bg-slate-100" />
          <StatCard icon={<Clock className="w-4 h-4 text-amber-600" />} label="Chờ xác nhận" value={stats.pending} color="bg-amber-50" />
          <StatCard icon={<Truck className="w-4 h-4 text-cyan-600" />} label="Đang giao" value={stats.shipped} color="bg-cyan-50" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Hoàn thành" value={stats.delivered} color="bg-emerald-50" />
          <StatCard icon={<XCircle className="w-4 h-4 text-red-500" />} label="Đã hủy" value={stats.cancelled} color="bg-red-50" />
          <StatCard
            icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
            label="Doanh thu tháng"
            value={stats.monthRevenue ? formatMoney(stats.monthRevenue) : '0đ'}
            color="bg-violet-50"
            sub={`${stats.monthOrders} đơn`}
          />
        </div>
      )}

      {/* Filter Bar (Admin/Seller only) */}
      {isAdminOrSeller && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <Filter className="w-4 h-4" /> Bộ lọc
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Trạng thái</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value, page: 1 }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tất cả trạng thái</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Tìm kiếm</label>
              <div className="relative">
                <Input
                  placeholder="Tên KH, SĐT..."
                  value={filter.search}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value, page: 1 }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Từ ngày</label>
              <Input type="date" value={filter.dateFrom} onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value, page: 1 }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Đến ngày</label>
              <Input type="date" value={filter.dateTo} onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value, page: 1 }))} />
            </div>
          </div>
          {(filter.status || filter.search || filter.dateFrom || filter.dateTo) && (
            <button
              onClick={() => setFilter({ status: '', search: '', dateFrom: '', dateTo: '', page: 1 })}
              className="mt-3 text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Chưa có đơn hàng nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Mã đơn</th>
                  {isAdminOrSeller && (
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Khách hàng</th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Sản phẩm</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Tổng tiền</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Thanh toán</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Ngày tạo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                        #{order.id?.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    {isAdminOrSeller && (
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{order.user?.fullName}</p>
                        <p className="text-xs text-slate-400">{order.phone}</p>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[180px]">
                      <p className="truncate">{order.items?.map((i: any) => `${i.quantity}× ${i.product?.name}`).join(', ')}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-600">
                      {formatMoney(Number(order.totalAmount))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_CONFIG[order.paymentStatus as PaymentStatus]?.color}`}>
                        {PAYMENT_CONFIG[order.paymentStatus as PaymentStatus]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-2 py-1.5 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              Trang {meta.currentPage}/{meta.totalPages} ({meta.totalItems} đơn)
            </p>
            <div className="flex gap-2">
              <button
                disabled={filter.page <= 1}
                onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40 hover:text-emerald-600 hover:border-emerald-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={filter.page >= meta.totalPages}
                onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40 hover:text-emerald-600 hover:border-emerald-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          user={user}
          onStatusUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['orders-list'] });
            queryClient.invalidateQueries({ queryKey: ['orders-stats'] });
          }}
        />
      )}
    </div>
  );
}
