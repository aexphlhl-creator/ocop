'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { api } from '../../services/api';
import { toast } from 'sonner';

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
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'VISITOR',
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    // Chuẩn hóa phone: rỗng thì biến thành undefined
    const submitData = {
      ...data,
      phone: data.phone || undefined,
    };

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

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-slate-50 py-12 px-4">
      <Card className="w-full max-w-md shadow-lg border border-slate-100">
        <CardHeader className="text-center flex flex-col items-center gap-2 pb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white font-bold shadow-md shadow-emerald-500/20">
            O
          </div>
          <CardTitle className="text-xl font-extrabold text-slate-800 tracking-tight">
            Đăng ký tài khoản
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Nền tảng Quản trị & Bản đồ số OCOP Việt Nam
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-4">
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
              label="Số điện thoại"
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

            <div className="w-full flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 tracking-wide">
                Vai trò tài khoản
              </label>
              <select
                {...register('role')}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-150"
              >
                <option value="VISITOR">Khách hàng vãng lai / Người tiêu dùng</option>
                <option value="SELLER">Nhà bán hàng / Chủ thể OCOP</option>
              </select>
              {errors.role && (
                <span className="text-xs text-red-500 font-medium mt-0.5">
                  {errors.role.message}
                </span>
              )}
            </div>

            <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isLoading}>
              Đăng ký tài khoản
            </Button>

            <div className="text-center text-xs text-slate-500 mt-2">
              Đã có tài khoản?{' '}
              <Link href="/login" className="font-bold text-emerald-600 hover:text-emerald-700">
                Đăng nhập
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
