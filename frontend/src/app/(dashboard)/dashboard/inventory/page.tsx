'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../../../services/api';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Card, CardContent } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Modal } from '../../../../components/ui/modal';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { toast } from 'sonner';
import { CreateWarehouseModal } from '../../../../components/inventory/CreateWarehouseModal';
import {
  Warehouse, Package, ArrowDown, ArrowUp, RotateCcw, AlertTriangle,
  Clock, BarChart3, TrendingDown, CalendarX, Plus, ChevronRight,
  Boxes, ArrowLeftRight, Activity, RefreshCw, Eye, Filter, MapPin
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'batches' | 'history' | 'alerts';

const MOVEMENT_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; sign: string }> = {
  IN:         { label: 'Nhập kho',    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',   icon: <ArrowDown className="w-3.5 h-3.5" />, sign: '+' },
  OUT:        { label: 'Xuất kho',    color: 'text-red-600 bg-red-50 border-red-200',               icon: <ArrowUp className="w-3.5 h-3.5" />,   sign: '-' },
  ADJUSTMENT: { label: 'Điều chỉnh', color: 'text-violet-600 bg-violet-50 border-violet-200',      icon: <RefreshCw className="w-3.5 h-3.5" />, sign: '±' },
  RETURN:     { label: 'Trả hàng',   color: 'text-amber-600 bg-amber-50 border-amber-200',         icon: <RotateCcw className="w-3.5 h-3.5" />, sign: '+' },
  TRANSFER:   { label: 'Chuyển kho', color: 'text-blue-600 bg-blue-50 border-blue-200',            icon: <ArrowLeftRight className="w-3.5 h-3.5" />, sign: '~' },
};

const BATCH_STATUS_CONFIG: Record<string, { label: string; variant: any }> = {
  ACTIVE:   { label: 'Còn hàng',   variant: 'success' },
  DEPLETED: { label: 'Hết hàng',   variant: 'default' },
  EXPIRED:  { label: 'Hết hạn',    variant: 'error' },
  RECALLED: { label: 'Thu hồi',    variant: 'warning' },
};

const QUALITY_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING_CHECK: { label: 'Chờ KT',  color: 'text-slate-500 bg-slate-100' },
  PASSED:        { label: 'Đạt',     color: 'text-emerald-700 bg-emerald-100' },
  FAILED:        { label: 'Không đạt', color: 'text-red-700 bg-red-100' },
  QUARANTINE:    { label: 'Cách ly', color: 'text-amber-700 bg-amber-100' },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4"
    >
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{value ?? '–'}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Modal states
  const [isWarehouseOpen, setIsWarehouseOpen] = useState(false);
  const [isCreateInventoryOpen, setIsCreateInventoryOpen] = useState(false);
  const [isStockInOpen, setIsStockInOpen] = useState<any>(null);  // holds inventory object
  const [isStockOutOpen, setIsStockOutOpen] = useState<any>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedInventoryDetail, setSelectedInventoryDetail] = useState<any>(null);
  const [movementFilter, setMovementFilter] = useState('');

  // Form states
  const [warehouseForm, setWarehouseForm] = useState({ name: '', address: '', description: '' });
  const [inventoryForm, setInventoryForm] = useState({ warehouseId: '', productId: '', minimumQuantity: 0 });
  const [stockInForm, setStockInForm] = useState({
    quantity: 1, supplier: '', harvestDate: '', expiryDate: '', warehouseLocation: '', note: '', referenceId: '',
  });
  const [stockOutForm, setStockOutForm] = useState({ quantity: 1, referenceId: '', note: '' });
  const [transferForm, setTransferForm] = useState({ fromInventoryId: '', toInventoryId: '', quantity: 1, reason: '' });

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['inv-stats'],
    queryFn: () => api.get('/api/v1/inventory/stats').then(r => r.data.data),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/api/v1/inventory/warehouses').then(r => r.data.data || []),
  });

  const { data: inventories = [], isLoading: invLoading } = useQuery({
    queryKey: ['inventories'],
    queryFn: () => api.get('/api/v1/inventory?limit=50').then(r => r.data.data || []),
  });

  const { data: batches = [], isLoading: batchLoading } = useQuery({
    queryKey: ['all-batches', selectedInventoryDetail?.id],
    queryFn: async () => {
      if (!selectedInventoryDetail) {
        // Fetch all batches via inventories
        const allBatches: any[] = [];
        for (const inv of inventories.slice(0, 20)) {
          const r = await api.get(`/api/v1/inventory/${inv.id}/batches`);
          allBatches.push(...(r.data.data || []));
        }
        return allBatches;
      }
      return api.get(`/api/v1/inventory/${selectedInventoryDetail.id}/batches`).then(r => r.data.data || []);
    },
    enabled: activeTab === 'batches',
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['stock-history', movementFilter],
    queryFn: () => api.get(`/api/v1/inventory/history?limit=50${movementFilter ? `&movementType=${movementFilter}` : ''}`).then(r => r.data.data || []),
    enabled: activeTab === 'history',
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.get('/api/v1/inventory/low-stock').then(r => r.data.data || []),
    enabled: activeTab === 'alerts',
  });

  const { data: expiring = [] } = useQuery({
    queryKey: ['expiring'],
    queryFn: () => api.get('/api/v1/inventory/expiring?days=30').then(r => r.data.data || []),
    enabled: activeTab === 'alerts',
  });

  const { data: products = [] } = useQuery({
    queryKey: ['all-products-for-inv'],
    queryFn: () => api.get('/api/v1/products?limit=100').then(r => r.data.data || []),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createWarehouseMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/v1/inventory/warehouses', data),
    onSuccess: () => {
      toast.success('Tạo kho thành công!');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setIsWarehouseOpen(false);
      setWarehouseForm({ name: '', address: '', description: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Tạo kho thất bại'),
  });

  const createInventoryMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/v1/inventory', data),
    onSuccess: () => {
      toast.success('Thêm sản phẩm vào kho thành công!');
      queryClient.invalidateQueries({ queryKey: ['inventories', 'inv-stats'] });
      setIsCreateInventoryOpen(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Thao tác thất bại'),
  });

  const stockInMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/v1/inventory/in', data),
    onSuccess: (res) => {
      toast.success(`Nhập kho thành công! Mã lô: ${res.data?.batch?.batchNumber}`);
      queryClient.invalidateQueries({ queryKey: ['inventories', 'inv-stats', 'all-batches', 'stock-history'] });
      setIsStockInOpen(null);
      setStockInForm({ quantity: 1, supplier: '', harvestDate: '', expiryDate: '', warehouseLocation: '', note: '', referenceId: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Nhập kho thất bại'),
  });

  const stockOutMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/v1/inventory/out', data),
    onSuccess: () => {
      toast.success('Xuất kho thành công (FIFO)!');
      queryClient.invalidateQueries({ queryKey: ['inventories', 'inv-stats', 'all-batches', 'stock-history'] });
      setIsStockOutOpen(null);
      setStockOutForm({ quantity: 1, referenceId: '', note: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Xuất kho thất bại'),
  });

  const transferMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/v1/inventory/transfer', data),
    onSuccess: () => {
      toast.success('Chuyển kho thành công!');
      queryClient.invalidateQueries({ queryKey: ['inventories', 'stock-history'] });
      setIsTransferOpen(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Chuyển kho thất bại'),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getStockBadge = (inv: any) => {
    const available = inv.currentQuantity - inv.reservedQuantity;
    if (available <= 0) return <Badge variant="error">Hết hàng</Badge>;
    if (inv.minimumQuantity > 0 && inv.currentQuantity <= inv.minimumQuantity)
      return <Badge variant="warning">Sắp hết</Badge>;
    return <Badge variant="success">Còn hàng</Badge>;
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'batches',  label: 'Lô hàng',   icon: <Boxes className="w-4 h-4" /> },
    { id: 'history',  label: 'Lịch sử',   icon: <Activity className="w-4 h-4" /> },
    { id: 'alerts',   label: 'Cảnh báo',  icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all';
  const labelCls = 'text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-emerald-600" /> Quản lý Kho hàng
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi tồn kho, lô hàng FIFO và lịch sử nhập xuất theo chuẩn OCOP
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {user?.role === 'ADMIN' && (
            <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setIsWarehouseOpen(true)}>
              <Plus className="w-4 h-4" /> Tạo kho
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setIsTransferOpen(true)}>
            <ArrowLeftRight className="w-4 h-4" /> Chuyển kho
          </Button>
          <Button variant="primary" size="sm" className="flex items-center gap-1.5" onClick={() => setIsCreateInventoryOpen(true)}>
            <Plus className="w-4 h-4" /> Thêm sản phẩm vào kho
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Package className="w-5 h-5 text-blue-600" />} label="Tổng SKU" value={stats?.totalSKUs} color="bg-blue-50 dark:bg-blue-950/30" />
        <StatCard icon={<Boxes className="w-5 h-5 text-emerald-600" />} label="Tổng tồn kho" value={stats?.totalQuantity?.toLocaleString()} color="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard icon={<TrendingDown className="w-5 h-5 text-amber-600" />} label="Sắp hết hàng" value={stats?.lowStockCount} sub="≤ ngưỡng cảnh báo" color="bg-amber-50 dark:bg-amber-950/30" />
        <StatCard icon={<CalendarX className="w-5 h-5 text-red-600" />} label="Lô sắp hết hạn" value={stats?.expiringCount} sub="trong 30 ngày tới" color="bg-red-50 dark:bg-red-950/30" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-emerald-600 border-emerald-500'
                : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.icon} {tab.label}
            {tab.id === 'alerts' && (stats?.lowStockCount + stats?.expiringCount) > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {stats.lowStockCount + stats.expiringCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ── TAB 1: Overview ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {invLoading ? (
              <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
            ) : inventories.length === 0 ? (
              <EmptyState
                icon={<Package className="w-8 h-8" />}
                title="Chưa có tồn kho nào"
                description="Tạo kho và thêm sản phẩm vào kho để bắt đầu quản lý"
                action={<Button variant="primary" size="sm" onClick={() => setIsCreateInventoryOpen(true)}><Plus className="w-4 h-4" /> Thêm sản phẩm vào kho</Button>}
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Sản phẩm</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Kho</th>
                          <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tồn kho</th>
                          <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Khả dụng</th>
                          <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Đặt trước</th>
                          <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                          <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Lô</th>
                          <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventories.map((inv: any) => (
                          <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {inv.product?.images?.[0]?.imageUrl ? (
                                  <img src={inv.product.images[0].imageUrl} className="w-8 h-8 rounded-lg object-cover" alt="" />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Package className="w-4 h-4 text-slate-400" /></div>
                                )}
                                <span className="font-semibold text-slate-800 dark:text-slate-100 max-w-[140px] truncate">{inv.product?.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                              <div className="flex items-center gap-1.5">
                                {inv.warehouse?.name}
                                {inv.warehouse?.latitude && inv.warehouse?.longitude && (
                                  <span title={`GPS Configured: ${inv.warehouse.latitude}, ${inv.warehouse.longitude}`}>
                                    <MapPin className="w-3 h-3 text-emerald-500" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">{inv.currentQuantity.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                              {(inv.currentQuantity - inv.reservedQuantity).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">{inv.reservedQuantity}</td>
                            <td className="px-4 py-3 text-center">{getStockBadge(inv)}</td>
                            <td className="px-4 py-3 text-center text-slate-500 text-xs">{inv._count?.batches ?? '–'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setIsStockInOpen(inv)}
                                  title="Nhập kho"
                                  className="h-8 w-8 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setIsStockOutOpen(inv)}
                                  title="Xuất kho"
                                  className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => { setSelectedInventoryDetail(inv); setActiveTab('batches'); }}
                                  title="Xem lô hàng"
                                  className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ── TAB 2: Batches ───────────────────────────────────────────────── */}
        {activeTab === 'batches' && (
          <motion.div key="batches" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {batchLoading ? (
              <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
            ) : batches.length === 0 ? (
              <EmptyState icon={<Boxes className="w-8 h-8" />} title="Chưa có lô hàng nào" description="Nhập kho để tạo lô hàng đầu tiên" />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Mã lô</th>
                          <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Còn lại / Ban đầu</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Thu hoạch</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Hết hạn</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nhà cung cấp</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Vị trí</th>
                          <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Chất lượng</th>
                          <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map((b: any) => {
                          const isExpiringSoon = b.expiryDate && new Date(b.expiryDate) <= new Date(Date.now() + 30 * 86400000);
                          return (
                            <tr key={b.id} className={`border-b border-slate-50 dark:border-slate-800/50 transition-colors ${isExpiringSoon ? 'bg-amber-50/30 dark:bg-amber-950/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                                  {b.batchNumber}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-slate-800 dark:text-slate-100">{b.quantity}</span>
                                <span className="text-slate-400"> / {b.initialQuantity}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs">
                                {b.harvestDate ? new Date(b.harvestDate).toLocaleDateString('vi-VN') : '–'}
                              </td>
                              <td className="px-4 py-3">
                                {b.expiryDate ? (
                                  <span className={`text-xs font-semibold ${isExpiringSoon ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                                    {isExpiringSoon && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                    {new Date(b.expiryDate).toLocaleDateString('vi-VN')}
                                  </span>
                                ) : '–'}
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs max-w-[120px] truncate">{b.supplier || '–'}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{b.warehouseLocation || '–'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${QUALITY_CONFIG[b.qualityStatus]?.color}`}>
                                  {QUALITY_CONFIG[b.qualityStatus]?.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={BATCH_STATUS_CONFIG[b.status]?.variant}>
                                  {BATCH_STATUS_CONFIG[b.status]?.label}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ── TAB 3: History ───────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {['', 'IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'TRANSFER'].map(mt => (
                <button
                  key={mt}
                  onClick={() => setMovementFilter(mt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    movementFilter === mt
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-400'
                  }`}
                >
                  {mt === '' ? 'Tất cả' : MOVEMENT_CONFIG[mt]?.label}
                </button>
              ))}
            </div>

            {histLoading ? (
              <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
            ) : history.length === 0 ? (
              <EmptyState icon={<Activity className="w-8 h-8" />} title="Chưa có lịch sử nhập xuất" description="Thực hiện nhập kho hoặc xuất kho để ghi nhận lịch sử" />
            ) : (
              <div className="space-y-2">
                {history.map((mv: any) => {
                  const cfg = MOVEMENT_CONFIG[mv.movementType] ?? MOVEMENT_CONFIG.IN;
                  const absQty = Math.abs(mv.quantity);
                  return (
                    <motion.div
                      key={mv.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 flex items-center gap-4"
                    >
                      <div className={`p-2 rounded-xl border ${cfg.color}`}>{cfg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-xs text-slate-400 font-mono">{mv.inventory?.product?.name}</span>
                          {mv.referenceId && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              Ref: {mv.referenceId}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>Kho: <span className="font-semibold">{mv.inventory?.warehouse?.name}</span></span>
                          {mv.batch && <span>Lô: <span className="font-mono font-semibold">{mv.batch.batchNumber}</span></span>}
                          <span>Bởi: {mv.createdBy?.fullName}</span>
                          <span className="ml-auto text-[10px]">{new Date(mv.createdAt).toLocaleString('vi-VN')}</span>
                        </div>
                        {mv.note && <p className="text-xs text-slate-400 italic mt-1">{mv.note}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-black ${mv.quantity >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {cfg.sign}{absQty.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400">{mv.beforeQuantity} → {mv.afterQuantity}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── TAB 4: Alerts ────────────────────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* Low Stock */}
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-500" /> Sắp hết hàng
              </h3>
              {lowStock.length === 0 ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-4 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                  ✅ Tất cả sản phẩm đều đủ hàng. Tốt lắm!
                </div>
              ) : (
                <div className="space-y-2">
                  {lowStock.map((item: any, i: number) => (
                    <div key={i} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white text-sm">{item.product_name}</p>
                        <p className="text-xs text-slate-500">Kho: {item.warehouse_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-amber-600 text-lg">{item.current_quantity}</p>
                        <p className="text-[10px] text-slate-400">Ngưỡng: {item.minimum_quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expiring */}
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <CalendarX className="w-4 h-4 text-red-500" /> Lô sắp hết hạn (30 ngày)
              </h3>
              {expiring.length === 0 ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-4 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                  ✅ Không có lô hàng nào sắp hết hạn.
                </div>
              ) : (
                <div className="space-y-2">
                  {expiring.map((b: any) => (
                    <div key={b.id} className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-xs font-bold text-red-700 dark:text-red-400 mb-0.5">{b.batchNumber}</p>
                        <p className="font-bold text-slate-800 dark:text-white text-sm">{b.inventory?.product?.name}</p>
                        <p className="text-xs text-slate-500">Kho: {b.inventory?.warehouse?.name} · Còn: {b.quantity} sản phẩm</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-red-600 text-sm">{new Date(b.expiryDate).toLocaleDateString('vi-VN')}</p>
                        <p className="text-[10px] text-slate-400">Hạn sử dụng</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal: Tạo kho ──────────────────────────────────────────────────── */}
      <CreateWarehouseModal 
        isOpen={isWarehouseOpen} 
        onClose={() => setIsWarehouseOpen(false)} 
        onSubmit={(data) => createWarehouseMutation.mutate(data)} 
        isPending={createWarehouseMutation.isPending} 
      />

      {/* ── Modal: Thêm sản phẩm vào kho ────────────────────────────────────── */}
      <Modal isOpen={isCreateInventoryOpen} onClose={() => setIsCreateInventoryOpen(false)} title="Thêm sản phẩm vào kho" className="max-w-lg">
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Kho *</label>
            <select value={inventoryForm.warehouseId} onChange={e => setInventoryForm(f => ({ ...f, warehouseId: e.target.value }))} className={inputCls}>
              <option value="">-- Chọn kho --</option>
              {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Sản phẩm *</label>
            <select value={inventoryForm.productId} onChange={e => setInventoryForm(f => ({ ...f, productId: e.target.value }))} className={inputCls}>
              <option value="">-- Chọn sản phẩm --</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Ngưỡng cảnh báo tồn kho tối thiểu</label><input type="number" min={0} value={inventoryForm.minimumQuantity} onChange={e => setInventoryForm(f => ({ ...f, minimumQuantity: +e.target.value }))} className={inputCls} /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => setIsCreateInventoryOpen(false)}>Hủy</Button>
            <Button variant="primary" size="sm" isLoading={createInventoryMutation.isPending}
              onClick={() => createInventoryMutation.mutate(inventoryForm)}
              disabled={!inventoryForm.warehouseId || !inventoryForm.productId}
            >Thêm vào kho</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Nhập kho ─────────────────────────────────────────────────── */}
      <Modal isOpen={!!isStockInOpen} onClose={() => setIsStockInOpen(null)} title={`Nhập kho — ${isStockInOpen?.product?.name}`} className="max-w-lg">
        <div className="flex flex-col gap-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-900/40">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              Tồn kho hiện tại: <span className="font-black text-base">{isStockInOpen?.currentQuantity}</span>
            </p>
            <p className="text-[11px] text-emerald-600/70 mt-0.5">Mã lô sẽ được tự động sinh (VD: 20260709-HONEY-001)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Số lượng nhập *</label><input type="number" min={1} value={stockInForm.quantity} onChange={e => setStockInForm(f => ({ ...f, quantity: +e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Nhà cung cấp</label><input value={stockInForm.supplier} onChange={e => setStockInForm(f => ({ ...f, supplier: e.target.value }))} className={inputCls} placeholder="HTX, nông dân..." /></div>
            <div><label className={labelCls}>Ngày thu hoạch</label><input type="date" value={stockInForm.harvestDate} onChange={e => setStockInForm(f => ({ ...f, harvestDate: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Hạn sử dụng</label><input type="date" value={stockInForm.expiryDate} onChange={e => setStockInForm(f => ({ ...f, expiryDate: e.target.value }))} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Vị trí lưu kho</label><input value={stockInForm.warehouseLocation} onChange={e => setStockInForm(f => ({ ...f, warehouseLocation: e.target.value }))} className={inputCls} placeholder="VD: Kệ A3, Kho lạnh..." /></div>
          <div><label className={labelCls}>Mã phiếu nhập (tùy chọn)</label><input value={stockInForm.referenceId} onChange={e => setStockInForm(f => ({ ...f, referenceId: e.target.value }))} className={inputCls} placeholder="VD: PO-2026-001" /></div>
          <div><label className={labelCls}>Ghi chú</label><textarea rows={2} value={stockInForm.note} onChange={e => setStockInForm(f => ({ ...f, note: e.target.value }))} className={inputCls + ' resize-none'} placeholder="Ghi chú thêm..." /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => setIsStockInOpen(null)}>Hủy</Button>
            <Button variant="primary" size="sm" isLoading={stockInMutation.isPending}
              onClick={() => stockInMutation.mutate({ inventoryId: isStockInOpen?.id, ...stockInForm })}
            ><ArrowDown className="w-4 h-4" /> Nhập kho</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Xuất kho ─────────────────────────────────────────────────── */}
      <Modal isOpen={!!isStockOutOpen} onClose={() => setIsStockOutOpen(null)} title={`Xuất kho — ${isStockOutOpen?.product?.name}`} className="max-w-md">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3 border border-red-200 dark:border-red-900/40">
            <p className="text-xs text-red-700 dark:text-red-400 font-semibold">
              Khả dụng: <span className="font-black text-base">{(isStockOutOpen?.currentQuantity || 0) - (isStockOutOpen?.reservedQuantity || 0)}</span>
            </p>
            <p className="text-[11px] text-red-600/70 mt-0.5">Hệ thống tự động xuất theo FIFO (lô cũ nhất trước)</p>
          </div>
          <div><label className={labelCls}>Số lượng xuất *</label><input type="number" min={1} max={(isStockOutOpen?.currentQuantity || 0) - (isStockOutOpen?.reservedQuantity || 0)} value={stockOutForm.quantity} onChange={e => setStockOutForm(f => ({ ...f, quantity: +e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Mã đơn hàng tham chiếu</label><input value={stockOutForm.referenceId} onChange={e => setStockOutForm(f => ({ ...f, referenceId: e.target.value }))} className={inputCls} placeholder="VD: ORDER-1023" /></div>
          <div><label className={labelCls}>Ghi chú</label><textarea rows={2} value={stockOutForm.note} onChange={e => setStockOutForm(f => ({ ...f, note: e.target.value }))} className={inputCls + ' resize-none'} /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => setIsStockOutOpen(null)}>Hủy</Button>
            <Button variant="destructive" size="sm" isLoading={stockOutMutation.isPending}
              onClick={() => stockOutMutation.mutate({ inventoryId: isStockOutOpen?.id, ...stockOutForm })}
            ><ArrowUp className="w-4 h-4" /> Xuất kho</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Chuyển kho ───────────────────────────────────────────────── */}
      <Modal isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} title="Chuyển hàng giữa các kho" className="max-w-md">
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Kho nguồn (xuất) *</label>
            <select value={transferForm.fromInventoryId} onChange={e => setTransferForm(f => ({ ...f, fromInventoryId: e.target.value }))} className={inputCls}>
              <option value="">-- Chọn kho nguồn --</option>
              {inventories.map((inv: any) => <option key={inv.id} value={inv.id}>{inv.product?.name} — {inv.warehouse?.name} (Còn: {inv.currentQuantity})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Kho đích (nhận) *</label>
            <select value={transferForm.toInventoryId} onChange={e => setTransferForm(f => ({ ...f, toInventoryId: e.target.value }))} className={inputCls}>
              <option value="">-- Chọn kho đích --</option>
              {inventories.filter((inv: any) => inv.id !== transferForm.fromInventoryId).map((inv: any) => (
                <option key={inv.id} value={inv.id}>{inv.product?.name} — {inv.warehouse?.name}</option>
              ))}
            </select>
          </div>
          <div><label className={labelCls}>Số lượng chuyển *</label><input type="number" min={1} value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: +e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Lý do chuyển *</label><input value={transferForm.reason} onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="VD: Điều phối hàng từ HN sang HP" /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => setIsTransferOpen(false)}>Hủy</Button>
            <Button variant="primary" size="sm" isLoading={transferMutation.isPending}
              onClick={() => transferMutation.mutate(transferForm)}
              disabled={!transferForm.fromInventoryId || !transferForm.toInventoryId || !transferForm.reason}
            ><ArrowLeftRight className="w-4 h-4" /> Chuyển kho</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
