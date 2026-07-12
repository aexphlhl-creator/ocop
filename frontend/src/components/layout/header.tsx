'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '../../stores/theme.store';
import { useAuthStore } from '../../stores/auth.store';
import {
  Sun, Moon, Menu, X, LayoutDashboard, LogOut, User as UserIcon,
  ChevronDown, Leaf, ShoppingCart
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useCart } from '../../hooks/use-cart';
import { CartDrawer } from '../ecommerce/cart-drawer';

const navLinks = [
  { href: '/', label: 'Trang chủ' },
  { href: '/products', label: 'Sản phẩm' },
  { href: '/shops', label: 'Gian hàng' },
  { href: '/news', label: 'Tin tức' },
  { href: '/map', label: 'Bản đồ' },
];

export const Header: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = useCart((state) => state.getTotalItems());

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [pathname]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <motion.header
        className={cn(
          'sticky top-0 z-40 w-full transition-all duration-300',
          scrolled
            ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 shadow-sm'
            : 'bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800'
        )}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between h-16 px-4 sm:px-6 lg:px-8">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0" aria-label="OCOP Việt Nam – Trang chủ">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16A34A] text-white shadow-sm shadow-emerald-500/25 transition-transform duration-200 group-hover:scale-105">
              <Leaf className="h-4.5 w-4.5 fill-white text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">OCOP</span>
              <span className="text-[10px] text-[#16A34A] font-semibold tracking-wider uppercase">Việt Nam</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-0.5" aria-label="Điều hướng chính">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-150',
                  isActive(link.href)
                    ? 'text-[#16A34A] bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                )}
                aria-current={isActive(link.href) ? 'page' : undefined}
              >
                {link.label}
                {isActive(link.href) && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-[#16A34A]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            {/* Theme toggle */}
            {mounted && (
              <button
                aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                onClick={toggleTheme}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {theme === 'dark'
                  ? <Sun className="h-4.5 w-4.5" />
                  : <Moon className="h-4.5 w-4.5" />
                }
              </button>
            )}

            {/* Cart toggle */}
            {mounted && (
              <button
                onClick={() => setCartOpen(true)}
                className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Giỏ hàng"
              >
                <ShoppingCart className="h-4.5 w-4.5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-950">
                    {totalItems > 99 ? '99+' : totalItems}
                  </span>
                )}
              </button>
            )}

            {/* Auth area */}
            {mounted && user ? (
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Tài khoản người dùng"
                  aria-expanded={userMenuOpen}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-[#16A34A] font-bold text-xs shrink-0">
                    {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col items-start leading-none text-left">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[96px] truncate">
                      {user.fullName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{user.role}</span>
                  </div>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ml-0.5', userMenuOpen && 'rotate-180')} />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-50"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.14 }}
                    >
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <LayoutDashboard className="h-4 w-4 text-slate-400" />
                        Bảng điều khiển
                      </Link>
                      <Link
                        href="/dashboard/profile"
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <UserIcon className="h-4 w-4 text-slate-400" />
                        Hồ sơ cá nhân
                      </Link>
                      <div className="border-t border-slate-100 dark:border-slate-800" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Đăng xuất
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : mounted ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#16A34A] dark:hover:text-emerald-400 transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-xl transition-colors shadow-sm shadow-emerald-500/20"
                >
                  Đăng ký
                </Link>
              </div>
            ) : null}

            {/* Mobile hamburger */}
            <button
              aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed top-16 left-0 right-0 z-30 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 md:hidden shadow-xl"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <nav className="flex flex-col p-4 gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                      isActive(link.href)
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-[#16A34A] dark:text-emerald-400'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-3 flex flex-col gap-2">
                  {mounted && user ? (
                    <>
                      <Link href="/dashboard" className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <LayoutDashboard className="h-4 w-4" /> Bảng điều khiển
                      </Link>
                      <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-left w-full">
                        <LogOut className="h-4 w-4" /> Đăng xuất
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" className="w-full text-center py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        Đăng nhập
                      </Link>
                      <Link href="/register" className="w-full text-center py-2.5 text-sm font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-xl transition-colors">
                        Đăng ký
                      </Link>
                    </>
                  )}
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
};

export default Header;
