'use client';

import type { Product, Province, Ward, NamedRecord, OcopLevel, QueryParams, ApiResponse } from '@/types/catalog';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { SearchBox } from '../../../components/ui/search-box';
import { Pagination } from '../../../components/ui/pagination';
import { Button } from '../../../components/ui/button';
import { LoadingSpinner } from '../../../components/ui/loading-spinner';
import { EmptyState } from '../../../components/ui/empty-state';
import { ProductCard } from '../../../components/ui/product-card';
import { SlidersHorizontal, X, ShoppingBag } from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ─── All query/filter logic is 100% preserved ───────────────────────────────

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const initialProvinceId = searchParams.get('provinceId') || '';
  const initialWardId = searchParams.get('wardId') || '';

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState(initialProvinceId);
  const [selectedWardId, setSelectedWardId] = useState(initialWardId);
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [page, setPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const limit = 6;

  // 1. Tải danh mục và xếp hạng OCOP từ API độc lập
  const { data: categories = [] } = useQuery<NamedRecord[]>({
    queryKey: ['publicCategories'],
    queryFn: async () => {
      const res = await api.get('/api/v1/categories');
      return res.data.data || res.data || [];
    },
  });

  const { data: ocopLevels = [] } = useQuery<OcopLevel[]>({
    queryKey: ['publicOcopLevels'],
    queryFn: async () => {
      const res = await api.get('/api/v1/ocop-levels');
      const list: OcopLevel[] = res.data.data || res.data || [];
      return [...list].sort((a, b) => a.level - b.level);
    },
  });

  // 2. Tải danh sách tỉnh thành
  const { data: provinces = [] } = useQuery<Province[]>({
    queryKey: ['provincesList'],
    queryFn: async () => {
      const res = await api.get('/api/v1/provinces');
      return res.data.data || [];
    },
  });

  // 2.5 Tải danh sách xã/phường khi có tỉnh
  const { data: wards = [], isLoading: isLoadingWards } = useQuery<Ward[]>({
    queryKey: ['wardsList', selectedProvinceId],
    queryFn: async () => {
      if (!selectedProvinceId) return [];
      const res = await api.get(`/api/v1/wards?provinceId=${selectedProvinceId}&limit=200`);
      return res.data.data || [];
    },
    enabled: !!selectedProvinceId,
  });

  // 3. Tải sản phẩm có phân trang + bộ lọc
  const { data: productsData, isLoading } = useQuery<ApiResponse<Product[]>>({
    queryKey: ['productsList', search, selectedCategoryId, selectedProvinceId, selectedLevelId, selectedWardId, page],
    queryFn: async () => {
      const params: QueryParams = { page, limit, status: 'APPROVED' };
      if (search) params.search = search;
      if (selectedCategoryId) params.categoryId = selectedCategoryId;
      if (selectedProvinceId) params.provinceId = selectedProvinceId;
      if (selectedLevelId) params.ocopLevelId = selectedLevelId;
      if (selectedWardId) params.wardId = selectedWardId;
      const res = await api.get('/api/v1/products', { params });
      return res.data;
    },
  });

  const productsList = productsData?.data || [];
  const totalPages = productsData?.meta?.totalPages || 1;

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategoryId('');
    setSelectedProvinceId('');
    setSelectedWardId('');
    setSelectedLevelId('');
    setPage(1);
  };

  const hasActiveFilter = !!(search || selectedCategoryId || selectedProvinceId || selectedWardId || selectedLevelId);

  const selectCls = 'w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all cursor-pointer';

  const filterPanel = (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Bộ lọc</h3>
        {hasActiveFilter && (
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1 text-xs font-semibold text-[#16A34A] hover:text-[#15803D] transition-colors"
          >
            <X className="h-3 w-3" /> Xóa tất cả
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ngành hàng</label>
        <select
          value={selectedCategoryId}
          onChange={(e) => { setSelectedCategoryId(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="">Tất cả ngành hàng</option>
          {categories.map((cat: NamedRecord) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Địa phương</label>
        <select
          value={selectedProvinceId}
          onChange={(e) => { setSelectedProvinceId(e.target.value); setSelectedWardId(''); setPage(1); }}
          className={selectCls}
        >
          <option value="">Tất cả tỉnh thành</option>
          {provinces.map((prov: Province) => (
            <option key={prov.id} value={prov.id}>{prov.name}</option>
          ))}
        </select>
      </div>

      {selectedProvinceId && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
            Xã / Phường {isLoadingWards && <LoadingSpinner size="sm" />}
          </label>
          <select
            value={selectedWardId}
            onChange={(e) => { setSelectedWardId(e.target.value); setPage(1); }}
            disabled={isLoadingWards || wards.length === 0}
            className={selectCls}
          >
            <option value="">
              {isLoadingWards ? 'Đang tải...' : wards.length === 0 ? 'Không có dữ liệu' : `Tất cả xã phường (${wards.length})`}
            </option>
            {wards.map((w: Ward) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Xếp hạng sao</label>
        <select
          value={selectedLevelId}
          onChange={(e) => { setSelectedLevelId(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="">Tất cả xếp hạng</option>
          {ocopLevels.map((lvl: OcopLevel) => (
            <option key={lvl.id} value={lvl.id}>{lvl.title}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-14">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-xs font-bold text-[#16A34A] uppercase tracking-widest mb-2">Danh mục</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Sản phẩm OCOP
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">
            Khám phá nông sản sạch đạt tiêu chuẩn OCOP từ khắp mọi miền Việt Nam
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SearchBox
            value={search}
            onChange={(val) => { setSearch(val); setPage(1); }}
            placeholder="Tìm sản phẩm OCOP..."
            className="w-full sm:w-72"
          />
          <Button
            variant="outline"
            size="md"
            className="md:hidden flex items-center gap-2 shrink-0"
            onClick={() => setMobileFilterOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Lọc
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Filter Sidebar – Desktop */}
        <aside className="hidden lg:block">
          <div className="sticky top-32 p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            {filterPanel}
          </div>
        </aside>

        {/* Product Grid */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {isLoading ? (
            <div className="py-24 flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : productsList.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Tìm thấy <span className="font-bold text-slate-800 dark:text-slate-200">{productsData?.meta?.total ?? productsList.length}</span> sản phẩm
                </p>
              </div>

              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {productsList.map((product: Product, idx: number) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.3 }}
                  >
                    <ProductCard product={product} />
                  </motion.div>
                ))}
              </motion.div>

              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          ) : (
            <EmptyState
              icon={<ShoppingBag className="h-8 w-8" />}
              title="Không tìm thấy sản phẩm OCOP"
              description="Vui lòng thử lại với tên sản phẩm hoặc bộ lọc vùng địa lý khác."
              action={
                hasActiveFilter ? (
                  <Button variant="outline" size="sm" onClick={handleResetFilters}>
                    Xóa bộ lọc
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileFilterOpen(false)} />
          <motion.div
            className="relative ml-auto w-80 max-w-full h-full bg-white dark:bg-slate-950 shadow-2xl p-6 overflow-y-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 dark:text-white">Bộ lọc</h3>
              <button onClick={() => setMobileFilterOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            {filterPanel}
            <div className="mt-6">
              <Button className="w-full" onClick={() => setMobileFilterOpen(false)}>
                Áp dụng bộ lọc
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="py-24 flex justify-center"><LoadingSpinner size="lg" /></div>}>
      <ProductsPageContent />
    </Suspense>
  );
}
