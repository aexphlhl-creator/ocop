'use client';

import React from 'react';
import Header from '../../components/layout/header';
import Sidebar from '../../components/layout/sidebar';
import Topbar from '../../components/layout/topbar';
import { useCurrentUser } from '../../hooks/use-auth';
import LoadingSpinner from '../../components/ui/loading-spinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
        <LoadingSpinner size="lg" />
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 animate-pulse">
          Đang xác thực thông tin...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }
  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9] dark:bg-[#020617] relative overflow-hidden">
      {/* Premium Dashboard Background Orbs & Pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      <div className="absolute top-[-10%] right-[-5%] w-[50vw] h-[50vw] bg-emerald-500/10 dark:bg-emerald-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[50vw] h-[50vw] bg-blue-500/10 dark:bg-blue-900/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col flex-1">
        <Header />
        <div className="flex flex-row flex-1 overflow-hidden">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-y-auto relative">
            <Topbar />
            <main className="flex-1 p-6 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
