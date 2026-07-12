'use client';

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
import { Leaf, User, Mail, Phone, Lock, Store, Eye, ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';

// ─── Schema giữ nguyên 100% ─────────────────────────────────────────────────
const registerSchema = z.object({
  fullName: z.string().min(2, 'Họ tên phải dài ít nhất 2 ký tự'),
  email: z.string().email('Địa chỉ email không đúng định dạng'),
  phone: z.string().min(10, 'Số điện thoại phải dài ít nhất 10 ký tự').optional().or(z.literal('')),
  password: z.string().min(6, 'Mật khẩu phải dài ít nhất 6 ký tự'),
  role: z.enum(['SELLER', 'VISITOR']),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'VISITOR' },
  });

  const selectedRole = watch('role');

  // ─── Logic submit giữ nguyên 100% ─────────────────────────────────────────
  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    const submitData = { ...data, phone: data.phone || undefined };
    try {
      await api.post('/api/v1/auth/register', submitData);
      toast.success('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
      router.push('/login');
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Đăng ký không thành công, vui lòng thử lại';
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const roles: { value: 'VISITOR' | 'SELLER'; label: string; desc: string; icon: React.ElementType }[] = [
    { value: 'VISITOR', label: 'Người tiêu dùng', desc: 'Khám phá và theo dõi sản phẩm OCOP', icon: Eye },
    { value: 'SELLER', label: 'Chủ thể OCOP', desc: 'Đăng ký và quản lý sản phẩm', icon: Store },
  ];

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

        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#16A34A] text-white">
            <Leaf className="h-5 w-5 fill-white text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">OCOP Việt Nam</div>
            <div className="text-slate-400 text-xs">Bản đồ số nông sản</div>
          </div>
        </div>

        <div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            Tham gia cùng<br />
            <span className="text-[#16A34A]">chúng tôi hôm nay</span>
          </h2>
          <p className="text-slate-400 leading-relaxed text-sm">
            Đăng ký để quản lý sản phẩm OCOP, kết nối với người tiêu dùng và mở rộng thị trường nông sản Việt Nam.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {['Đăng ký sản phẩm OCOP miễn phí', 'Theo dõi trạng thái kiểm duyệt', 'Kết nối bản đồ số địa phương', 'Quản lý thông tin chủ thể'].map((f) => (
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
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16A34A] text-white">
              <Leaf className="h-4 w-4 fill-white text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">OCOP Việt Nam</span>
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

            {/* Role selector – visual toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
                Vai trò tài khoản
              </label>
              <input type="hidden" {...register('role')} />
              <div className="grid grid-cols-2 gap-3">
                {roles.map(({ value, label, desc, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('role', value)}
                    className={cn(
                      'flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 text-left transition-all duration-150',
                      selectedRole === value
                        ? 'border-[#16A34A] bg-emerald-50 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div className={cn(
                      'p-1.5 rounded-lg',
                      selectedRole === value ? 'bg-[#16A34A] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className={cn('text-xs font-bold', selectedRole === value ? 'text-[#16A34A]' : 'text-slate-700 dark:text-slate-300')}>
                      {label}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-snug">{desc}</span>
                  </button>
                ))}
              </div>
              {errors.role && <span className="text-xs text-red-500 font-medium">{errors.role.message}</span>}
            </div>

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
