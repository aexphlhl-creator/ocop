'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useAuthStore } from '../../../stores/auth.store';
import { User, Mail, Phone, Shield } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Hồ sơ cá nhân</h1>
        <p className="text-xs text-slate-400">Xem và cập nhật thông tin tài khoản quản trị</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <User className="h-4.5 w-4.5 text-slate-400" />
            Thông tin tài khoản OCOP
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input label="Họ và tên" value={user.fullName} disabled />
          <Input label="Địa chỉ Email" value={user.email} disabled />
          <Input label="Số điện thoại" value={user.phone || 'Chưa cập nhật'} disabled />

          <div className="w-full flex flex-col gap-1.5 mt-2">
            <label className="text-xs font-semibold text-slate-600 tracking-wide">
              Vai trò quyền hạn
            </label>
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm text-slate-600">
              <Shield className="h-4 w-4 text-slate-400" />
              <span>Tài khoản {user.role}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-50 pt-4 mt-4">
            <Button variant="outline" size="sm">Hủy bỏ</Button>
            <Button variant="primary" size="sm" disabled>Cập nhật thông tin (Skeleton)</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
