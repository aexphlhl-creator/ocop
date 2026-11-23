'use client';

import { AssetImage } from '@/components/ui/asset-image';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { Button } from '../../../../components/ui/button';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { ArrowLeft, Calendar, User } from 'lucide-react';

export default function NewsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['newsDetail', slug],
    queryFn: async () => {
      const res = await api.get(`/api/v1/news/${slug}`);
      return res.data.data;
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="py-20 text-center flex flex-col items-center gap-4">
        <h2 className="text-lg font-bold text-slate-700">Không tìm thấy bài viết</h2>
        <p className="text-xs text-slate-400">Tin tức này không tồn tại hoặc đã bị gỡ bỏ.</p>
        <Button variant="primary" size="sm" onClick={() => router.push('/news')}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 dark:text-slate-100 max-w-3xl mx-auto">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </div>

      {/* Article Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white leading-tight tracking-tight">
          {article.title}
        </h1>
        <div className="flex items-center gap-4 text-xs text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-4">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-slate-400" />
            {new Date(article.createdAt).toLocaleDateString('vi-VN')}
          </span>
          <span className="flex items-center gap-1">
            <User className="h-4 w-4 text-slate-400" />
            Đăng bởi: <span className="font-bold text-slate-600 dark:text-slate-300">{article.author?.fullName || 'Ban chỉ đạo'}</span>
          </span>
        </div>
      </div>

      {/* Thumbnail */}
      {article.thumbnail && (
        <div className="rounded-xl overflow-hidden aspect-video w-full bg-slate-100 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
          <AssetImage src={article.thumbnail} alt={article.title} className="h-full w-full object-cover" />
        </div>
      )}

      {/* Article Content */}
      <article className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line flex flex-col gap-4">
        {article.content}
      </article>
    </div>
  );
}
