'use client';

import type { SellerProfile, Province, Product, QueryParams } from '@/types/catalog';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { Pagination } from '../../../components/ui/pagination';
import { LoadingSpinner } from '../../../components/ui/loading-spinner';
import { EmptyState } from '../../../components/ui/empty-state';
import {
  Store,
  MapPin,
  CheckCircle2,
  ArrowRight,
  Building2,
  Star,
  Search,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  Award,
} from 'lucide-react';

const COVER_PRESETS = [
  'https://images.unsplash.com/photo-1576675784201-0e142b423952?auto=format&fit=crop&w=1000&q=80', // đồi chè xanh
  'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1000&q=80', // ruộng bậc thang
  'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=1000&q=80', // nông trại hoa trái
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1000&q=80', // cao nguyên cà phê
  'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1000&q=80', // sông nước miệt vườn
  'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1000&q=80', // làng gốm truyền thống
];

function getCoverImage(sellerId: string, index: number): string {
  if (!sellerId) return COVER_PRESETS[index % COVER_PRESETS.length];
  let hash = 0;
  for (let i = 0; i < sellerId.length; i++) {
    hash = (hash << 5) - hash + sellerId.charCodeAt(i);
    hash |= 0;
  }
  return COVER_PRESETS[Math.abs(hash) % COVER_PRESETS.length];
}

export default function SellersPage() {
  const [search, setSearch] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'verified' | 'has_products'>('all');
  const [page, setPage] = useState(1);
  const limit = 6;

  // 1. Tải danh sách tỉnh thành
  const { data: provinces = [] } = useQuery({
    queryKey: ['provincesListForSellers'],
    queryFn: async () => {
      const res = await api.get('/api/v1/provinces');
      return res.data.data || [];
    },
  });

  // 2. Tải hồ sơ gian hàng của Seller có phân trang và lọc
  const { data: sellersData, isLoading } = useQuery({
    queryKey: ['sellersList', search, selectedProvinceId, page],
    queryFn: async () => {
      const params: QueryParams = { page, limit };
      if (search) params.search = search;
      if (selectedProvinceId) params.provinceId = selectedProvinceId;
      const res = await api.get('/api/v1/seller-profiles', { params });
      return res.data;
    },
  });

  const rawSellersList = sellersData?.data || [];
  const totalPages = sellersData?.meta?.totalPages || 1;
  const totalShops = sellersData?.meta?.total ?? rawSellersList.length;

  // Lọc nhanh theo tab (Client-side refinement on loaded page)
  const sellersList = useMemo(() => {
    if (filterTab === 'verified') {
      return rawSellersList.filter((s: SellerProfile) => s.isVerified);
    }
    if (filterTab === 'has_products') {
      return rawSellersList.filter((s: SellerProfile) => (s.productsCount || 0) > 0);
    }
    return rawSellersList;
  }, [rawSellersList, filterTab]);

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950">
      {/* ─── Hero Header ────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-950 text-white border-b border-emerald-900/40">
        {/* Decorative ambient lighting */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-10 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-5 backdrop-blur-md">
              <Award className="w-4 h-4 text-emerald-400" />
              Mạng lưới Chủ thể & Hợp tác xã OCOP
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight sm:leading-tight">
              Gian hàng OCOP <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-200 bg-clip-text text-transparent">Toàn quốc</span>
            </h1>

            <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed font-normal">
              Khám phá và kết nối trực tiếp với các Hợp tác xã, Doanh nghiệp sản xuất Nông sản, Thủ công mỹ nghệ và Đặc sản truyền thống đạt chứng nhận OCOP 3 sao - 5 sao trên 34 tỉnh thành và hơn 3.000 xã phường mới.
            </p>

            {/* Stat Pills */}
            <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-5">
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-semibold">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>34 Tỉnh & Thành phố</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-semibold">
                <Building2 className="w-4 h-4 text-teal-300" />
                <span>3.000+ Xã Phường</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-semibold">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>100% Chuẩn OCOP</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-semibold">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span>Bảo chứng Minh bạch</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Content Container ──────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">

        {/* ─── Filter & Search Control Bar ────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  filterTab === 'all'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Tất cả gian hàng ({totalShops})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('verified')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  filterTab === 'verified'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Đã xác minh OCOP
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('has_products')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  filterTab === 'has_products'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                Có sản phẩm bán
              </button>
            </div>

            {/* Province & Search Inputs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Province Dropdown */}
              <div className="relative">
                <select
                  value={selectedProvinceId}
                  onChange={(e) => {
                    setSelectedProvinceId(e.target.value);
                    setPage(1);
                  }}
                  className="w-full sm:w-56 h-11 pl-9 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer appearance-none shadow-sm"
                  aria-label="Lọc theo tỉnh thành"
                >
                  <option value="">Toàn bộ 34 Tỉnh thành</option>
                  {provinces.map((prov: Province) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.name}
                    </option>
                  ))}
                </select>
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</span>
              </div>

              {/* Search Box */}
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm HTX, tên người bán..."
                  className="w-full h-11 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>
            </div>

          </div>
        </div>

        {/* ─── Shop Grid ──────────────────────────────────────────── */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm font-medium text-slate-500">Đang tải danh sách gian hàng OCOP...</p>
          </div>
        ) : sellersList.length > 0 ? (
          <>
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {sellersList.map((seller: SellerProfile, idx: number) => {
                const coverImage = getCoverImage(seller.sellerId || seller.id, idx);
                const featuredProducts = seller.featuredProducts || [];
                const provinceName = seller.province?.name || 'Toàn quốc';

                return (
                  <motion.div
                    key={seller.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                    className="group"
                  >
                    <div className="h-full flex flex-col bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                      
                      {/* 1. Cover Image Section with Badges */}
                      <div className="relative h-40 sm:h-44 w-full overflow-hidden bg-slate-800">
                        <AssetImage
                          src={coverImage}
                          alt={seller.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

                        {/* Top Badges */}
                        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 pointer-events-none">
                          {/* Province Badge */}
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-black/40 backdrop-blur-md text-white border border-white/20 shadow-sm">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{provinceName}</span>
                          </div>

                          {/* OCOP Verified Badge */}
                          {seller.isVerified ? (
                            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600/90 text-white backdrop-blur-md border border-emerald-400/40 shadow-sm">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Chứng nhận OCOP</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-900/60 text-slate-300 backdrop-blur-md border border-white/10">
                              <span>Chủ thể OCOP</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Shop Identity & Avatar Bar */}
                      <div className="px-5 sm:px-6 pt-0 pb-4 relative flex-1 flex flex-col">
                        
                        {/* Overlapping Avatar & Header row */}
                        <div className="flex items-end justify-between -mt-10 sm:-mt-12 mb-3">
                          {/* Avatar */}
                          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white dark:bg-slate-800 border-4 border-white dark:border-slate-900 shadow-md overflow-hidden shrink-0 flex items-center justify-center">
                            {seller.avatarUrl ? (
                              <AssetImage
                                src={seller.avatarUrl}
                                alt={seller.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                <Store className="w-10 h-10" />
                              </div>
                            )}
                          </div>

                          {/* Product count badge */}
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>{seller.productsCount ?? 0} sản phẩm</span>
                          </div>
                        </div>

                        {/* Cooperative / Shop Name */}
                        <div className="mb-3">
                          <Link href={`/shops/${seller.sellerId || seller.id}`} className="group/title">
                            <h3 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white leading-tight group-hover/title:text-emerald-600 dark:group-hover/title:text-emerald-400 transition-colors line-clamp-1">
                              {seller.name}
                            </h3>
                          </Link>
                          {seller.taxCode ? (
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1">
                              Mã số thuế: <span className="font-semibold text-slate-600 dark:text-slate-300">{seller.taxCode}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Hợp tác xã nông nghiệp & Làng nghề</p>
                          )}
                        </div>

                        {/* Address & Contact info snippet */}
                        <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                          <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-1 leading-snug font-medium">
                            {seller.address ? `${seller.address}, ${provinceName}` : `Khu vực: ${provinceName}`}
                          </span>
                        </div>

                        {/* 3. Featured Products Preview Strip */}
                        <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
                          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                            <span>Sản phẩm OCOP nổi bật</span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold lowercase">
                              {featuredProducts.length > 0 ? `top ${featuredProducts.length} sản phẩm` : ''}
                            </span>
                          </p>

                          {featuredProducts.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                              {featuredProducts.slice(0, 3).map((prod) => (
                                <Link
                                  key={prod.id}
                                  href={`/products/${prod.id}`}
                                  className="group/prod flex flex-col p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 border border-slate-200/60 dark:border-slate-700/60 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all text-left"
                                >
                                  {/* Product image thumbnail */}
                                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700 mb-1.5">
                                    <AssetImage
                                      src={prod.image || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=300&q=80'}
                                      alt={prod.name}
                                      className="w-full h-full object-cover group-hover/prod:scale-105 transition-transform duration-300"
                                      onError={(e) => {
                                        e.currentTarget.src = 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=300&q=80';
                                      }}
                                    />
                                    {/* Star Rating Badge */}
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-amber-300 text-[10px] font-bold flex items-center gap-0.5 shadow-sm">
                                      <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                                      <span>{prod.ocopLevel}★</span>
                                    </div>
                                  </div>

                                  {/* Name */}
                                  <h4 className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 group-hover/prod:text-emerald-600 transition-colors">
                                    {prod.name}
                                  </h4>

                                  {/* Price */}
                                  <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    {Number(prod.price).toLocaleString('vi-VN')}đ
                                  </span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="py-4 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 text-center">
                              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                                Chủ thể đang bổ sung hồ sơ chứng nhận OCOP mùa vụ mới.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* 4. Action Buttons Footer */}
                        <div className="flex items-center gap-2.5 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                          {/* Chat Zalo Button (if phone exists) */}
                          {seller.phone ? (
                            <a
                              href={`https://zalo.me/${seller.phone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#0068FF] bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors"
                              title="Tư vấn nhanh qua Zalo"
                            >
                              <MessageCircle className="w-4 h-4 fill-current" />
                              <span className="hidden sm:inline">Zalo</span>
                            </a>
                          ) : null}

                          {/* Enter Shop CTA */}
                          <Link
                            href={`/shops/${seller.sellerId || seller.id}`}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 transition-all group/btn"
                          >
                            <span>Khám phá gian hàng</span>
                            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                          </Link>
                        </div>

                      </div>

                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* ─── Pagination ───────────────────────────────────────── */}
            <div className="mt-10 flex justify-center">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        ) : (
          <div className="py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <EmptyState
              icon={<Building2 className="h-10 w-10 text-emerald-500" />}
              title="Không tìm thấy gian hàng OCOP"
              description="Không có gian hàng nào khớp với tìm kiếm hoặc bộ lọc tỉnh thành đã chọn. Quý khách vui lòng thử chọn tỉnh thành khác."
            />
          </div>
        )}

      </div>
    </div>
  );
}
