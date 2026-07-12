'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { api } from '../../../../services/api';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Card, CardContent } from '../../../../components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { Pagination } from '../../../../components/ui/pagination';
import { Modal } from '../../../../components/ui/modal';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Store, MapPin, Phone, Mail, Building2 } from 'lucide-react';

const businessSchema = z.object({
  name: z.string().min(2, 'Tên chủ thể phải dài ít nhất 2 ký tự'),
  taxCode: z.string().min(10, 'Mã số thuế không hợp lệ'),
  address: z.string().min(5, 'Địa chỉ phải dài ít nhất 5 ký tự'),
  phone: z.string().min(10, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  provinceId: z.string().uuid('Vui lòng chọn tỉnh thành'),
  wardId: z.string().uuid('Vui lòng chọn xã phường'),
  latitude: z.number(),
  longitude: z.number(),
  industry: z.string().optional().or(z.literal('')),
  avatarUrl: z.string().url('Đường dẫn ảnh không hợp lệ').optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

const selectCls = 'h-11 w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 px-3.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all disabled:opacity-50 cursor-pointer';

export default function DashboardBusinessesPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const limit = 8;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: { latitude: 16, longitude: 108 },
  });

  const watchedProvinceId = watch('provinceId');

  const { data: businessesData, isLoading } = useQuery({
    queryKey: ['dashboardBusinesses', page],
    queryFn: async () => {
      const res = await api.get('/api/v1/businesses', { 
        params: { page, limit, ownerId: isAdmin ? undefined : user?.id } 
      });
      return res.data;
    },
    enabled: !!user,
  });

  const businessesList = businessesData?.data || [];
  const totalPages = businessesData?.meta?.totalPages || 1;

  const { data: provinces = [] } = useQuery({
    queryKey: ['dashboardProvinces'],
    queryFn: async () => {
      const res = await api.get('/api/v1/provinces');
      return res.data.data || [];
    },
  });

  const { data: wards = [] } = useQuery({
    queryKey: ['dashboardWards', watchedProvinceId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/wards?limit=100&provinceId=${watchedProvinceId}`);
      return res.data.data?.items || [];
    },
    enabled: !!watchedProvinceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: BusinessFormValues) => api.post('/api/v1/businesses', data),
    onSuccess: () => {
      toast.success('Thêm mới chủ thể thành công!');
      queryClient.invalidateQueries({ queryKey: ['dashboardBusinesses'] });
      setIsFormOpen(false);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể tạo chủ thể'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: BusinessFormValues }) =>
      api.patch(`/api/v1/businesses/${id}`, data),
    onSuccess: () => {
      toast.success('Cập nhật thành công!');
      queryClient.invalidateQueries({ queryKey: ['dashboardBusinesses'] });
      setIsFormOpen(false);
      setEditingBusiness(null);
      reset();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể cập nhật'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/businesses/${id}`),
    onSuccess: () => {
      toast.success('Đã xóa chủ thể');
      queryClient.invalidateQueries({ queryKey: ['dashboardBusinesses'] });
      setDeletingId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể xóa'),
  });

  React.useEffect(() => {
    if (editingBusiness) {
      setValue('name', editingBusiness.name);
      setValue('taxCode', editingBusiness.taxCode);
      setValue('address', editingBusiness.address);
      setValue('phone', editingBusiness.phone || '');
      setValue('email', editingBusiness.email || '');
      setValue('provinceId', editingBusiness.provinceId);
      setValue('wardId', editingBusiness.wardId);
      setValue('latitude', editingBusiness.latitude ?? 16);
      setValue('longitude', editingBusiness.longitude ?? 108);
      setValue('industry', editingBusiness.industry || '');
      setValue('avatarUrl', editingBusiness.avatarUrl || '');
      setValue('description', editingBusiness.description || '');
    } else {
      reset();
    }
  }, [editingBusiness, setValue, reset]);

  const onSubmit = (data: BusinessFormValues) => {
    if (editingBusiness) {
      updateMutation.mutate({ id: editingBusiness.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Chủ thể sản xuất OCOP
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý các hợp tác xã, doanh nghiệp và hộ kinh doanh OCOP
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            size="md"
            className="flex items-center gap-2 shrink-0"
            onClick={() => { setEditingBusiness(null); reset(); setIsFormOpen(true); }}
          >
            <Plus className="h-4 w-4" /> Thêm chủ thể
          </Button>
        )}
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        {isLoading ? (
          <div className="py-24 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : businessesList.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên chủ thể</TableHead>
                    <TableHead>Mã số thuế</TableHead>
                    <TableHead>Liên hệ</TableHead>
                    <TableHead>Địa phương</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    {(isAdmin || user?.role === 'SELLER') && <TableHead className="text-right">Hành động</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businessesList.map((biz: any) => (
                    <TableRow key={biz.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 shrink-0">
                            <Store className="h-4 w-4" />
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 max-w-[180px] truncate">
                            {biz.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{biz.taxCode}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs text-slate-500">
                          {biz.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{biz.phone}</span>}
                          {biz.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{biz.email}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {biz.province?.name || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {biz.isVerified
                          ? <Badge variant="success">Đã xác minh</Badge>
                          : <Badge variant="warning">Chờ xác minh</Badge>
                        }
                      </TableCell>
                      {(isAdmin || user?.role === 'SELLER') && (
                        <TableCell>
                          {(isAdmin || biz.owner?.id === user?.id) && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                title="Chỉnh sửa"
                                onClick={() => { setEditingBusiness(biz); setIsFormOpen(true); }}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                title="Xóa"
                                onClick={() => setDeletingId(biz.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-6 py-2 border-t border-slate-100 dark:border-slate-800">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title="Chưa có chủ thể nào"
            description="Bạn chưa được gán hoặc chưa có chủ thể nào."
            action={isAdmin ? (
              <Button variant="primary" size="sm" onClick={() => { setEditingBusiness(null); reset(); setIsFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Thêm chủ thể
              </Button>
            ) : undefined}
          />
        )}
      </motion.div>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingBusiness(null); reset(); }}
        title={editingBusiness ? 'Cập nhật thông tin chủ thể' : 'Thêm mới chủ thể OCOP'}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Tên chủ thể / Doanh nghiệp" placeholder="HTX Nông sản Lâm Đồng" error={errors.name?.message} {...register('name')} />
            <Input label="Mã số thuế" placeholder="0123456789" error={errors.taxCode?.message} {...register('taxCode')} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Số điện thoại" placeholder="0987654321" error={errors.phone?.message} {...register('phone')} />
            <Input label="Email liên hệ" type="email" placeholder="info@htx.vn" error={errors.email?.message} {...register('email')} />
          </div>
          <Input label="Địa chỉ chi tiết" placeholder="123 Đường ABC, Phường XYZ" error={errors.address?.message} {...register('address')} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Lĩnh vực kinh doanh" placeholder="Trồng trọt, Chế biến..." error={errors.industry?.message} {...register('industry')} />
            <Input label="URL Ảnh đại diện" placeholder="https://..." error={errors.avatarUrl?.message} {...register('avatarUrl')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bài giới thiệu</label>
            <textarea
              {...register('description')}
              className="w-full min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-y"
              placeholder="Nhập thông tin giới thiệu về HTX / Doanh nghiệp..."
            />
            {errors.description && <span className="text-xs text-red-500 font-medium">{errors.description.message}</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tỉnh / Thành phố</label>
              <select {...register('provinceId')} className={selectCls}>
                <option value="">-- Chọn tỉnh/thành --</option>
                {provinces.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.provinceId && <span className="text-xs text-red-500 font-medium">{errors.provinceId.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Xã / Phường</label>
              <select {...register('wardId')} disabled={!watchedProvinceId} className={selectCls}>
                <option value="">-- Chọn xã/phường --</option>
                {wards.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {errors.wardId && <span className="text-xs text-red-500 font-medium">{errors.wardId.message}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Vĩ độ (Latitude)" type="number" step="0.0001" placeholder="11.9404" error={errors.latitude?.message} {...register('latitude', { valueAsNumber: true })} />
            <Input label="Kinh độ (Longitude)" type="number" step="0.0001" placeholder="108.4583" error={errors.longitude?.message} {...register('longitude', { valueAsNumber: true })} />
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => { setIsFormOpen(false); setEditingBusiness(null); reset(); }}>Hủy</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createMutation.isPending || updateMutation.isPending}>
              Lưu chủ thể
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="Xóa chủ thể"
        description="Bạn có chắc chắn muốn xóa chủ thể này? Thao tác sẽ ảnh hưởng đến các sản phẩm liên kết."
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
