'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Lock } from 'lucide-react';

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
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md shadow-lg border border-slate-100">
        <CardHeader className="text-center flex flex-col items-center gap-2 pb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white font-bold shadow-md shadow-emerald-500/20">
            O
          </div>
          <CardTitle className="text-xl font-extrabold text-slate-800 tracking-tight">
            Đăng nhập hệ thống
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Nền tảng Quản trị & Bản đồ số OCOP Việt Nam
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-4">
            <Input
              type="email"
              label="Email đăng nhập"
              placeholder="name@company.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              type="password"
              label="Mật khẩu"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isLoading}>
              Đăng nhập
            </Button>

            <div className="text-center text-xs text-slate-500 mt-2">
              Chưa có tài khoản?{' '}
              <Link href="/register" className="font-bold text-emerald-600 hover:text-emerald-700">
                Đăng ký ngay
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
