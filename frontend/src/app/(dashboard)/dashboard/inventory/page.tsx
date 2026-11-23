'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../../../services/api';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent } from '../../../../components/ui/card';
import { Badge, type BadgeProps } from '../../../../components/ui/badge';
import { Modal } from '../../../../components/ui/modal';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { toast } from 'sonner';
import { CreateWarehouseModal, type WarehouseFormPayload } from '../../../../components/inventory/CreateWarehouseModal';
import { getErrorMessage as getApiErrorMessage } from '../../../../utils/api-error';
import {
  Warehouse, Package, ArrowDown, ArrowUp, RotateCcw, AlertTriangle,
  BarChart3, TrendingDown, CalendarX, Plus,
  Boxes, ArrowLeftRight, Activity, RefreshCw, Eye, MapPin, Pencil, Truck
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'warehouses' | 'batches' | 'history' | 'alerts';

interface WarehouseSummary {
  id: string;
  code: string;
  sellerId?: string | null;
  name: string;
  address: string;
  formattedAddress?: string | null;
  description?: string | null;
  type: string;
  isActive: boolean;
  latitude?: string | number | null;
  longitude?: string | number | null;
  manager?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
  } | null;
  seller?: {
    id: string;
    fullName?: string | null;
    email?: string | null;
    sellerProfile?: {
      displayName?: string | null;
      isVerified?: boolean | null;
    } | null;
  } | null;
  _count?: {
    inventories: number;
    purchaseOrders?: number;
    goodsReceipts?: number;
    outboundShipments?: number;
    inboundShipments?: number;
  };
}

interface ProductOption {
  id: string;
  name: string;
  sellerId?: string | null;
  status?: string;
  seller?: {
    fullName?: string | null;
    sellerProfile?: { displayName?: string | null } | null;
  } | null;
}

interface ApiEnvelope<T> { data: T; meta?: { totalPages: number } }
interface InventoryRow {
  id: string; productId: string; warehouseId: string;
  currentQuantity: number; reservedQuantity: number; minimumQuantity: number; availableQuantity: number;
  product: ProductOption & { images?: Array<{ imageUrl: string }> };
  warehouse: WarehouseSummary;
  _count?: { batches: number };
}
interface BatchRow {
  id: string; batchNumber: string; quantity: number; initialQuantity: number;
  harvestDate?: string | null; expiryDate?: string | null; supplier?: string | null;
  warehouseLocation?: string | null; qualityStatus: string; status: string;
  inventory?: InventoryRow;
}
interface MovementRow {
  id: string; movementType: string; quantity: number; beforeQuantity: number; afterQuantity: number;
  createdAt: string; note?: string | null; referenceId?: string | null;
  inventory?: InventoryRow; batch?: { batchNumber: string } | null; createdBy?: { fullName: string };
}
interface InventoryStats { totalSKUs: number; totalQuantity: number; lowStockCount: number; expiringCount: number }
interface InventoryForm { warehouseId: string; productId: string; minimumQuantity: number }
interface TransferForm { fromInventoryId: string; toInventoryId: string; quantity: number; reason: string }
const EMPTY_TRANSFER: TransferForm = { fromInventoryId: '', toInventoryId: '', quantity: 1, reason: '' };

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await api.get<ApiEnvelope<T[]>>(url, { params: { page, limit: 100 } });
    items.push(...response.data.data);
    totalPages = response.data.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  FINISHED_GOODS: 'Thành phẩm',
  RAW_MATERIAL: 'Nguyên liệu',
  WORK_IN_PROGRESS: 'Đang sản xuất',
  COLD_STORAGE: 'Kho lạnh',
  DISTRIBUTION_CENTER: 'Trung tâm phân phối',
  TRANSIT: 'Kho trung chuyển',
  OTHER: 'Khác',
};

const MOVEMENT_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; sign: string }> = {
  IN:         { label: 'Nhập kho',    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',   icon: <ArrowDown className="w-3.5 h-3.5" />, sign: '+' },
  OUT:        { label: 'Xuất kho',    color: 'text-red-600 bg-red-50 border-red-200',               icon: <ArrowUp className="w-3.5 h-3.5" />,   sign: '-' },
  ADJUSTMENT: { label: 'Điều chỉnh', color: 'text-violet-600 bg-violet-50 border-violet-200',      icon: <RefreshCw className="w-3.5 h-3.5" />, sign: '±' },
  RETURN:     { label: 'Trả hàng',   color: 'text-amber-600 bg-amber-50 border-amber-200',         icon: <RotateCcw className="w-3.5 h-3.5" />, sign: '+' },
  TRANSFER:   { label: 'Chuyển kho', color: 'text-blue-600 bg-blue-50 border-blue-200',            icon: <ArrowLeftRight className="w-3.5 h-3.5" />, sign: '~' },
};

const BATCH_STATUS_CONFIG: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
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
function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value?: number | string; sub?: string; color: string }) {
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const canManageInventoryCatalog =
    user?.role === 'ADMIN' || user?.role === 'SELLER';

  // Modal states
  const [isWarehouseOpen, setIsWarehouseOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseSummary | null>(null);
  const [isCreateInventoryOpen, setIsCreateInventoryOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedInventoryDetail, setSelectedInventoryDetail] = useState<InventoryRow | null>(null);
  const [movementFilter, setMovementFilter] = useState('');

  // Form states
  const [inventoryForm, setInventoryForm] = useState<InventoryForm>({ warehouseId: '', productId: '', minimumQuantity: 0 });
  const [transferForm, setTransferForm] = useState<TransferForm>(EMPTY_TRANSFER);
  const transferRequest = useRef<{ body: string; key: string } | null>(null);
  const [expiryThreshold] = useState(() => Date.now() + 30 * 86400000);
  const refreshInventory = () => Promise.all([
    'inventories', 'inv-stats', 'stock-history', 'all-batches', 'warehouses', 'low-stock', 'expiring',
    'supply-chain-all-batches', 'supply-chain-stats', 'lot-inventory-options',
  ].map(key => queryClient.invalidateQueries({ queryKey: [key] })));

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['inv-stats', user?.id],
    queryFn: () => api.get<ApiEnvelope<InventoryStats>>('/api/v1/inventory/stats').then(r => r.data.data),
    enabled: !!user,
  });

  const { data: warehouses = [] } = useQuery<WarehouseSummary[]>({
    queryKey: ['warehouses', user?.id],
    queryFn: () => api.get<ApiEnvelope<WarehouseSummary[]>>('/api/v1/inventory/warehouses').then(r => r.data.data || []),
    enabled: !!user,
  });

  const { data: inventories = [], isLoading: invLoading } = useQuery({
    queryKey: ['inventories', user?.id],
    queryFn: () => fetchAllPages<InventoryRow>('/api/v1/inventory'),
    enabled: !!user,
  });

  const { data: batches = [], isLoading: batchLoading } = useQuery({
    queryKey: ['all-batches', user?.id, selectedInventoryDetail?.id],
    queryFn: async () => {
      if (!selectedInventoryDetail) {
        return api.get<ApiEnvelope<BatchRow[]>>('/api/v1/supply-chain/batches').then(r => r.data.data);
      }
      return api.get<ApiEnvelope<BatchRow[]>>(`/api/v1/inventory/${selectedInventoryDetail.id}/batches`).then(r => r.data.data || []);
    },
    enabled: !!user && activeTab === 'batches',
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['stock-history', user?.id, movementFilter],
    queryFn: () => fetchAllPages<MovementRow>(`/api/v1/inventory/history${movementFilter ? `?movementType=${movementFilter}` : ''}`),
    enabled: activeTab === 'history',
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ['low-stock', user?.id],
    queryFn: () => api.get<ApiEnvelope<InventoryRow[]>>('/api/v1/inventory/low-stock').then(r => r.data.data || []),
    enabled: activeTab === 'alerts',
  });

  const { data: expiring = [] } = useQuery({
    queryKey: ['expiring', user?.id],
    queryFn: () => api.get<ApiEnvelope<BatchRow[]>>('/api/v1/inventory/expiring?days=30').then(r => r.data.data || []),
    enabled: activeTab === 'alerts',
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductOption[]>({
    queryKey: ['products-for-inventory', user?.id, user?.role],
    queryFn: () => {
      const endpoint = user?.role === 'SELLER'
        ? '/api/v1/products/my'
        : '/api/v1/products?status=APPROVED';
      return fetchAllPages<ProductOption>(endpoint);
    },
    enabled: Boolean(user && canManageInventoryCatalog),
  });

  const selectedWarehouseForInventory = warehouses.find(
    (warehouse) => warehouse.id === inventoryForm.warehouseId,
  );
  const roleScopedApprovedProducts = products.filter(
    (product) =>
      product.status === 'APPROVED' &&
      (user?.role !== 'SELLER' || product.sellerId === user.id),
  );
  const productsForSelectedWarehouse = selectedWarehouseForInventory?.sellerId
    ? roleScopedApprovedProducts.filter(
        (product) => product.sellerId === selectedWarehouseForInventory.sellerId &&
          !inventories.some(inv => inv.warehouseId === selectedWarehouseForInventory.id && inv.productId === product.id),
      )
    : [];

  const transferSource = inventories.find(inv => inv.id === transferForm.fromInventoryId);
  const transferDestinations = transferSource ? inventories.filter(inv =>
    inv.id !== transferSource.id && inv.productId === transferSource.productId &&
    !!transferSource.warehouse.sellerId && inv.warehouse.sellerId === transferSource.warehouse.sellerId &&
    inv.warehouse.isActive,
  ) : [];
  const validTransfer = !!transferSource?.warehouse.isActive &&
    transferDestinations.some(inv => inv.id === transferForm.toInventoryId) &&
    Number.isSafeInteger(transferForm.quantity) && transferForm.quantity > 0 &&
    transferForm.quantity <= transferSource.availableQuantity && !!transferForm.reason.trim();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createWarehouseMutation = useMutation({
    mutationFn: (data: WarehouseFormPayload) => api.post('/api/v1/inventory/warehouses', data),
    onSuccess: () => {
      toast.success('Tạo kho thành công!');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setIsWarehouseOpen(false);
      setEditingWarehouse(null);
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Tạo kho thất bại')),
  });

  const updateWarehouseMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: WarehouseFormPayload }) =>
      api.patch(`/api/v1/inventory/warehouses/${id}`, data),
    onSuccess: () => {
      toast.success('Cập nhật kho thành công!');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      setIsWarehouseOpen(false);
      setEditingWarehouse(null);
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Cập nhật kho thất bại')),
  });

  const createInventoryMutation = useMutation({
    mutationFn: (data: InventoryForm) => api.post('/api/v1/inventory', data),
    onSuccess: async () => {
      toast.success('Thêm sản phẩm vào kho thành công!');
      await refreshInventory();
      setIsCreateInventoryOpen(false);
      setInventoryForm({ warehouseId: '', productId: '', minimumQuantity: 0 });
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Thao tác thất bại')),
  });


  const transferMutation = useMutation({
    mutationFn: (data: TransferForm) => {
      const body = { ...data, reason: data.reason.trim() };
      const serialized = JSON.stringify(body);
      if (transferRequest.current?.body !== serialized) transferRequest.current = { body: serialized, key: crypto.randomUUID() };
      return api.post('/api/v1/inventory/transfer', { ...body, idempotencyKey: transferRequest.current.key });
    },
    onSuccess: async () => {
      toast.success('Chuyển kho thành công!');
      await refreshInventory();
      transferRequest.current = null;
      setTransferForm(EMPTY_TRANSFER);
      setIsTransferOpen(false);
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Chuyển kho thất bại')),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getStockBadge = (inv: InventoryRow) => {
    if (inv.availableQuantity <= 0) return <Badge variant="error">Chưa có hàng khả dụng</Badge>;
    if (inv.minimumQuantity > 0 && inv.currentQuantity <= inv.minimumQuantity)
      return <Badge variant="warning">Sắp hết</Badge>;
    return <Badge variant="success">Còn hàng</Badge>;
  };

  const openCreateWarehouse = () => {
    setEditingWarehouse(null);
    setIsWarehouseOpen(true);
  };

  const closeWarehouseModal = () => {
    if (createWarehouseMutation.isPending || updateWarehouseMutation.isPending) return;
    setIsWarehouseOpen(false);
    setEditingWarehouse(null);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'warehouses', label: `Kho hàng (${warehouses.length})`, icon: <Warehouse className="w-4 h-4" /> },
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
          {user?.role === 'WAREHOUSE_MANAGER' && (
            <Button
              variant="primary"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={() => router.push('/dashboard/shipments')}
            >
              <Truck className="w-4 h-4" /> Tạo chuyến xuất kho
            </Button>
          )}
          {user?.role === 'ADMIN' && (
            <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={openCreateWarehouse}>
              <Plus className="w-4 h-4" /> Tạo kho
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setIsTransferOpen(true)}>
            <ArrowLeftRight className="w-4 h-4" /> Chuyển kho
          </Button>
          {canManageInventoryCatalog && (
            <Button variant="primary" size="sm" className="flex items-center gap-1.5" onClick={() => setIsCreateInventoryOpen(true)} disabled={warehouses.length === 0}>
              <Plus className="w-4 h-4" /> Thêm sản phẩm vào kho
            </Button>
          )}
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        <StatCard icon={<Warehouse className="w-5 h-5 text-violet-600" />} label="Tổng kho hàng" value={warehouses.length} color="bg-violet-50 dark:bg-violet-950/30" />
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
            {tab.id === 'alerts' && stats && (stats.lowStockCount + stats.expiringCount) > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {stats.lowStockCount + stats.expiringCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ── TAB: Warehouses ─────────────────────────────────────────────── */}
        {activeTab === 'warehouses' && (
          <motion.div
            key="warehouses"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {warehouses.length === 0 ? (
              <EmptyState
                icon={<Warehouse className="w-8 h-8" />}
                title="Chưa có kho hàng"
                description={
                  user?.role === 'WAREHOUSE_MANAGER'
                    ? 'Bạn chưa được phân công quản lý kho nào.'
                    : 'Tạo kho đầu tiên để bắt đầu quản lý tồn kho.'
                }
                action={
                  user?.role === 'ADMIN' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={openCreateWarehouse}
                    >
                      <Plus className="w-4 h-4" /> Tạo kho
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {warehouses.map((warehouse) => (
                  <Card key={warehouse.id} className="overflow-hidden">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="shrink-0 rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                            <Warehouse className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black text-slate-900 dark:text-white">
                                {warehouse.name}
                              </h3>
                              <Badge variant="success">Đang hoạt động</Badge>
                            </div>
                            <p className="mt-1 font-mono text-xs text-slate-400">
                              {warehouse.code}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          {user?.role === 'ADMIN' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-3"
                              onClick={() => {
                                setEditingWarehouse(warehouse);
                                setIsWarehouseOpen(true);
                              }}
                              aria-label={`Chỉnh sửa kho ${warehouse.name}`}
                              title="Chỉnh sửa kho"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Sửa
                            </Button>
                          )}
                          <div className="text-right">
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                              {warehouse._count?.inventories ?? 0}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              SKU
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800 sm:grid-cols-2">
                        <div>
                          <p className="font-bold uppercase tracking-wider text-slate-400">
                            Loại kho
                          </p>
                          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                            {WAREHOUSE_TYPE_LABELS[warehouse.type] ?? warehouse.type}
                          </p>
                        </div>
                        <div>
                          <p className="font-bold uppercase tracking-wider text-slate-400">
                            Seller sở hữu
                          </p>
                          <p className="mt-1 truncate font-semibold text-slate-700 dark:text-slate-200">
                            {warehouse.seller?.sellerProfile?.displayName ??
                              warehouse.seller?.fullName ??
                              'Chưa gán'}
                          </p>
                          {warehouse.seller?.email && (
                            <p className="mt-0.5 truncate text-slate-400">
                              {warehouse.seller.email}
                            </p>
                          )}
                          {!warehouse.sellerId && (
                            <p className="mt-0.5 text-[11px] font-semibold text-amber-600">
                              Cần gán Seller trước khi Seller tạo lô
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="font-bold uppercase tracking-wider text-slate-400">
                            Quản lý
                          </p>
                          <p className="mt-1 truncate font-semibold text-slate-700 dark:text-slate-200">
                            {warehouse.manager?.fullName ?? 'Chưa gán'}
                          </p>
                          {warehouse.manager?.email && (
                            <p className="mt-0.5 truncate text-slate-400">
                              {warehouse.manager.email}
                            </p>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <p className="font-bold uppercase tracking-wider text-slate-400">
                            Địa chỉ
                          </p>
                          <p className="mt-1 flex items-start gap-1.5 text-slate-600 dark:text-slate-300">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span>{warehouse.address}</span>
                          </p>
                        </div>
                      </div>

                      {warehouse.description && (
                        <p className="mt-3 line-clamp-2 text-xs text-slate-400">
                          {warehouse.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── TAB 1: Overview ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {invLoading ? (
              <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
            ) : inventories.length === 0 ? (
              <EmptyState
                icon={<Package className="w-8 h-8" />}
                title="Chưa có tồn kho nào"
                description={
                  warehouses.length > 0
                    ? `Bạn đã có ${warehouses.length} kho. Hãy thêm sản phẩm vào kho để bắt đầu theo dõi tồn kho.`
                    : 'Tạo kho và thêm sản phẩm vào kho để bắt đầu quản lý.'
                }
                action={
                  canManageInventoryCatalog && warehouses.length > 0 ? (
                    <Button variant="primary" size="sm" onClick={() => setIsCreateInventoryOpen(true)}><Plus className="w-4 h-4" /> Thêm sản phẩm vào kho</Button>
                  ) : user?.role === 'ADMIN' ? (
                    <Button variant="primary" size="sm" onClick={openCreateWarehouse}><Plus className="w-4 h-4" /> Tạo kho</Button>
                  ) : undefined
                }
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
                        {inventories.map((inv) => (
                          <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {inv.product?.images?.[0]?.imageUrl ? (
                                  <Image src={inv.product.images[0].imageUrl} unoptimized width={32} height={32} className="w-8 h-8 rounded-lg object-cover" alt="" />
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
                              {inv.availableQuantity.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">{inv.reservedQuantity}</td>
                            <td className="px-4 py-3 text-center">{getStockBadge(inv)}</td>
                            <td className="px-4 py-3 text-center text-slate-500 text-xs">{inv._count?.batches ?? '–'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => router.push('/dashboard/supply-chain')}
                                  title="Nhập kho"
                                  className="h-8 w-8 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                >
                                  <ArrowDown className="w-4 h-4" />
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
                        {batches.map((b) => {
                          const isExpiringSoon = b.expiryDate && new Date(b.expiryDate).getTime() <= expiryThreshold;
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
                {history.map((mv) => {
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
                  {lowStock.map((item) => (
                    <div key={item.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white text-sm">{item.product.name}</p>
                        <p className="text-xs text-slate-500">Kho: {item.warehouse.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-amber-600 text-lg">{item.currentQuantity}</p>
                        <p className="text-[10px] text-slate-400">Ngưỡng: {item.minimumQuantity}</p>
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
                {expiring.map((b) => (
                    <div key={b.id} className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-xs font-bold text-red-700 dark:text-red-400 mb-0.5">{b.batchNumber}</p>
                        <p className="font-bold text-slate-800 dark:text-white text-sm">{b.inventory?.product?.name}</p>
                        <p className="text-xs text-slate-500">Kho: {b.inventory?.warehouse?.name} · Còn: {b.quantity} sản phẩm</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-red-600 text-sm">{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('vi-VN') : 'Không có hạn sử dụng'}</p>
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
        onClose={closeWarehouseModal}
        onSubmit={(data) => {
          if (editingWarehouse) {
            updateWarehouseMutation.mutate({ id: editingWarehouse.id, data: { ...data } });
            return;
          }
          createWarehouseMutation.mutate(data);
        }}
        isPending={createWarehouseMutation.isPending || updateWarehouseMutation.isPending}
        initialData={editingWarehouse}
      />

      {/* ── Modal: Thêm sản phẩm vào kho ────────────────────────────────────── */}
      <Modal isOpen={isCreateInventoryOpen} onClose={() => setIsCreateInventoryOpen(false)} title="Thêm sản phẩm vào kho" className="max-w-lg">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">Bước này đăng ký sản phẩm để theo dõi trong kho, tồn ban đầu bằng 0. Sau đó khai báo lô và số lượng tại Chuỗi cung ứng; kho xác nhận số lượng thực nhận.</p>
          <div>
            <label className={labelCls}>Kho *</label>
            <select value={inventoryForm.warehouseId} onChange={e => setInventoryForm(f => ({ ...f, warehouseId: e.target.value, productId: '' }))} className={inputCls}>
              <option value="">-- Chọn kho --</option>
              {warehouses.filter(w => w.isActive).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.seller?.sellerProfile?.displayName ?? w.seller?.fullName ?? 'Chưa gán Seller'}
                </option>
              ))}
            </select>
            {selectedWarehouseForInventory && !selectedWarehouseForInventory.sellerId && (
              <p className="mt-1 text-xs font-semibold text-amber-600">
                Kho này chưa gán Seller nên chưa thể thêm sản phẩm hoặc tạo lô.
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Sản phẩm *</label>
            <select
              value={inventoryForm.productId}
              onChange={e => setInventoryForm(f => ({ ...f, productId: e.target.value }))}
              className={inputCls}
              disabled={!selectedWarehouseForInventory?.sellerId || productsLoading}
            >
              <option value="">
                {productsLoading
                  ? '-- Đang tải sản phẩm --'
                  : selectedWarehouseForInventory?.sellerId
                  ? '-- Chọn sản phẩm --'
                  : '-- Chọn kho trước --'}
              </option>
              {productsForSelectedWarehouse.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.seller?.sellerProfile?.displayName ?? p.seller?.fullName ?? 'Seller'}
                </option>
              ))}
            </select>
            {selectedWarehouseForInventory?.sellerId && !productsLoading && productsForSelectedWarehouse.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Seller của kho này chưa có sản phẩm phù hợp để thêm vào kho.
              </p>
            )}
          </div>
          <div><label className={labelCls}>Ngưỡng cảnh báo tồn kho tối thiểu</label><input type="number" min={0} value={inventoryForm.minimumQuantity} onChange={e => setInventoryForm(f => ({ ...f, minimumQuantity: +e.target.value }))} className={inputCls} /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => setIsCreateInventoryOpen(false)}>Hủy</Button>
            <Button variant="primary" size="sm" isLoading={createInventoryMutation.isPending}
              onClick={() => createInventoryMutation.mutate(inventoryForm)}
              disabled={!selectedWarehouseForInventory?.isActive || !selectedWarehouseForInventory.sellerId || !productsForSelectedWarehouse.some(p => p.id === inventoryForm.productId) || !Number.isSafeInteger(inventoryForm.minimumQuantity) || inventoryForm.minimumQuantity < 0 || createInventoryMutation.isPending}
            >Thêm vào kho</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Chuyển kho ───────────────────────────────────────────────── */}
      <Modal isOpen={isTransferOpen} onClose={() => { if (!transferMutation.isPending) setIsTransferOpen(false); }} title="Chuyển hàng giữa các kho" className="max-w-md">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">Xác nhận khi hàng đã chuyển tới kho đích. Chỉ chuyển sản phẩm cùng Seller. Lô nhận được cách ly, cần QA kiểm định, xếp vị trí kho và phát hành lại trước khi bán.</p>
          <div>
            <label className={labelCls}>Kho nguồn (xuất) *</label>
            <select disabled={transferMutation.isPending} value={transferForm.fromInventoryId} onChange={e => setTransferForm(f => ({ ...f, fromInventoryId: e.target.value, toInventoryId: '' }))} className={inputCls}>
              <option value="">-- Chọn kho nguồn --</option>
              {inventories.filter(inv => inv.warehouse.isActive && inv.availableQuantity > 0).map((inv) => <option key={inv.id} value={inv.id}>{inv.product.name} — {inv.warehouse.name} (Có thể chuyển: {inv.availableQuantity})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Kho đích (nhận) *</label>
            <select disabled={!transferSource || transferMutation.isPending} value={transferForm.toInventoryId} onChange={e => setTransferForm(f => ({ ...f, toInventoryId: e.target.value }))} className={inputCls}>
              <option value="">-- Chọn kho đích --</option>
              {transferDestinations.map((inv) => (
                <option key={inv.id} value={inv.id}>{inv.product?.name} — {inv.warehouse?.name}</option>
              ))}
            </select>
            {transferSource && !transferDestinations.length && <p className="mt-1 text-xs text-amber-700">Chưa có kho đích phù hợp. Đăng ký sản phẩm này tại một kho khác cùng Seller trước khi chuyển.</p>}
          </div>
          <div><label className={labelCls}>Số lượng chuyển *</label><input disabled={transferMutation.isPending} type="number" min={1} step={1} max={transferSource?.availableQuantity} value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: +e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Lý do chuyển *</label><input value={transferForm.reason} onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="VD: Điều phối hàng từ HN sang HP" /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" disabled={transferMutation.isPending} onClick={() => setIsTransferOpen(false)}>Hủy</Button>
            <Button variant="primary" size="sm" isLoading={transferMutation.isPending}
              onClick={() => transferMutation.mutate(transferForm)}
              disabled={!validTransfer || transferMutation.isPending}
            ><ArrowLeftRight className="w-4 h-4" /> Chuyển kho</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
