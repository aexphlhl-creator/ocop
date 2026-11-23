'use client';

import { getErrorMessage } from '@/utils/api-error';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Ticket, Plus, Trash2, Power, Search } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Modal } from '../../../../components/ui/modal';

interface Voucher {
  id: string; code: string; discountType: string; discountValue: number | string;
  minOrderValue: number | string; maxDiscount?: number | string | null; usageLimit?: number | null;
  usedCount: number; startDate: string; endDate: string; isActive: boolean; sellerId?: string | null;
  seller?: { fullName: string; sellerProfile?: { displayName: string } | null };
}
interface VoucherPayload {
  code: string; discountType: string; discountValue: number; minOrderValue: number;
  maxDiscount?: number; usageLimit?: number; startDate: string; endDate: string; isActive: boolean;
}
export default function VouchersManagementPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingVoucher, setDeletingVoucher] = useState<{ id: string; code: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [formData, setFormData] = useState({
    code: '',
    discountType: 'FIXED_AMOUNT',
    discountValue: 0,
    minOrderValue: 0,
    maxDiscount: '',
    startDate: '',
    endDate: '',
    usageLimit: '',
  });

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ['vouchers', user?.id],
    queryFn: async () => {
      const res = await api.get<{ data: Voucher[] }>('/api/v1/vouchers');
      return res.data.data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: VoucherPayload) => {
      const res = await api.post('/api/v1/vouchers', data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Tạo mã giảm giá thành công');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      setFormData({
        code: '',
        discountType: 'FIXED_AMOUNT',
        discountValue: 0,
        minOrderValue: 0,
        maxDiscount: '',
        startDate: '',
        endDate: '',
        usageLimit: '',
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Có lỗi xảy ra'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/v1/vouchers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Đã xóa mã giảm giá');
      setDeletingVoucher(null);
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Không thể xóa mã giảm giá'));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/api/v1/vouchers/${id}/toggle`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái');
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Không thể thay đổi trạng thái'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast.error('Vui lòng nhập mã CODE');
      return;
    }

    if (formData.discountValue <= 0) {
      toast.error('Giá trị giảm phải lớn hơn 0');
      return;
    }

    if (formData.discountType === 'PERCENTAGE' && formData.discountValue > 100) {
      toast.error('Mức giảm theo phần trăm không được vượt quá 100%');
      return;
    }

    if (formData.startDate && formData.endDate && new Date(formData.startDate) >= new Date(formData.endDate)) {
      toast.error('Ngày kết thúc phải sau ngày bắt đầu');
      return;
    }

    createMutation.mutate({
      ...formData,
      discountValue: Number(formData.discountValue),
      minOrderValue: Number(formData.minOrderValue),
      maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : undefined,
      usageLimit: formData.usageLimit ? Number(formData.usageLimit) : undefined,
      startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
      endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
      isActive: true,
    });
  };

  const filteredVouchers = vouchers.filter((v) => {
    const matchSearch =
      !searchTerm ||
      v.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.seller?.sellerProfile?.displayName || v.seller?.fullName || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && v.isActive) ||
      (statusFilter === 'INACTIVE' && !v.isActive);

    return matchSearch && matchStatus;
  });

  if (isLoading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mã giảm giá</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.role === 'ADMIN' ? 'Quản lý các mã giảm giá trên toàn sàn.' : 'Tạo mã khuyến mãi riêng cho cửa hàng của bạn.'}
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 font-medium flex items-center gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Tạo mã mới
        </Button>
      </div>

      {vouchers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã hoặc tên shop..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'ACTIVE', label: 'Hoạt động' },
              { id: 'INACTIVE', label: 'Đã khóa' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        {vouchers.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-12 w-12" />}
            title="Chưa có mã giảm giá"
            description="Bạn chưa tạo mã giảm giá nào."
            action={
              <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" /> Tạo mã đầu tiên
              </Button>
            }
          />
        ) : filteredVouchers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Không tìm thấy mã giảm giá nào khớp với điều kiện tìm kiếm.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                  <th className="pb-3 font-medium">Mã code</th>
                  <th className="pb-3 font-medium">Giảm giá</th>
                  <th className="pb-3 font-medium">Phạm vi</th>
                  <th className="pb-3 font-medium">Đã dùng</th>
                  <th className="pb-3 font-medium">Hạn sử dụng</th>
                  <th className="pb-3 font-medium">Trạng thái</th>
                  <th className="pb-3 font-medium text-right pr-2">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredVouchers.map((v) => (
                  <tr key={v.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 font-bold text-emerald-600">{v.code}</td>
                    <td className="py-4">
                      {v.discountType === 'PERCENTAGE' 
                        ? `${v.discountValue}%${v.maxDiscount != null ? ` (Tối đa ${Number(v.maxDiscount).toLocaleString('vi-VN')}đ)` : ''}`
                        : `${Number(v.discountValue).toLocaleString('vi-VN')} đ`
                      }
                      <div className="text-xs text-slate-500">Đơn tối thiểu {Number(v.minOrderValue).toLocaleString('vi-VN')} đ</div>
                    </td>
                    <td className="py-4 text-slate-700 dark:text-slate-300">
                      {v.sellerId ? (v.seller?.sellerProfile?.displayName ?? v.seller?.fullName) : <Badge variant="default" className="bg-blue-100 text-blue-700">Toàn sàn</Badge>}
                    </td>
                    <td className="py-4 text-slate-700 dark:text-slate-300">
                      {v.usedCount} / {v.usageLimit || '∞'}
                    </td>
                    <td className="py-4 text-slate-500 text-xs">
                      {new Date(v.startDate).toLocaleDateString('vi-VN')} - {new Date(v.endDate).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="py-4">
                      {v.isActive ? <Badge variant="success">Hoạt động</Badge> : <Badge variant="error">Đã khóa</Badge>}
                    </td>
                    <td className="py-4 text-right pr-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleMutation.mutate(v.id)}
                          disabled={toggleMutation.isPending}
                          title={v.isActive ? 'Khóa mã này' : 'Kích hoạt mã này'}
                          className={`p-2 rounded-lg transition-colors ${
                            v.isActive
                              ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          }`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingVoucher({ id: v.id, code: v.code })}
                          title="Xóa mã giảm giá"
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tạo mã giảm giá mới">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Mã CODE (Ví dụ: OCOP10K)</label>
            <input 
              type="text" 
              value={formData.code} 
              onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
              placeholder="VD: OCOP20K, CHAOHOI2026..."
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" 
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Loại giảm giá</label>
              <select 
                value={formData.discountType} 
                onChange={e => setFormData({...formData, discountType: e.target.value})}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="FIXED_AMOUNT">Số tiền cố định (VNĐ)</option>
                <option value="PERCENTAGE">Phần trăm (%)</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {formData.discountType === 'PERCENTAGE' ? 'Giá trị giảm (%)' : 'Số tiền giảm (VNĐ)'}
              </label>
              <input 
                type="number" 
                value={formData.discountValue || ''} 
                onChange={e => setFormData({...formData, discountValue: Number(e.target.value)})}
                placeholder={formData.discountType === 'PERCENTAGE' ? '10 (tối đa 100)' : '20000'}
                min={1}
                max={formData.discountType === 'PERCENTAGE' ? 100 : undefined}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Đơn tối thiểu (VNĐ)</label>
              <input 
                type="number" 
                value={formData.minOrderValue || ''} 
                onChange={e => setFormData({...formData, minOrderValue: Number(e.target.value)})}
                placeholder="0"
                min={0}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Giảm tối đa (VNĐ)</label>
              <input 
                type="number" 
                value={formData.maxDiscount} 
                onChange={e => setFormData({...formData, maxDiscount: e.target.value})}
                placeholder={formData.discountType === 'PERCENTAGE' ? '50000' : 'Không áp dụng'}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                disabled={formData.discountType !== 'PERCENTAGE'}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Ngày bắt đầu</label>
              <input 
                type="datetime-local" 
                value={formData.startDate} 
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Ngày kết thúc</label>
              <input 
                type="datetime-local" 
                value={formData.endDate} 
                onChange={e => setFormData({...formData, endDate: e.target.value})}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Giới hạn số lần dùng (Bỏ trống = Vô hạn)</label>
            <input 
              type="number" 
              value={formData.usageLimit} 
              onChange={e => setFormData({...formData, usageLimit: e.target.value})}
              placeholder="VD: 100"
              min={1}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo mã giảm giá'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingVoucher}
        onClose={() => setDeletingVoucher(null)}
        onConfirm={() => deletingVoucher && deleteMutation.mutate(deletingVoucher.id)}
        title="Xóa mã giảm giá"
        description={`Bạn có chắc chắn muốn xóa mã giảm giá "${deletingVoucher?.code}"? Thao tác này sẽ xóa mã khỏi hệ thống.`}
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
