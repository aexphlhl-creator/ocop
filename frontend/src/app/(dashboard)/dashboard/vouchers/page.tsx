'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Ticket, Plus } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { toast } from 'sonner';
import { Modal } from '../../../../components/ui/modal';

export default function VouchersManagementPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    queryKey: ['vouchers'],
    queryFn: async () => {
      const res = await api.get('/api/v1/vouchers');
      return res.data.data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/api/v1/vouchers', data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Tạo mã giảm giá thành công');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      // Reset form
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

  if (isLoading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mã giảm giá</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.role === 'ADMIN' ? 'Quản lý các mã giảm giá trên toàn sàn.' : 'Tạo mã khuyến mãi riêng cho cửa hàng của bạn.'}
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tạo mã mới
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        {vouchers.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-12 w-12" />}
            title="Chưa có mã giảm giá"
            description="Bạn chưa tạo mã giảm giá nào."
          />
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vouchers.map((v: any) => (
                  <tr key={v.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 font-bold text-emerald-600">{v.code}</td>
                    <td className="py-4">
                      {v.discountType === 'PERCENTAGE' 
                        ? `${v.discountValue}% (Tối đa ${Number(v.maxDiscount).toLocaleString('vi-VN')}đ)`
                        : `${Number(v.discountValue).toLocaleString('vi-VN')} đ`
                      }
                      <div className="text-xs text-slate-500">Đơn tối thiểu {Number(v.minOrderValue).toLocaleString('vi-VN')} đ</div>
                    </td>
                    <td className="py-4 text-slate-700 dark:text-slate-300">
                      {v.businessId ? v.business?.name : <Badge variant="default" className="bg-blue-100 text-blue-700">Toàn sàn</Badge>}
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
                <option value="FIXED_AMOUNT">Số tiền cố định</option>
                <option value="PERCENTAGE">Phần trăm (%)</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Giá trị giảm</label>
              <input 
                type="number" 
                value={formData.discountValue}
                onChange={e => setFormData({...formData, discountValue: Number(e.target.value)})}
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
                value={formData.minOrderValue}
                onChange={e => setFormData({...formData, minOrderValue: Number(e.target.value)})}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Giảm tối đa (Nếu là %)</label>
              <input 
                type="number" 
                value={formData.maxDiscount}
                onChange={e => setFormData({...formData, maxDiscount: e.target.value})}
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
    </div>
  );
}
