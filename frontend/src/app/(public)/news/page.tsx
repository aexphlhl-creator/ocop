'use client';

import type { NewsArticle, QueryParams } from '@/types/catalog';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { Card } from '../../../components/ui/card';
import { SearchBox } from '../../../components/ui/search-box';
import { Pagination } from '../../../components/ui/pagination';
import { LoadingSpinner } from '../../../components/ui/loading-spinner';
import { EmptyState } from '../../../components/ui/empty-state';
import { Calendar, User, ArrowRight, Newspaper } from 'lucide-react';

// ─── All query logic preserved identically ──────────────────────────────────

export default function NewsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 6;

  const { data: newsData, isLoading } = useQuery({
    queryKey: ['publicNewsList', search, page],
    queryFn: async () => {
      const params: QueryParams = { page, limit, status: 'PUBLISHED' };
      if (search) params.keyword = search;
      const res = await api.get('/api/v1/news', { params });
      const raw = res.data;
      const rawData = raw?.data;
      const items = Array.isArray(rawData) ? rawData : (rawData?.items || raw?.items || []);
      const meta = raw?.meta || rawData?.meta || { totalPages: Math.ceil(items.length / limit) || 1 };
      return { items, meta };
    },
  });

  const newsList = newsData?.items || [];
  const totalPages = newsData?.meta?.totalPages || 1;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 lg:py-14">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-xs font-bold text-[#16A34A] uppercase tracking-widest mb-2">Cập nhật</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Tin tức nông sản &amp; OCOP
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">
            Tin tức xúc tiến thương mại nông sản OCOP Việt Nam
          </p>
        </div>
        <SearchBox
          value={search}
          onChange={(val) => { setSearch(val); setPage(1); }}
          placeholder="Tìm tin tức, sự kiện..."
          className="w-full md:w-72"
        />
      </div>

      {isLoading ? (
        <div className="py-24 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : newsList.length > 0 ? (
        <div className="flex flex-col gap-4">
          {newsList.map((article: NewsArticle, idx: number) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.3 }}
            >
              <Card className="group overflow-hidden hover:shadow-md transition-all duration-300">
                <div className="flex flex-col sm:flex-row">
                  {/* Thumbnail */}
                  <div className="relative h-48 sm:h-auto sm:w-56 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <AssetImage
                      src={article.thumbnail || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'}
                      alt={article.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex flex-col justify-between p-5 flex-1 gap-3">
                    <div className="flex flex-col gap-2">
                      <Link href={`/news/${article.slug}`} className="block">
                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 leading-snug group-hover:text-[#16A34A] dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                          {article.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {article.content?.replace(/<[^>]*>/g, '')}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                      <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(article.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {article.author?.fullName || 'Ban chỉ đạo'}
                        </span>
                      </div>
                      <Link
                        href={`/news/${article.slug}`}
                        className="flex items-center gap-1 text-xs font-bold text-[#16A34A] hover:text-[#15803D] transition-colors"
                      >
                        Đọc tiếp <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}

          <div className="mt-4">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Newspaper className="h-8 w-8" />}
          title="Không tìm thấy bài viết"
          description="Vui lòng thử lại với từ khóa tìm kiếm khác."
        />
      )}
    </div>
  );
}
