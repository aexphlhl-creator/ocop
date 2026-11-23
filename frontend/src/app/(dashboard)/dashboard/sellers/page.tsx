'use client';

import type { SellerProfile, Province, Ward, ApiResponse } from '@/types/catalog';

import { getErrorMessage } from '@/utils/api-error';

import React, { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, LockKeyhole, Plus, RotateCcw, Store, Download } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { api } from '../../../../services/api';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent } from '../../../../components/ui/card';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Input } from '../../../../components/ui/input';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { Modal } from '../../../../components/ui/modal';
import { Pagination } from '../../../../components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';

const accountSchema = z.object({
  fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  phone: z.string().max(20).optional().or(z.literal('')),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Cần có chữ hoa, chữ thường và chữ số'),
});

const profileSchema = z.object({
  name: z.string().min(2, 'Tên gian hàng phải có ít nhất 2 ký tự'),
  taxCode: z.string().optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  industry: z.string().optional().or(z.literal('')),
  avatarUrl: z.string().url('URL ảnh không hợp lệ').optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  provinceId: z.string().optional().or(z.literal('')),
  wardId: z.string().optional().or(z.literal('')),
  isVerified: z.boolean(),
});

type AccountForm = z.infer<typeof accountSchema>;
type ProfileForm = z.infer<typeof profileSchema>;

const selectClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm dark:border-slate-700 dark:bg-slate-900';

export default function DashboardSellersPage() {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SellerProfile | null>(null);
  const [statusTarget, setStatusTarget] = useState<SellerProfile | null>(null);

  const accountForm = useForm<AccountForm>({ resolver: zodResolver(accountSchema) });
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { isVerified: false },
  });
  const provinceId = useWatch({ control: profileForm.control, name: 'provinceId' });

  const { data: profilesResponse, isLoading } = useQuery<ApiResponse<SellerProfile[]>>({
    queryKey: ['sellerProfiles', page, user?.id, isAdmin],
    queryFn: async () => {
      const response = await api.get('/api/v1/seller-profiles', {
        params: { page, limit: 10, ownerId: isAdmin ? undefined : user?.id, includeInactive: isAdmin || undefined },
      });
      return response.data;
    },
    enabled: Boolean(user),
  });
  const profiles = profilesResponse?.data ?? [];
  const totalPages = profilesResponse?.meta?.totalPages ?? 1;

  const { data: provinces = [] } = useQuery<Province[]>({
    queryKey: ['sellerProfileProvinces'],
    queryFn: async () => (await api.get('/api/v1/provinces')).data.data ?? [],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ['sellerProfileWards', provinceId],
    queryFn: async () => {
      const response = await api.get('/api/v1/wards', { params: { provinceId, limit: 100 } });
      return response.data.data?.items ?? response.data.data ?? [];
    },
    enabled: Boolean(provinceId),
  });

  useEffect(() => {
    if (!editing) return;
    profileForm.reset({
      name: editing.name ?? '', taxCode: editing.taxCode ?? '', phone: editing.phone ?? '',
      email: editing.email ?? '', address: editing.address ?? '', industry: editing.industry ?? '',
      avatarUrl: editing.avatarUrl ?? '', description: editing.description ?? '',
      provinceId: editing.province?.id ?? '', wardId: editing.ward?.id ?? '',
      isVerified: Boolean(editing.isVerified),
    });
  }, [editing, profileForm]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sellerProfiles'] });
  const createSeller = useMutation({
    mutationFn: (values: AccountForm) => api.post('/api/v1/users/sellers', values),
    onSuccess: () => {
      toast.success('Đã tạo tài khoản Seller và hồ sơ gian hàng');
      setCreateOpen(false); accountForm.reset(); refresh();
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, 'Không thể tạo Seller')),
  });
  const updateProfile = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProfileForm }) => {
      const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
      if (!isAdmin) delete payload.isVerified;
      return api.patch(`/api/v1/seller-profiles/${id}`, payload);
    },
    onSuccess: () => {
      toast.success('Đã cập nhật hồ sơ người bán'); setEditing(null); refresh();
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, 'Không thể cập nhật hồ sơ')),
  });
  const changeStatus = useMutation({
    mutationFn: ({ sellerId, isActive }: { sellerId: string; isActive: boolean }) =>
      api.patch(`/api/v1/users/sellers/${sellerId}/status`, { isActive }),
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? 'Đã kích hoạt Seller' : 'Đã khóa Seller'); setStatusTarget(null); refresh();
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, 'Không thể đổi trạng thái')),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-black text-slate-900 dark:text-white">Quản lý người bán</h1>
          <p className="mt-1 text-sm text-slate-500">Mỗi Seller có đúng một hồ sơ gian hàng và sở hữu trực tiếp sản phẩm, đơn hàng, kho và lô hàng.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/v1/statistics/export/excel`}
            download="Bao_cao_so_hoa_OCOP_Bo_NNPTNT.xlsx"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs sm:text-sm transition-all shadow-sm"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            <span>Xuất Excel Chủ thể (Bộ/Sở)</span>
          </a>
          {isAdmin && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Tạo tài khoản Seller</Button>}
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div>
        : profiles.length === 0 ? <EmptyState icon={<Store className="h-9 w-9" />} title="Chưa có người bán" description="Tạo tài khoản Seller đầu tiên để bắt đầu vận hành." />
        : <Card><CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead>Gian hàng</TableHead><TableHead>Tài khoản</TableHead><TableHead>Sản phẩm</TableHead><TableHead>Xác minh</TableHead><TableHead>Hoạt động</TableHead><TableHead className="text-right">Hành động</TableHead></TableRow></TableHeader>
          <TableBody>{profiles.map((profile: SellerProfile) => <TableRow key={profile.id}>
            <TableCell><div className="font-semibold">{profile.name}</div><div className="text-xs text-slate-500">{profile.province?.name ?? 'Chưa cập nhật địa phương'}</div></TableCell>
            <TableCell><div className="text-sm">{profile.owner?.fullName}</div><div className="text-xs text-slate-500">{profile.owner?.email}</div></TableCell>
            <TableCell>{profile.productsCount ?? 0}</TableCell>
            <TableCell>{profile.isVerified ? <Badge variant="success">Đã xác minh</Badge> : <Badge variant="warning">Chờ xác minh</Badge>}</TableCell>
            <TableCell>{profile.owner?.isActive ? <Badge variant="success">Đang hoạt động</Badge> : <Badge variant="default">Đã khóa</Badge>}</TableCell>
            <TableCell><div className="flex justify-end gap-1"><button aria-label="Sửa hồ sơ" onClick={() => setEditing(profile)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Edit className="h-4 w-4" /></button>
              {isAdmin && <button aria-label={profile.owner?.isActive ? 'Khóa Seller' : 'Kích hoạt Seller'} onClick={() => setStatusTarget(profile)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{profile.owner?.isActive ? <LockKeyhole className="h-4 w-4 text-red-500" /> : <RotateCcw className="h-4 w-4 text-emerald-600" />}</button>}
            </div></TableCell>
          </TableRow>)}</TableBody>
        </Table><div className="border-t px-6 py-2"><Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} /></div></CardContent></Card>}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Tạo tài khoản Seller" className="max-w-lg">
        <form onSubmit={accountForm.handleSubmit((values) => createSeller.mutate(values))} className="flex flex-col gap-4">
          <Input label="Họ tên người bán" error={accountForm.formState.errors.fullName?.message} {...accountForm.register('fullName')} />
          <Input label="Email đăng nhập" type="email" error={accountForm.formState.errors.email?.message} {...accountForm.register('email')} />
          <Input label="Số điện thoại" error={accountForm.formState.errors.phone?.message} {...accountForm.register('phone')} />
          <Input label="Mật khẩu ban đầu" type="password" error={accountForm.formState.errors.password?.message} {...accountForm.register('password')} />
          <p className="text-xs text-slate-500">Đây là mật khẩu tạm. Seller bắt buộc đổi mật khẩu ngay lần đăng nhập đầu tiên; mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.</p>
          <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button><Button type="submit" isLoading={createSeller.isPending}>Tạo Seller</Button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title="Cập nhật hồ sơ gian hàng" className="max-w-2xl">
        <form onSubmit={profileForm.handleSubmit((values) => editing && updateProfile.mutate({ id: editing.id, values }))} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2"><Input label="Tên gian hàng" error={profileForm.formState.errors.name?.message} {...profileForm.register('name')} /><Input label="Mã số thuế (nếu có)" error={profileForm.formState.errors.taxCode?.message} {...profileForm.register('taxCode')} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Input label="Số điện thoại liên hệ" error={profileForm.formState.errors.phone?.message} {...profileForm.register('phone')} /><Input label="Email liên hệ" error={profileForm.formState.errors.email?.message} {...profileForm.register('email')} /></div>
          <Input label="Địa chỉ" error={profileForm.formState.errors.address?.message} {...profileForm.register('address')} />
          <div className="grid gap-4 md:grid-cols-2"><Input label="Lĩnh vực" {...profileForm.register('industry')} /><Input label="URL ảnh đại diện" error={profileForm.formState.errors.avatarUrl?.message} {...profileForm.register('avatarUrl')} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold">Tỉnh / Thành phố<select className={`${selectClass} mt-1.5`} {...profileForm.register('provinceId')}><option value="">Chưa chọn</option>{provinces.map((item: Province) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs font-semibold">Xã / Phường<select className={`${selectClass} mt-1.5`} disabled={!provinceId} {...profileForm.register('wardId')}><option value="">Chưa chọn</option>{wards.map((item: Province) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <label className="text-xs font-semibold">Giới thiệu<textarea className="mt-1.5 min-h-28 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900" {...profileForm.register('description')} /></label>
          {isAdmin && <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" {...profileForm.register('isVerified')} /> Hồ sơ đã được Admin xác minh</label>}
          <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Hủy</Button><Button type="submit" isLoading={updateProfile.isPending}>Lưu hồ sơ</Button></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(statusTarget)} onClose={() => setStatusTarget(null)} onConfirm={() => statusTarget && changeStatus.mutate({ sellerId: statusTarget.sellerId, isActive: !statusTarget.owner?.isActive })}
        title={statusTarget?.owner?.isActive ? 'Khóa tài khoản Seller' : 'Kích hoạt tài khoản Seller'}
        description={statusTarget?.owner?.isActive ? 'Seller sẽ không thể đăng nhập hoặc thực hiện nghiệp vụ mới. Dữ liệu truy xuất đã phát sinh vẫn được bảo toàn.' : 'Seller sẽ được phép đăng nhập và tiếp tục vận hành.'}
        type={statusTarget?.owner?.isActive ? 'danger' : 'info'} isLoading={changeStatus.isPending} />
    </div>
  );
}
