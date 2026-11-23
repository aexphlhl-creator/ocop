'use client';

import { getErrorMessage } from '@/utils/api-error';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { GoogleLoginButton } from '../../components/auth/GoogleLoginButton';
import { OcopLogo } from '../../components/ui/ocop-logo';

// ─── Schema giữ nguyên 100% ─────────────────────────────────────────────────
const registerSchema = z.object({
  fullName: z.string().min(2, 'Họ tên phải dài ít nhất 2 ký tự'),
  email: z.string().email('Địa chỉ email không đúng định dạng'),
  phone: z.string().min(10, 'Số điện thoại phải dài ít nhất 10 ký tự').optional().or(z.literal('')),
  password: z.string().min(8, 'Mật khẩu phải dài ít nhất 8 ký tự')
    .max(72, 'Mật khẩu không được dài quá 72 ký tự')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Cần có chữ hoa, chữ thường và chữ số'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  // ─── Logic submit giữ nguyên 100% ─────────────────────────────────────────
  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    const submitData = { ...data, phone: data.phone || undefined };
    try {
      await api.post('/api/v1/auth/register', submitData);
      toast.success('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
      router.push('/login');
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err, 'Đăng ký không thành công, vui lòng thử lại');
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">

      {/* ─── Left panel – Branding ────────────────────────────────────── */}
      <motion.div
        className="hidden lg:flex flex-col justify-between w-[40%] bg-slate-900 dark:bg-slate-950 p-12 relative overflow-hidden"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#16A34A]/10 to-transparent" />
        <div aria-hidden className="absolute top-20 right-0 w-64 h-64 rounded-full bg-[#16A34A]/5" />

        <div className="flex items-center gap-3">
          <OcopLogo size="lg" />
        </div>

        <div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            Tham gia cùng<br />
            <span className="text-[#16A34A]">chúng tôi hôm nay</span>
          </h2>
          <p className="text-slate-400 leading-relaxed text-sm">
            Đăng ký tài khoản người tiêu dùng để mua sắm, theo dõi đơn hàng và kiểm tra nguồn gốc sản phẩm OCOP.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {['Mua sắm sản phẩm OCOP', 'Theo dõi trạng thái đơn hàng', 'Tra cứu nguồn gốc lô hàng', 'Khám phá bản đồ số địa phương'].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                <div className="h-1.5 w-1.5 rounded-full bg-[#16A34A] shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-500 text-xs">
          © {new Date().getFullYear()} OCOP Việt Nam. All rights reserved.
        </p>
      </motion.div>

      {/* ─── Right panel – Form ────────────────────────────────────────── */}
      <motion.div
        className="flex-1 flex items-start justify-center bg-slate-50 dark:bg-slate-950 p-8 overflow-y-auto"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="w-full max-w-md py-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center mb-8">
            <OcopLogo size="md" />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Tạo tài khoản</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
              Điền thông tin bên dưới để đăng ký tài khoản mới.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <Input
              type="text"
              label="Họ và tên"
              placeholder="Nguyễn Văn A"
              error={errors.fullName?.message}
              {...register('fullName')}
            />

            <Input
              type="email"
              label="Địa chỉ Email"
              placeholder="name@company.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              type="text"
              label="Số điện thoại (tùy chọn)"
              placeholder="0987654321"
              error={errors.phone?.message}
              {...register('phone')}
            />

            <Input
              type="password"
              label="Mật khẩu"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              Tài khoản Seller được Admin tạo và xác minh trong trang quản trị người bán.
            </p>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 gap-2"
              isLoading={isLoading}
              size="lg"
            >
              Đăng ký tài khoản
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-50 dark:bg-slate-950 px-3 text-slate-400 dark:text-slate-500 font-medium">
                Hoặc đăng ký nhanh bằng
              </span>
            </div>
          </div>

          <GoogleLoginButton text="Đăng ký nhanh bằng Google" />

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            Đã có tài khoản?{' '}
            <Link href="/login" className="font-bold text-[#16A34A] hover:text-[#15803D] transition-colors">
              Đăng nhập
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
