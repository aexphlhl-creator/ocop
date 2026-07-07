'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import { cn } from '../../utils/cn';
import { LayoutDashboard, ShoppingBag, Store, Newspaper, Map, User, LogOut } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !user) return null;

  const adminMenu = [
    { name: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sản phẩm OCOP', href: '/products', icon: ShoppingBag },
    { name: 'Chủ thể sản xuất', href: '/businesses', icon: Store },
    { name: 'Tin tức', href: '/news', icon: Newspaper },
    { name: 'Bản đồ số', href: '/map', icon: Map },
    { name: 'Tài khoản', href: '/profile', icon: User },
  ];

  const sellerMenu = [
    { name: 'Cửa hàng của tôi', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sản phẩm của tôi', href: '/products', icon: ShoppingBag },
    { name: 'Chủ thể liên kết', href: '/businesses', icon: Store },
    { name: 'Tài khoản', href: '/profile', icon: User },
    { name: 'Xem Bản đồ', href: '/map', icon: Map },
  ];

  const menuItems = user.role === 'ADMIN' ? adminMenu : sellerMenu;

  return (
    <aside className="w-64 border-r border-slate-100 bg-white h-[calc(100vh-64px)] sticky top-16 flex flex-col justify-between p-4 hidden md:flex shrink-0">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 px-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chức năng</span>
        </div>
        <nav className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  {
                    'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-500/5': isActive,
                    'text-slate-600 hover:text-slate-900 hover:bg-slate-50': !isActive,
                  }
                )}
              >
                <Icon className={cn('h-4.5 w-4.5', { 'text-emerald-600': isActive, 'text-slate-400': !isActive })} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <button
          onClick={() => {
            logout();
            window.location.href = '/login';
          }}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-left rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50/50 transition-all cursor-pointer"
        >
          <LogOut className="h-4.5 w-4.5 text-slate-400 group-hover:text-red-500" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
};
export default Sidebar;
