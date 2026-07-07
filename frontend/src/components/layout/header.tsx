'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Menu, User as UserIcon, LogOut, LayoutDashboard, MapPin } from 'lucide-react';

export const Header: React.FC = () => {
  const router = useRouter();
  const { user, logout, accessToken } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === 'ADMIN') return 'error';
    if (role === 'SELLER') return 'warning';
    return 'default';
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-600 text-white font-bold text-lg shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-all">
              O
            </div>
            <span className="font-extrabold text-slate-800 tracking-tight text-lg group-hover:text-emerald-600 transition-colors">
              OCOP <span className="text-emerald-600">Việt Nam</span>
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/map" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-600 rounded-md hover:bg-slate-50 transition-colors">
              <MapPin className="h-4 w-4" />
              Bản đồ số
            </Link>
            <Link href="/products" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-600 rounded-md hover:bg-slate-50 transition-colors">
              Sản phẩm
            </Link>
            <Link href="/businesses" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-600 rounded-md hover:bg-slate-50 transition-colors">
              Chủ thể
            </Link>
            <Link href="/news" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-600 rounded-md hover:bg-slate-50 transition-colors">
              Tin tức
            </Link>
          </nav>
        </div>

        {/* User / Authentication buttons */}
        <div className="flex items-center gap-3">
          {mounted && accessToken && user ? (
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-600 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Bảng quản trị
              </Link>

              {/* Profile drop down or avatar */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end hidden sm:flex">
                  <span className="text-sm font-bold text-slate-800 leading-none">{user.fullName}</span>
                  <Badge variant={getRoleBadgeVariant(user.role)} className="mt-1 transform scale-90 origin-right text-[10px]">
                    {user.role}
                  </Badge>
                </div>
                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-500">
                  <UserIcon className="h-4.5 w-4.5" />
                </div>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0 rounded-full hover:bg-red-50 hover:text-red-500 text-slate-400" onClick={handleLogout}>
                  <LogOut className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">Đăng nhập</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">Đăng ký</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
export default Header;
