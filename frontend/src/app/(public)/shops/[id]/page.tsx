'use client';

import type { SellerProfile, Product, QueryParams, ApiResponse } from '@/types/catalog';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { api } from '../../../../services/api';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { ProductCard } from '../../../../components/ui/product-card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Pagination } from '../../../../components/ui/pagination';
import {
  Store,
  Building2,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Search,
  ShieldCheck,
  MessageCircle,
  CheckCircle2,
  Star,
  Share2,
  Award,
  Sparkles,
  ShoppingBag,
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

const COVER_PRESETS = [
  'https://images.unsplash.com/photo-1576675784201-0e142b423952?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1400&q=80',
];

function getCoverImage(sellerId: string): string {
  if (!sellerId) return COVER_PRESETS[0];
  let hash = 0;
  for (let i = 0; i < sellerId.length; i++) {
    hash = (hash << 5) - hash + sellerId.charCodeAt(i);
    hash |= 0;
  }
  return COVER_PRESETS[Math.abs(hash) % COVER_PRESETS.length];
}

export default function ShopProfilePage() {
  const params = useParams();
  const router = useRouter();
  const shopId = params.id as string;

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOcopStar, setSelectedOcopStar] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState('createdAt:desc');
  const [copied, setCopied] = useState(false);

  // 1. Fetch shop details
  const { data: shop, isLoading: isShopLoading } = useQuery<SellerProfile>({
    queryKey: ['shop', shopId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/seller-profiles/${shopId}`);
      return res.data.data;
    },
    enabled: !!shopId,
  });

  // 2. Fetch all seller products for metadata (OCOP levels, star options)
  const { data: allProductsRaw = [] } = useQuery<Product[]>({
    queryKey: ['shopAllProductsMetadata', shop?.sellerId],
    queryFn: async () => {
      if (!shop?.sellerId) throw new Error('Không xác định được cửa hàng');
      const res = await api.get('/api/v1/products', {
        params: {
          sellerId: shop.sellerId,
          limit: 100,
          status: 'APPROVED',
        },
      });
      return res.data.data || [];
    },
    enabled: Boolean(shop?.sellerId),
  });

  // Unique OCOP star levels this shop has
  const availableStars = useMemo(() => {
    const starSet = new Set<number>();
    allProductsRaw.forEach((p: Product) => {
      if (p.ocopLevel?.level) {
        starSet.add(p.ocopLevel.level);
      }
    });
    return Array.from(starSet).sort((a, b) => b - a);
  }, [allProductsRaw]);

  // Find ocopLevelId corresponding to selected star if needed
  const selectedOcopLevelId = useMemo(() => {
    if (!selectedOcopStar) return undefined;
    const match = allProductsRaw.find((p: Product) => p.ocopLevel?.level === selectedOcopStar);
    return match?.ocopLevel?.id;
  }, [selectedOcopStar, allProductsRaw]);

  // 3. Fetch paginated shop products
  const { data: productsData, isLoading: isProductsLoading } = useQuery<ApiResponse<Product[]>>({
    queryKey: ['shopProducts', shop?.sellerId, page, searchQuery, selectedOcopLevelId, sortBy],
    queryFn: async () => {
      if (!shop?.sellerId) throw new Error('Không xác định được cửa hàng');
      const [field, order] = sortBy.split(':');
      const params: QueryParams = {
        sellerId: shop.sellerId,
        page,
        limit: 12,
        status: 'APPROVED',
        sortBy: field,
        sortOrder: order,
      };
      if (searchQuery) params.search = searchQuery;
      if (selectedOcopLevelId) params.ocopLevelId = selectedOcopLevelId;
      const res = await api.get('/api/v1/products', { params });
      return res.data;
    },
    enabled: Boolean(shop?.sellerId),
  });

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (isShopLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm font-medium text-slate-500">Đang tải thông tin gian hàng OCOP...</p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <EmptyState
          icon={<Store className="w-12 h-12 text-slate-300" />}
          title="Không tìm thấy gian hàng OCOP"
          description="Gian hàng này không tồn tại hoặc đã ngừng hoạt động trên hệ thống."
        />
      </div>
    );
  }

  const productsList = productsData?.data || [];
  const totalPages = productsData?.meta?.totalPages || 1;
  const productCount = productsData?.meta?.total ?? shop.productsCount ?? 0;
  const coverImage = getCoverImage(shop.sellerId || shop.id);
  const provinceName = shop.province?.name || '';
  const fullAddress = [shop.address, shop.ward?.name, provinceName].filter(Boolean).join(', ');

  return (
    <div className="bg-slate-50/70 dark:bg-slate-950 min-h-screen pb-20">
      
      {/* ─── 1. Breadcrumb Bar ────────────────────────────────────────── */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 overflow-hidden">
            <Link href="/" className="hover:text-emerald-600 transition-colors whitespace-nowrap">
              Trang chủ
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <Link href="/shops" className="hover:text-emerald-600 transition-colors whitespace-nowrap">
              Gian hàng OCOP
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-900 dark:text-white font-semibold truncate">
              {shop.displayName || shop.name}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyLink}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              title="Sao chép liên kết gian hàng"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã sao chép!' : 'Chia sẻ'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── 2. Panoramic Cover Storefront ────────────────────────────── */}
      <div className="relative h-64 sm:h-80 md:h-96 w-full overflow-hidden bg-slate-900">
        <AssetImage
          src={coverImage}
          alt={shop.name}
          className="w-full h-full object-cover object-center"
        />
        {/* Subtle dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-black/20" />

        {/* Top Badges */}
        <div className="absolute top-6 left-4 sm:left-8 flex flex-wrap items-center gap-2">
          {provinceName && (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-black/50 backdrop-blur-md text-white border border-white/20 shadow-md">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>{provinceName}</span>
            </div>
          )}
          {shop.isVerified && (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-600/90 backdrop-blur-md text-white border border-emerald-400/40 shadow-md">
              <ShieldCheck className="w-4 h-4 text-emerald-200" />
              <span>Bảo chứng OCOP Quốc gia</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── 3. Shop Profile Header Card (Overlapping) ────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative z-20">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            {/* Left: Avatar & Info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
              {/* Logo / Avatar */}
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-3xl bg-white dark:bg-slate-800 border-4 border-white dark:border-slate-800 shadow-xl overflow-hidden shrink-0 flex items-center justify-center ring-4 ring-emerald-500/20">
                {shop.avatarUrl ? (
                  <AssetImage
                    src={shop.avatarUrl}
                    alt={shop.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                    <Store className="w-12 h-12" />
                  </div>
                )}
              </div>

              {/* Names & Metadata */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    {shop.displayName || shop.name}
                  </h1>
                  {shop.isVerified && (
                    <span title="Chủ thể OCOP đã được xác minh"><CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" /></span>
                  )}
                </div>

                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {shop.taxCode ? (
                    <>Mã số thuế: <span className="font-semibold text-slate-700 dark:text-slate-300">{shop.taxCode}</span> • </>
                  ) : null}
                  Hợp tác xã & Doanh nghiệp nông sản
                </p>

                {/* Location & Join Date */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {fullAddress && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="font-medium">{fullAddress}</span>
                    </span>
                  )}
                  {shop.createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Tham gia OCOP: {new Date(shop.createdAt).toLocaleDateString('vi-VN')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Contact CTA & Stats */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
              {/* Stat counters */}
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-center min-w-[100px]">
                  <span className="block text-xl font-black text-emerald-700 dark:text-emerald-300">{productCount}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Sản phẩm OCOP</span>
                </div>
                <div className="px-4 py-2 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-center min-w-[100px]">
                  <span className="block text-xl font-black text-amber-700 dark:text-amber-300">
                    {availableStars.length > 0 ? `${availableStars.join(', ')}★` : '3-5★'}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">Chứng nhận OCOP</span>
                </div>
              </div>

              {/* Direct Communication Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {shop.phone && (
                  <a
                    href={`https://zalo.me/${shop.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0068FF] hover:bg-[#005AE0] text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-blue-500/20"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    Chat Zalo
                  </a>
                )}
                {shop.phone && (
                  <a
                    href={`tel:${shop.phone}`}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-bold transition-colors"
                  >
                    <Phone className="w-4 h-4 text-emerald-600" />
                    Hotline: {shop.phone}
                  </a>
                )}
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* ─── 4. Cooperative Story & Guarantees Section ────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Story Card (2 cols) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4" />
                Câu chuyện Hợp tác xã & Làng nghề
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-3">
                Gìn giữ Tinh hoa & Phát triển Đặc sản Bản địa
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 font-normal">
                {shop.description || (
                  `Gian hàng ${shop.displayName || shop.name} cam kết mang đến những sản phẩm nông sản đặc sản đạt chuẩn chất lượng quốc gia OCOP. Với phương thức canh tác tự nhiên, gìn giữ nét truyền thống quê hương kết hợp quy chuẩn vệ sinh an toàn thực phẩm hiện đại, từng sản phẩm xuất xưởng đều được bảo chứng nguồn gốc rõ ràng và kiểm định nghiêm ngặt.`
                )}
              </p>
            </div>

            {/* Quality Commitments */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 text-center">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-lg">🌿</span>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1">Nông sản sạch</p>
                <p className="text-[10px] text-slate-400">Chuẩn VietGAP</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-lg">⭐</span>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1">Chuẩn OCOP</p>
                <p className="text-[10px] text-slate-400">3 - 5 Sao thẩm định</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-lg">🛡️</span>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1">Truy xuất minh bạch</p>
                <p className="text-[10px] text-slate-400">Mã QR chính hãng</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-lg">🚚</span>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1">Giao toàn quốc</p>
                <p className="text-[10px] text-slate-400">Đóng gói chuẩn bảo quản</p>
              </div>
            </div>
          </div>

          {/* Contact Details Card (1 col) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                <Building2 className="w-4 h-4 text-emerald-600" />
                Thông tin liên hệ chủ thể
              </div>
              
              <div className="space-y-3.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {shop.email && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <Mail className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate font-medium">{shop.email}</span>
                  </div>
                )}
                {shop.phone && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{shop.phone}</span>
                  </div>
                )}
                {fullAddress && (
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-snug font-medium">{fullAddress}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Trạng thái hoạt động:</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Đang mở cửa
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* ─── 5. Shop Products Catalog Section ─────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          
          {/* Header & Internal Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-600" />
                Danh mục sản phẩm ({productCount})
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Tất cả sản phẩm đã được Hội đồng OCOP đánh giá và phê duyệt lưu hành
              </p>
            </div>

            {/* Search & Sort Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Internal search input */}
              <div className="relative sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm trong gian hàng..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>

              {/* Sort selector */}
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-sm"
              >
                <option value="createdAt:desc">Mới nhất</option>
                <option value="price:asc">Giá: Thấp đến Cao</option>
                <option value="price:desc">Giá: Cao đến Thấp</option>
              </select>
            </div>
          </div>

          {/* OCOP Star Rating Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
            <button
              type="button"
              onClick={() => {
                setSelectedOcopStar(null);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                selectedOcopStar === null
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Tất cả hạng sao
            </button>

            {[5, 4, 3].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => {
                  setSelectedOcopStar(selectedOcopStar === star ? null : star);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  selectedOcopStar === star
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <Star className={`w-4 h-4 ${selectedOcopStar === star ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'}`} />
                <span>OCOP {star} Sao</span>
              </button>
            ))}
          </div>

          {/* Product Grid Display */}
          {isProductsLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm font-medium text-slate-500">Đang tải danh sách sản phẩm...</p>
            </div>
          ) : productsList.length === 0 ? (
            <div className="py-16">
              <EmptyState
                icon={<ShoppingBag className="w-12 h-12 text-slate-300" />}
                title={searchQuery || selectedOcopStar ? "Không tìm thấy sản phẩm phù hợp" : "Gian hàng chưa có sản phẩm nào"}
                description={
                  searchQuery || selectedOcopStar
                    ? "Hãy thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc hạng sao."
                    : "Chủ thể chưa cập nhật sản phẩm nào được phê duyệt trên hệ thống."
                }
              />
              {(searchQuery || selectedOcopStar) && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedOcopStar(null);
                      setPage(1);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                  >
                    Xóa bộ lọc tìm kiếm
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {productsList.map((product: Product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-12 flex justify-center">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}

        </div>
      </div>

    </div>
  );
}
