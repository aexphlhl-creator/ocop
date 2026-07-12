'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { SearchBox } from '../../../components/ui/search-box';
import { Pagination } from '../../../components/ui/pagination';
import { LoadingSpinner } from '../../../components/ui/loading-spinner';
import { EmptyState } from '../../../components/ui/empty-state';
import { Store, Mail, Phone, MapPin, CheckCircle2, ArrowRight, Building2 } from 'lucide-react';

// ─── All query/filter logic preserved identically ───────────────────────────

export default function BusinessesPage() {
  const [search, setSearch] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 6;

  // 1. Tải danh sách tỉnh thành
  const { data: provinces = [] } = useQuery({
    queryKey: ['provincesListForBusinesses'],
    queryFn: async () => {
      const res = await api.get('/api/v1/provinces');
      return res.data.data || [];
    },
  });

  // 2. Tải doanh nghiệp có phân trang và lọc
  const { data: businessesData, isLoading } = useQuery({
    queryKey: ['businessesList', search, selectedProvinceId, page],
    queryFn: async () => {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (selectedProvinceId) params.provinceId = selectedProvinceId;
      const res = await api.get('/api/v1/businesses', { params });
      return res.data;
    },
  });

  const businessesList = businessesData?.data || [];
  const totalPages = businessesData?.meta?.totalPages || 1;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-14">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-xs font-bold text-[#16A34A] uppercase tracking-widest mb-2">Danh bạ</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Gian hàng OCOP
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">
            Các hợp tác xã, doanh nghiệp và hộ kinh doanh tham gia OCOP
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedProvinceId}
            onChange={(e) => { setSelectedProvinceId(e.target.value); setPage(1); }}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all cursor-pointer"
            aria-label="Lọc theo tỉnh thành"
          >
            <option value="">Tất cả tỉnh thành</option>
            {provinces.map((prov: any) => (
              <option key={prov.id} value={prov.id}>{prov.name}</option>
            ))}
          </select>
          <SearchBox
            value={search}
            onChange={(val) => { setSearch(val); setPage(1); }}
            placeholder="Tìm doanh nghiệp, HTX..."
            className="max-w-none sm:w-72"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-24 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : businessesList.length > 0 ? (
        <>
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {businessesList.map((business: any, idx: number) => (
              <motion.div
                key={business.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
              >
                <Card className="h-full hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 rounded-3xl overflow-hidden">
                  <CardContent className="p-6 sm:p-8 flex flex-col justify-between h-full gap-6">

                    {/* Header row */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-5">
                          {business.avatarUrl ? (
                            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shrink-0 overflow-hidden shadow-sm">
                              <img src={business.avatarUrl} alt={business.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0 shadow-sm">
                              <Store className="h-10 w-10" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-black text-lg text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                              {business.name}
                            </h3>
                            <span className="text-sm font-semibold text-slate-400 dark:text-slate-500 mt-1 inline-block">MST: {business.taxCode}</span>
                          </div>
                        </div>
                        {business.isVerified && (
                          <Badge variant="success" className="shrink-0 px-3 py-1 shadow-sm">
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Đã xác minh
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-5">
                      {business.email && (
                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                          <div className="bg-white dark:bg-slate-800 p-1.5 rounded-md shadow-sm"><Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /></div>
                          <span className="truncate font-medium">{business.email}</span>
                        </div>
                      )}
                      {business.phone && (
                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                          <div className="bg-white dark:bg-slate-800 p-1.5 rounded-md shadow-sm"><Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /></div>
                          <span className="font-medium">{business.phone}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                        <div className="bg-white dark:bg-slate-800 p-1.5 rounded-md shadow-sm mt-0.5"><MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /></div>
                        <span className="leading-snug font-medium">{business.address}</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 pt-5 mt-2">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-2 rounded-xl">
                        <ShoppingBagIcon />
                        {business.productsCount ?? 0} sản phẩm
                      </span>
                      <Link
                        href={`/shops/${business.id}`}
                        className="flex items-center gap-2 text-sm font-black bg-[#16A34A] hover:bg-[#15803D] text-white px-5 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                      >
                        Vào gian hàng <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <div className="mt-6">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="Không tìm thấy gian hàng"
          description="Vui lòng thử lại với tên gian hàng hoặc địa phương khác."
        />
      )}
    </div>
  );
}

// Small inline icon to avoid extra import
function ShoppingBagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  );
}
