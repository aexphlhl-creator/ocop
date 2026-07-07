'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import LoadingSpinner from '../../../components/ui/loading-spinner';

// Tải động component Bản đồ để chạy hoàn toàn ở Client-side (tránh lỗi thiếu đối tượng window ở server-side render)
const OcopMap = dynamic(() => import('../../../components/map/ocop-map'), {
  ssr: false,
  loading: () => (
    <div className="flex-grow rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 flex flex-col items-center justify-center p-6 text-center">
      <LoadingSpinner size="lg" />
      <span className="text-xs font-semibold text-slate-400 animate-pulse mt-2">
        Đang chuẩn bị bản đồ số OCOP...
      </span>
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
      <OcopMap />
    </div>
  );
}
