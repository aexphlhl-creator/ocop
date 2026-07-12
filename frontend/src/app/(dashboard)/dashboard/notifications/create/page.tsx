'use client';

import React, { useState } from 'react';
import { api } from '@/services/api';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BellRing, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// removed Textarea import
import { toast } from 'sonner';
import Link from 'next/link';

export default function CreateCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    targetType: 'ALL',
    targetIds: '', // string for comma separated IDs
    isScheduled: false,
    scheduledAt: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.content) {
      toast.error('Vui lòng nhập tiêu đề và nội dung thông báo');
      return;
    }

    if (formData.isScheduled && !formData.scheduledAt) {
      toast.error('Vui lòng chọn thời gian gửi');
      return;
    }

    try {
      setLoading(true);
      
      const payload: any = {
        title: formData.title,
        content: formData.content,
        targetType: formData.targetType,
      };

      if (['SPECIFIC_BUSINESSES', 'SPECIFIC_PROVINCES', 'SPECIFIC_WARDS'].includes(formData.targetType)) {
        if (!formData.targetIds) {
          toast.error('Vui lòng nhập ID đối tượng nhận');
          setLoading(false);
          return;
        }
        payload.targetIds = formData.targetIds.split(',').map(id => id.trim()).filter(Boolean);
      }

      if (formData.isScheduled) {
        payload.scheduledAt = new Date(formData.scheduledAt).toISOString();
      }

      await api.post('/api/v1/notification-campaigns', payload);
      toast.success('Tạo chiến dịch thông báo thành công');
      router.push('/dashboard/notifications');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/notifications">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Tạo Chiến dịch Thông báo</h1>
          <p className="text-slate-500">Tạo và gửi thông báo đến hàng loạt người dùng</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Tiêu đề thông báo <span className="text-red-500">*</span></label>
            <Input 
              placeholder="VD: Cập nhật chính sách OCOP..." 
              value={formData.title} 
              onChange={e => setFormData({ ...formData, title: e.target.value })} 
              required 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nội dung <span className="text-red-500">*</span></label>
            <textarea 
              className="w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:focus-visible:ring-slate-300"
              placeholder="Nhập nội dung chi tiết..." 
              value={formData.content} 
              onChange={e => setFormData({ ...formData, content: e.target.value })}
              rows={5}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Đối tượng nhận <span className="text-red-500">*</span></label>
            <select 
              className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={formData.targetType}
              onChange={e => setFormData({ ...formData, targetType: e.target.value })}
            >
              <option value="ALL">Tất cả người dùng</option>
              <option value="ALL_SELLERS">Tất cả Chủ thể (Sellers)</option>
              <option value="ALL_CUSTOMERS">Tất cả Khách hàng</option>
              <option value="SPECIFIC_BUSINESSES">Chủ thể cụ thể</option>
              <option value="SPECIFIC_PROVINCES">Tỉnh/Thành phố cụ thể</option>
            </select>
          </div>

          {['SPECIFIC_BUSINESSES', 'SPECIFIC_PROVINCES'].includes(formData.targetType) && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                ID Đối tượng <span className="text-slate-400 font-normal">(Phân cách bằng dấu phẩy)</span>
              </label>
              <Input 
                placeholder="Ví dụ: uuid-1, uuid-2..." 
                value={formData.targetIds} 
                onChange={e => setFormData({ ...formData, targetIds: e.target.value })} 
              />
            </div>
          )}

          <div className="border-t pt-6 mt-6">
            <h3 className="font-medium mb-4">Lên lịch gửi</h3>
            <div className="flex items-center gap-3 mb-4">
              <input 
                type="checkbox" 
                id="isScheduled" 
                className="w-4 h-4 accent-emerald-600" 
                checked={formData.isScheduled} 
                onChange={e => setFormData({ ...formData, isScheduled: e.target.checked })} 
              />
              <label htmlFor="isScheduled" className="font-medium cursor-pointer text-sm">Gửi vào thời gian cụ thể (Lên lịch)</label>
            </div>
            
            {formData.isScheduled && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Thời gian gửi</label>
                <Input 
                  type="datetime-local" 
                  value={formData.scheduledAt} 
                  onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })} 
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-slate-500">Hệ thống sẽ tự động gửi thông báo vào thời gian này.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-4 pb-12">
          <Link href="/dashboard/notifications">
            <Button variant="outline" type="button">Hủy</Button>
          </Link>
          <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
            {loading ? <span className="animate-spin mr-2">⏳</span> : (formData.isScheduled ? <Save className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />)}
            {formData.isScheduled ? 'Lên lịch chiến dịch' : 'Gửi ngay'}
          </Button>
        </div>
      </form>
    </div>
  );
}
