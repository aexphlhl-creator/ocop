'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import { cn } from '../../utils/cn';
import { motion } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import { NotificationDropdown } from './notification-dropdown';

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const segmentLabels: Record<string, string> = {
  dashboard: 'Bảng điều khiển',
  products: 'Sản phẩm',
  businesses: 'Chủ thể',
  news: 'Tin tức',
  profile: 'Hồ sơ',
  map: 'Bản đồ',
};

export default function Topbar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const segments = pathname.split('/').filter(Boolean);

  return (
    <motion.header
      className={cn(
        'sticky top-0 z-30 w-full',
        'bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm',
        'border-b border-slate-100 dark:border-slate-800',
        'px-6 h-12 flex items-center justify-between'
      )}
      initial={{ y: -6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.05 }}
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link
          href="/"
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          aria-label="Trang chủ"
        >
          <Home className="h-3.5 w-3.5" />
        </Link>

        {segments.map((seg, idx) => {
          const href = '/' + segments.slice(0, idx + 1).join('/');
          const isLast = idx === segments.length - 1;
          const label = segmentLabels[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);

          return (
            <React.Fragment key={href}>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
              {isLast ? (
                <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">{label}</span>
              ) : (
                <Link
                  href={href}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors text-xs"
                >
                  {label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Right */}
      <div className="flex items-center gap-2">
        {isDemoMode && (
          <span className="hidden sm:inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Demo Environment
          </span>
        )}

        <NotificationDropdown />

        {user && (
          <Link
            href="/dashboard/profile"
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-[#16A34A] font-bold text-[10px]">
              {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 hidden sm:block max-w-[96px] truncate">
              {user.fullName || user.email}
            </span>
          </Link>
        )}
      </div>
    </motion.header>
  );
}
