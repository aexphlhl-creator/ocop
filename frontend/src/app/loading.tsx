import React from 'react';
import LoadingSpinner from '../components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="flex h-[80vh] w-full flex-col items-center justify-center gap-3 bg-slate-50/10">
      <LoadingSpinner size="lg" />
      <span className="text-sm font-semibold text-slate-500 animate-pulse tracking-wide animate-duration-1000">
        Đang tải dữ liệu OCOP...
      </span>
    </div>
  );
}
