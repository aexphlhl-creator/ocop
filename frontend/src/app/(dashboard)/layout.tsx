'use client';

import React from 'react';
import Link from 'next/link';
import Header from '../../components/layout/header';
import Sidebar from '../../components/layout/sidebar';
import Topbar from '../../components/layout/topbar';
import { useCurrentUser } from '../../hooks/use-auth';
import LoadingSpinner from '../../components/ui/loading-spinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useCurrentUser();

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
            {user?.mustChangePassword && (
              <div className="bg-amber-600 text-white px-4 py-2.5 text-xs md:text-sm font-medium flex items-center justify-between shadow-sm z-20">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>Tài khoản của bạn đang sử dụng mật khẩu tạm do Quản trị viên cấp. Vui lòng đổi mật khẩu để mở khóa các chức năng nghiệp vụ.</span>
                </div>
                <Link
                  href="/dashboard/profile"
                  className="rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-bold text-white underline transition-colors shrink-0 ml-3"
                >
                  Đổi mật khẩu ngay
                </Link>
              </div>
            )}
            <main className="flex-1 p-6 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
