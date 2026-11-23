'use client';

import { getErrorMessage } from '@/utils/api-error';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiResponse } from '@/types/catalog';
import { api } from '@/services/api';
import { 
  BellRing, Plus, Search, CheckCircle2, Clock, 
  XCircle, Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import Link from 'next/link';

interface Campaign {
  id: string; title: string; message: string; targetAudience: string;
  status: string; scheduledAt: string | null; sentCount: number;
  totalRecipients: number; createdBy?: { fullName: string };
}

export default function NotificationCampaignsPage() {
  const { user } = useAuthStore();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filter, setFilter] = useState({ search: '', status: '', page: 1, limit: 10 });
  const { data, isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['notificationCampaigns', user?.id, filter],
    queryFn: async () => (await api.get<ApiResponse<Campaign[]>>('/api/v1/notification-campaigns', {
      params: { ...filter, status: filter.status || undefined },
    })).data,
    enabled: !!user,
  });
  const campaigns = data?.data ?? [];
  const meta = data?.meta;

  const handleCancelCampaign = async (id: string, title: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy chiến dịch "${title}"?`)) return;
    try {
      setCancellingId(id);
      await api.patch(`/api/v1/notification-campaigns/${id}/cancel`);
      toast.success('Đã hủy chiến dịch thành công');
      await refetch();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Không thể hủy chiến dịch'));
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-slate-100 text-slate-700';
      case 'SCHEDULED': return 'bg-blue-100 text-blue-700';
      case 'SENDING': return 'bg-orange-100 text-orange-700';
      case 'COMPLETED': return 'bg-emerald-100 text-emerald-700';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'Bản nháp';
      case 'SCHEDULED': return 'Đã lên lịch';
      case 'SENDING': return 'Đang gửi';
      case 'COMPLETED': return 'Hoàn thành';
      case 'CANCELLED': return 'Đã hủy';
      case 'FAILED': return 'Lỗi';
      default: return status;
    }
  };

  const getTargetTypeColor = (type: string) => {
    switch (type) {
      case 'ALL': return 'bg-purple-100 text-purple-700';
      case 'SELLERS': return 'bg-blue-100 text-blue-700';
      case 'CUSTOMERS': return 'bg-emerald-100 text-emerald-700';
      case 'SPECIFIC_SELLERS': return 'bg-orange-100 text-orange-700';
      case 'PROVINCES': return 'bg-cyan-100 text-cyan-700';
      case 'WARDS': return 'bg-teal-100 text-teal-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {isError && <p role="alert" className="text-red-600">Không tải được chiến dịch. Vui lòng thử lại.</p>}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <BellRing className="w-6 h-6 text-emerald-600" />
            Chiến dịch Thông báo
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Quản lý và theo dõi các chiến dịch gửi thông báo đến người dùng
          </p>
        </div>
        <Link href="/dashboard/notifications/create">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-lg shadow-emerald-600/20">
            <Plus className="w-4 h-4" /> Tạo Chiến dịch mới
          </Button>
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Input 
            placeholder="Tìm kiếm theo tiêu đề, nội dung..." 
            className="pl-10"
            value={filter.search}
            onChange={(e) => setFilter(f => ({ ...f, search: e.target.value, page: 1 }))}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select 
            className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={filter.status}
            onChange={(e) => setFilter(f => ({ ...f, status: e.target.value, page: 1 }))}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="SCHEDULED">Đã lên lịch</option>
            <option value="SENDING">Đang gửi</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="FAILED">Thất bại</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : safeCampaigns.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <BellRing className="w-12 h-12 mx-auto text-slate-300" />
            <p className="font-medium text-slate-600 dark:text-slate-300">Không tìm thấy chiến dịch nào.</p>
            <p className="text-xs text-slate-400">Bạn có thể tạo thông báo mới để gửi tức thì hoặc lên lịch tự động.</p>
            <Link href="/dashboard/notifications/create" className="inline-block mt-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="w-3.5 h-3.5" /> Tạo chiến dịch mới
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 font-medium">Chiến dịch</th>
                  <th className="px-6 py-4 font-medium">Đối tượng</th>
                  <th className="px-6 py-4 font-medium">Trạng thái</th>
                  <th className="px-6 py-4 font-medium">Thời gian gửi</th>
                  <th className="px-6 py-4 font-medium">Tiến độ</th>
                  <th className="px-6 py-4 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {safeCampaigns.map((camp) => {
                  const total = camp.totalRecipients || 0;
                  const sent = camp.sentCount || 0;
                  const percent = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
                  const isScheduled = camp.status === 'SCHEDULED';

                  return (
                    <tr key={camp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800 dark:text-white">{camp.title}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[280px] mt-1">{camp.message}</p>
                        {camp.createdBy?.fullName && (
                          <p className="text-[11px] text-slate-400 mt-1">Tạo bởi: {camp.createdBy.fullName}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${getTargetTypeColor(camp.targetAudience)}`}>
                          {camp.targetAudience}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(camp.status)} border-current/20 flex items-center w-fit gap-1.5`}>
                          {camp.status === 'COMPLETED' ? <CheckCircle2 className="w-3 h-3" /> : null}
                          {camp.status === 'SCHEDULED' ? <Clock className="w-3 h-3" /> : null}
                          {camp.status === 'CANCELLED' || camp.status === 'FAILED' ? <XCircle className="w-3 h-3" /> : null}
                          {getStatusText(camp.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {camp.scheduledAt && !isNaN(new Date(camp.scheduledAt).getTime())
                          ? new Date(camp.scheduledAt).toLocaleString('vi-VN')
                          : 'Gửi ngay'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-200 rounded-full h-2 max-w-[100px] overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">{sent}/{total}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isScheduled && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={cancellingId === camp.id}
                            onClick={() => handleCancelCampaign(camp.id, camp.title)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 text-xs h-8 gap-1"
                            title="Hủy chiến dịch đã lên lịch"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            {cancellingId === camp.id ? 'Đang hủy...' : 'Hủy'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500">
            Hiển thị trang {meta.page} / {meta.totalPages} ({meta.total} chiến dịch)
          </span>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={filter.page <= 1}
              onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}
            >
              Trang trước
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={filter.page >= meta.totalPages}
              onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
