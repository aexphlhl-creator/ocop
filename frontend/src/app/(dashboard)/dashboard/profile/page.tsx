'use client';

import { getErrorMessage } from '@/utils/api-error';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { api } from '../../../../services/api';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { useAuthStore } from '../../../../stores/auth.store';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { toast } from 'sonner';
import { User, Mail, Phone, Shield, Lock, CheckCircle } from 'lucide-react';

const profileSchema = z.object({
  fullName: z.string().min(2, 'Họ tên phải dài ít nhất 2 ký tự'),
  phone: z.string().min(10, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: z.string().min(8, 'Mật khẩu mới phải dài ít nhất 8 ký tự')
    .max(72, 'Mật khẩu mới không được dài quá 72 ký tự')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Cần có chữ hoa, chữ thường và chữ số'),
  confirmPassword: z.string().min(8, 'Xác nhận mật khẩu phải dài ít nhất 8 ký tự'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

const roleLabels: Record<string, string> = {
  ADMIN: 'Quản trị hệ thống',
  SELLER: 'Chủ thể sản xuất',
  WAREHOUSE_MANAGER: 'Quản lý kho',
  QUALITY_ASSURANCE: 'QA/QC độc lập',
  LOGISTICS: 'Tài khoản vận chuyển cũ',
  VISITOR: 'Người tiêu dùng',
};

const roleVariants: Record<string, 'success' | 'info' | 'default'> = {
  ADMIN: 'success',
  SELLER: 'info',
  WAREHOUSE_MANAGER: 'success',
  QUALITY_ASSURANCE: 'success',
  LOGISTICS: 'info',
  VISITOR: 'default',
};

export default function DashboardProfilePage() {
  const { user: currentUser, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const [profileSaved, setProfileSaved] = useState(false);

  const {
    register: regProfile,
    handleSubmit: handleProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: currentUser?.fullName ?? '',
      phone: currentUser?.phone ?? '',
    },
  });

  const {
    register: regPassword,
    handleSubmit: handlePassword,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      api.patch('/api/v1/auth/profile', data),
    onSuccess: () => {
      toast.success('Cập nhật thông tin thành công!');
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, 'Không thể cập nhật thông tin')),
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: PasswordFormValues) =>
      api.patch('/api/v1/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      toast.success('Đổi mật khẩu thành công!');
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, mustChangePassword: false } : null,
      }));
      queryClient.setQueryData(['currentUser'], (cached: typeof currentUser) =>
        cached ? { ...cached, mustChangePassword: false } : cached,
      );
      resetPassword();
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, 'Mật khẩu hiện tại không đúng')),
  });

  if (isLoading) {
    return (
      <div className="py-24 flex justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {currentUser?.mustChangePassword && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          Đây là mật khẩu tạm do Admin cấp. Bạn phải đổi mật khẩu trước khi sử dụng các chức năng nghiệp vụ.
        </div>
      )}
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Hồ sơ cá nhân
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Quản lý thông tin tài khoản và bảo mật của bạn
        </p>
      </motion.div>

      {/* Avatar & Role card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-[#16A34A] font-black text-2xl shrink-0">
                {currentUser?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col gap-1.5 min-w-0">
                <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">
                  {currentUser?.fullName}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {currentUser?.email}
                  </span>
                  <Badge variant={roleVariants[currentUser?.role ?? 'VISITOR'] ?? 'default'}>
                    <Shield className="h-3 w-3" />
                    {roleLabels[currentUser?.role ?? ''] ?? currentUser?.role}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Update Profile */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-slate-400" />
              Thông tin cá nhân
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleProfile((data) => updateProfileMutation.mutate(data))}
              className="flex flex-col gap-4"
            >
              <Input
                label="Họ và tên"
                placeholder="Nguyễn Văn A"
                error={profileErrors.fullName?.message}
                {...regProfile('fullName')}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email</label>
                  <div className="flex h-11 items-center px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-400 select-none gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    {currentUser?.email}
                  </div>
                  <span className="text-[10px] text-slate-400">Email không thể thay đổi</span>
                </div>
                <Input
                  label="Số điện thoại"
                  placeholder="0987654321"
                  error={profileErrors.phone?.message}
                  {...regProfile('phone')}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                {profileSaved && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-[#16A34A]">
                    <CheckCircle className="h-4 w-4" /> Đã lưu
                  </span>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={updateProfileMutation.isPending}
                >
                  Lưu thông tin
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Change Password */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-slate-400" />
              Đổi mật khẩu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handlePassword((data) => changePasswordMutation.mutate(data))}
              className="flex flex-col gap-4"
            >
              <Input
                type="password"
                label="Mật khẩu hiện tại"
                placeholder="••••••••"
                error={passwordErrors.currentPassword?.message}
                {...regPassword('currentPassword')}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  type="password"
                  label="Mật khẩu mới"
                  placeholder="••••••••"
                  error={passwordErrors.newPassword?.message}
                  {...regPassword('newPassword')}
                />
                <Input
                  type="password"
                  label="Xác nhận mật khẩu mới"
                  placeholder="••••••••"
                  error={passwordErrors.confirmPassword?.message}
                  {...regPassword('confirmPassword')}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={changePasswordMutation.isPending}
                >
                  Đổi mật khẩu
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Info */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-slate-400" />
              Thông tin tài khoản
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                { label: 'ID Tài khoản', value: currentUser?.id ? currentUser.id.slice(0, 8) + '...' : '—' },
                { label: 'Vai trò', value: roleLabels[currentUser?.role ?? ''] ?? currentUser?.role ?? '—' },
                { label: 'Email', value: currentUser?.email ?? '—' },
                { label: 'Điện thoại', value: currentUser?.phone ?? 'Chưa cập nhật' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-3">
                  <dt className="text-xs font-semibold text-slate-400 dark:text-slate-500">{label}</dt>
                  <dd className="text-sm font-semibold text-slate-700 dark:text-slate-300">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
