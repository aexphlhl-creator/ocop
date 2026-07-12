'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Leaf, Mail, Lock, ArrowRight } from 'lucide-react';

// ─── Schema giữ nguyên 100% ─────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Địa chỉ email không đúng định dạng'),
  password: z.string().min(6, 'Mật khẩu phải dài ít nhất 6 ký tự'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const loginStore = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  // ─── Logic submit giữ nguyên 100% ─────────────────────────────────────────
  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const response = await api.post('/api/v1/auth/login', data);
      const { user, accessToken, refreshToken } = response.data.data;
      loginStore(user, accessToken, refreshToken);
      toast.success('Đăng nhập hệ thống thành công');
      router.push('/dashboard');
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Đăng nhập không thành công, vui lòng thử lại';
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">

      {/* ─── Left panel – Branding ─────────────────────────────────────── */}
      <motion.div
        className="hidden lg:flex flex-col justify-between w-[45%] bg-[#16A34A] p-12 relative overflow-hidden"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Decorative circles */}
        <div aria-hidden className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-white/5" />
        <div aria-hidden className="absolute top-1/3 right-0 w-48 h-48 rounded-full bg-white/5" />
        <div aria-hidden className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-white/5" />

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white">
            <Leaf className="h-5 w-5 fill-white text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">OCOP Việt Nam</div>
            <div className="text-emerald-200 text-xs">Bản đồ số nông sản</div>
          </div>
        </div>

        {/* Headline */}
        <div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            Kết nối nông sản<br />Việt Nam số hóa
          </h2>
          <p className="text-emerald-100 leading-relaxed text-sm max-w-sm">
            Nền tảng quản trị và bản đồ số OCOP giúp kết nối chủ thể sản xuất với người tiêu dùng trên toàn quốc.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { label: 'Sản phẩm OCOP', value: '5,000+' },
              { label: 'Tỉnh thành', value: '63' },
              { label: 'Chủ thể HTX', value: '1,200+' },
              { label: 'Ngành hàng', value: '20+' },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 rounded-xl p-3">
                <div className="text-white font-black text-xl">{s.value}</div>
                <div className="text-emerald-200 text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-emerald-200/70 text-xs">
          © {new Date().getFullYear()} OCOP Việt Nam. All rights reserved.
        </p>
      </motion.div>

      {/* ─── Right panel – Form ────────────────────────────────────────── */}
      <motion.div
        className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-8"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16A34A] text-white">
              <Leaf className="h-4 w-4 fill-white text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">OCOP Việt Nam</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Đăng nhập</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
              Chào mừng bạn quay lại! Vui lòng nhập thông tin để tiếp tục.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" style={{ top: errors.email ? 'calc(50% - 10px)' : undefined }} />
              <Input
                type="email"
                label="Email đăng nhập"
                placeholder="name@company.com"
                error={errors.email?.message}
                className="pl-10"
                {...register('email')}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" style={{ top: errors.password ? 'calc(50% - 10px)' : undefined }} />
              <Input
                type="password"
                label="Mật khẩu"
                placeholder="••••••••"
                error={errors.password?.message}
                className="pl-10"
                {...register('password')}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 gap-2"
              isLoading={isLoading}
              size="lg"
            >
              Đăng nhập
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            Chưa có tài khoản?{' '}
            <Link href="/register" className="font-bold text-[#16A34A] hover:text-[#15803D] transition-colors">
              Đăng ký ngay
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
