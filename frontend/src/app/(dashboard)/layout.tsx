'use client';

import React from 'react';
import Header from '../../components/layout/header';
import Sidebar from '../../components/layout/sidebar';
import { useCurrentUser } from '../../hooks/use-auth';
import LoadingSpinner from '../../components/ui/loading-spinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <LoadingSpinner size="lg" />
        <span className="text-sm font-semibold text-slate-500 animate-pulse">
          Đang xác thực thông tin...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-row flex-grow">
        <Sidebar />
        <main className="flex-grow p-6 bg-slate-50/50 h-[calc(100vh-64px)] overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
