'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import { cn } from '../../utils/cn';
import {
  LayoutDashboard, ShoppingBag, Store, Newspaper, Map, User, LogOut,
  ChevronLeft, ChevronRight, MessageSquare, Ticket, Warehouse, GitBranch, ScrollText, Blocks,
  CalendarRange, BellRing, Truck, Route
} from 'lucide-react';
import { motion } from 'framer-motion';

const subscribeToHydration = () => () => undefined;

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [collapsed, setCollapsed] = useState(false);

  if (!mounted || !user) return null;

  const adminMenu = [
    { name: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sản phẩm OCOP', href: '/dashboard/products', icon: ShoppingBag },
    { name: 'Đơn hàng', href: '/dashboard/orders', icon: ShoppingBag },
    { name: 'Quản lý Kho', href: '/dashboard/inventory', icon: Warehouse },
    { name: 'Chuỗi cung ứng', href: '/dashboard/supply-chain', icon: GitBranch },
    { name: 'Quản lý chuyến hàng', href: '/dashboard/shipments', icon: Route },
    { name: 'Hãng vận chuyển', href: '/dashboard/logistics', icon: Truck },
    { name: 'Chứng nhận', href: '/dashboard/certificates', icon: ScrollText },
    { name: 'Blockchain', href: '/dashboard/blockchain', icon: Blocks },
    { name: 'Mã giảm giá', href: '/dashboard/vouchers', icon: Ticket },
    { name: 'Đánh giá', href: '/dashboard/reviews', icon: MessageSquare },
    { name: 'Người bán', href: '/dashboard/sellers', icon: Store },
    { name: 'Tin tức', href: '/dashboard/news', icon: Newspaper },
    { name: 'Sự kiện & Hội chợ', href: '/dashboard/events', icon: CalendarRange },
    { name: 'Chiến dịch Thông báo', href: '/dashboard/notifications', icon: BellRing },
    { name: 'Bản đồ số', href: '/map', icon: Map },
    { name: 'Tài khoản', href: '/dashboard/profile', icon: User },
  ];

  const sellerMenu = [
    { name: 'Cửa hàng của tôi', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sản phẩm của tôi', href: '/dashboard/products', icon: ShoppingBag },
    { name: 'Quản lý đơn hàng', href: '/dashboard/orders', icon: ShoppingBag },
    { name: 'Quản lý Kho', href: '/dashboard/inventory', icon: Warehouse },
    { name: 'Chuỗi cung ứng', href: '/dashboard/supply-chain', icon: GitBranch },
    { name: 'Chuyến hàng', href: '/dashboard/shipments', icon: Route },
    { name: 'Chứng nhận', href: '/dashboard/certificates', icon: ScrollText },
    { name: 'Mã giảm giá', href: '/dashboard/vouchers', icon: Ticket },
    { name: 'Sự kiện & Hội chợ', href: '/dashboard/events', icon: CalendarRange },
    { name: 'Hồ sơ gian hàng', href: '/dashboard/sellers', icon: Store },
    { name: 'Tài khoản', href: '/dashboard/profile', icon: User },
    { name: 'Xem Bản đồ', href: '/map', icon: Map },
  ];

  const customerMenu = [
    { name: 'Đơn hàng của tôi', href: '/profile/orders', icon: ShoppingBag },
    { name: 'Tài khoản', href: '/dashboard/profile', icon: User },
    { name: 'Xem Bản đồ', href: '/map', icon: Map },
  ];

  const eventCoordinatorMenu = [
    { name: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sự kiện & Hội chợ', href: '/dashboard/events', icon: CalendarRange },
    { name: 'Chiến dịch Thông báo', href: '/dashboard/notifications', icon: BellRing },
    { name: 'Tài khoản', href: '/dashboard/profile', icon: User },
  ];

  const warehouseManagerMenu = [
    { name: 'Quản lý Kho', href: '/dashboard/inventory', icon: Warehouse },
    { name: 'Bàn giao vận chuyển', href: '/dashboard/shipments', icon: Route },
    { name: 'Truy xuất lô hàng', href: '/dashboard/supply-chain', icon: GitBranch },
    { name: 'Tài khoản', href: '/dashboard/profile', icon: User },
  ];

  let menuItems = customerMenu;
  if (user.role === 'ADMIN') menuItems = adminMenu;
  else if (user.role === 'SELLER') menuItems = sellerMenu;
  else if (user.role === 'WAREHOUSE_MANAGER') menuItems = warehouseManagerMenu;
  else if (user.role === 'QUALITY_ASSURANCE') menuItems = [
    { name: 'Kiểm định & phát hành lô', href: '/dashboard/supply-chain', icon: GitBranch },
    { name: 'Tài khoản', href: '/dashboard/profile', icon: User },
  ];
  else if (user.role === 'EVENT_COORDINATOR') menuItems = eventCoordinatorMenu;

  return (
    <motion.aside
      className={cn(
        'h-[calc(100vh-64px)] sticky top-16 flex flex-col justify-between z-20',
        'border-r-0 bg-emerald-950 text-emerald-50',
        'hidden md:flex shrink-0 transition-all duration-300 overflow-hidden shadow-2xl',
        collapsed ? 'w-[80px]' : 'w-[260px]'
      )}
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
      aria-label="Sidebar navigation"
    >
      {/* Top */}
      <div className="flex flex-col gap-1 p-3 flex-1 overflow-y-auto">
        {/* Section Label */}
        {!collapsed && (
          <p className="px-4 pt-4 pb-2 text-[10px] font-bold text-emerald-400/80 uppercase tracking-widest">
            {user.role === 'ADMIN' ? 'Quản trị hệ thống' : 'Quản lý'}
          </p>
        )}

        <nav className="flex flex-col gap-1 px-2 mt-2" aria-label="Menu chính">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.name : undefined}
                className={cn(
                  'flex items-center rounded-xl px-3 py-3 text-[14px] font-medium transition-all duration-300 relative overflow-hidden',
                  'group gap-3.5',
                  isActive
                    ? 'text-white bg-emerald-900 shadow-inner'
                    : 'text-emerald-100/70 hover:text-white hover:bg-emerald-900/50'
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-400 rounded-r-full" 
                  />
                )}
                <Icon
                  className={cn(
                    'shrink-0 transition-colors relative z-10',
                    collapsed ? 'h-5 w-5 mx-auto' : 'h-5 w-5',
                    isActive ? 'text-emerald-400' : 'text-emerald-400/50 group-hover:text-emerald-300'
                  )}
                />
                {!collapsed && <span className="truncate relative z-10 tracking-wide">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom */}
      <div className="p-4 border-t border-emerald-900 flex flex-col gap-2">
        {/* User info */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-emerald-900/50 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-800 text-emerald-100 font-bold text-sm shrink-0 border border-emerald-700">
              {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-bold text-white truncate">{user.fullName}</span>
              <span className="text-[11px] text-emerald-300/70 truncate">{user.email}</span>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          className="flex items-center justify-center w-full gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200/70 hover:text-white hover:bg-emerald-900 transition-colors"
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <><ChevronLeft className="h-4 w-4" /><span>Thu gọn</span></>
          }
        </button>

        {/* Logout */}
        <button
          onClick={() => { logout(); window.location.href = '/login'; }}
          className={cn(
            'flex items-center rounded-xl px-3 py-2.5 w-full text-left text-sm font-medium',
            'text-emerald-200/70 hover:text-white hover:bg-red-500/20 transition-colors gap-3'
          )}
          title={collapsed ? 'Đăng xuất' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0 text-red-400" />
          {!collapsed && <span className="text-red-100">Đăng xuất</span>}
        </button>
      </div>
    </motion.aside>
  );
}
