'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../services/api';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { ProductCard } from '../../../../components/ui/product-card';
import { Store, MapPin, Phone, Mail, Calendar, Search, ShieldCheck, MessageCircle } from 'lucide-react';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Pagination } from '../../../../components/ui/pagination';

export default function ShopProfilePage() {
  const params = useParams();
  const router = useRouter();
  const shopId = params.id as string;
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch shop details
  const { data: shop, isLoading: isShopLoading } = useQuery({
    queryKey: ['shop', shopId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/businesses/${shopId}`);
      return res.data.data;
    },
    enabled: !!shopId,
  });

  // Fetch shop products
  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ['shopProducts', shopId, page, searchQuery],
    queryFn: async () => {
      const res = await api.get('/api/v1/products', {
        params: {
          businessId: shopId,
          page,
          limit: 12,
          search: searchQuery || undefined,
          status: 'APPROVED', // Only show approved products
        }
      });
      return res.data;
    },
    enabled: !!shopId,
  });

  if (isShopLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={<Store className="w-12 h-12 text-slate-300" />}
          title="Không tìm thấy cửa hàng"
          description="Cửa hàng này không tồn tại hoặc đã bị xóa."
        />
      </div>
    );
  }

  const productsList = productsData?.data || [];
  const totalPages = productsData?.meta?.totalPages || 1;
  const productCount = productsData?.meta?.total ?? shop._count?.products ?? 0;

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Shop Header / Cover */}
      <div className="bg-emerald-600 dark:bg-emerald-900 pt-10 pb-20 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center md:items-end gap-6 text-white">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white dark:border-slate-800 bg-white dark:bg-slate-800 shadow-xl overflow-hidden shrink-0 flex items-center justify-center">
            {shop.avatarUrl ? (
              <img src={shop.avatarUrl} alt={shop.name} className="w-full h-full object-cover" />
            ) : (
              <Store className="w-16 h-16 text-slate-300" />
            )}
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
              <h1 className="text-3xl md:text-4xl font-black">{shop.name}</h1>
              {shop.isVerified && (
                <ShieldCheck className="w-6 h-6 text-blue-400" />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-emerald-100 text-sm mt-4 md:mt-2">
              {shop.province && (
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {shop.ward?.name}, {shop.province.name}</span>
              )}
              {shop.phone && (
                <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {shop.phone}</span>
              )}
              {shop.email && (
                <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {shop.email}</span>
              )}
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Tham gia: {new Date(shop.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 items-center md:items-end">
            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 text-center min-w-[120px]">
              <span className="block text-2xl font-black">{productCount}</span>
              <span className="text-xs uppercase font-bold tracking-wider opacity-90">Sản phẩm</span>
            </div>
            {shop.phone && (
              <a 
                href={`https://zalo.me/${shop.phone.replace(/[^0-9]/g, '')}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full text-center px-4 py-2.5 bg-[#0068FF] hover:bg-[#005AE0] text-white rounded-xl font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                Chat Zalo
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-10 mb-20 relative z-10">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 md:p-8">
          
          {/* Controls & Search */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" />
              Sản phẩm của Shop
            </h2>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm trong shop này..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1); // Reset page on search
                }}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-transparent focus:bg-white focus:border-emerald-500 rounded-xl text-sm transition-all outline-none"
              />
            </div>
          </div>

          {/* Product Grid */}
          {isProductsLoading ? (
            <div className="py-20 flex justify-center"><LoadingSpinner /></div>
          ) : productsList.length === 0 ? (
            <div className="py-10">
              <EmptyState 
                icon={<Store className="w-12 h-12 text-slate-300" />} 
                title={searchQuery ? "Không tìm thấy sản phẩm nào" : "Cửa hàng chưa có sản phẩm nào được duyệt"} 
                description={searchQuery ? "Hãy thử với từ khóa khác" : "Chủ thể chưa đăng bán sản phẩm nào."}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {productsList.map((product: any) => (
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
