'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Star, CheckCircle, XCircle, Clock, Link as LinkIcon } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import { toast } from 'sonner';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';

export default function UpgradesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminComment, setAdminComment] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['upgrades', isAdmin ? 'admin' : 'seller'],
    queryFn: async () => {
      const endpoint = isAdmin ? '/api/v1/upgrades/admin' : '/api/v1/upgrades/seller';
      const res = await api.get(endpoint);
      return res.data.data;
    },
    enabled: !!user,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, comment }: { id: string, status: string, comment?: string }) => {
      const res = await api.patch(`/api/v1/upgrades/${id}/status`, { status, adminComment: comment });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Cập nhật trạng thái thành công!');
      queryClient.invalidateQueries({ queryKey: ['upgrades'] });
      setSelectedRequest(null);
    },
    onError: () => {
      toast.error('Có lỗi xảy ra khi cập nhật!');
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="default" className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1"/> Đang chờ duyệt</Badge>;
      case 'APPROVED': return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1"/> Đã phê duyệt</Badge>;
      case 'REJECTED': return <Badge variant="error"><XCircle className="w-3 h-3 mr-1"/> Đã từ chối</Badge>;
      default: return <Badge variant="default">{status}</Badge>;
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quản lý nâng hạng sao OCOP</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAdmin ? 'Phê duyệt các hồ sơ xin nâng sao từ Chủ thể.' : 'Theo dõi trạng thái các hồ sơ xin nâng sao của bạn.'}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        {requests.length === 0 ? (
          <EmptyState
            icon={<Star className="h-12 w-12 text-yellow-500" />}
            title="Chưa có yêu cầu nào"
            description={isAdmin ? "Hiện không có hồ sơ nào chờ duyệt." : "Bạn chưa gửi yêu cầu nâng sao nào."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                  <th className="pb-3 font-medium">Sản phẩm</th>
                  {isAdmin && <th className="pb-3 font-medium">Chủ thể</th>}
                  <th className="pb-3 font-medium">Sao hiện tại</th>
                  <th className="pb-3 font-medium">Sao mục tiêu</th>
                  <th className="pb-3 font-medium">Ngày nộp</th>
                  <th className="pb-3 font-medium">Trạng thái</th>
                  <th className="pb-3 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((req: any) => (
                  <tr key={req.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 font-medium text-slate-900 dark:text-white max-w-[200px] truncate">
                      {req.product.name}
                    </td>
                    {isAdmin && (
                      <td className="py-4 text-slate-600 dark:text-slate-400">
                        {req.business?.name}
                      </td>
                    )}
                    <td className="py-4 font-bold text-yellow-600">
                      {req.currentLevel.title}
                    </td>
                    <td className="py-4 font-bold text-emerald-600">
                      {req.targetLevel.title}
                    </td>
                    <td className="py-4 text-slate-500">
                      {new Date(req.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="py-4">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="py-4">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedRequest(req); setAdminComment(req.adminComment || ''); }}>
                        Chi tiết
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={!!selectedRequest} onClose={() => setSelectedRequest(null)} title="Chi tiết Hồ sơ nâng hạng sao">
        {selectedRequest && (
          <div className="flex flex-col gap-6 mt-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Sao hiện tại</span>
                <p className="text-xl font-bold text-yellow-600 mt-1">{selectedRequest.currentLevel.title}</p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <span className="text-xs text-emerald-600 uppercase tracking-wider font-bold">Sao mục tiêu</span>
                <p className="text-xl font-bold text-emerald-600 mt-1">{selectedRequest.targetLevel.title}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white border-b pb-2">Lý do nâng hạng</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">{selectedRequest.reason || 'Không có lý do cụ thể.'}</p>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white border-b pb-2">Tài liệu chứng minh</h4>
              {selectedRequest.documentUrls && selectedRequest.documentUrls.length > 0 ? (
                <ul className="flex flex-col gap-2 mt-2">
                  {selectedRequest.documentUrls.map((url: string, i: number) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                        <LinkIcon className="w-4 h-4" /> {url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Không có tài liệu đính kèm.</p>
              )}
            </div>

            {selectedRequest.status !== 'PENDING' && selectedRequest.adminComment && (
              <div className="flex flex-col gap-2 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800">
                <h4 className="font-bold text-amber-900 dark:text-amber-100">Nhận xét của Admin</h4>
                <p className="text-sm text-amber-700 dark:text-amber-200">{selectedRequest.adminComment}</p>
              </div>
            )}

            {isAdmin && selectedRequest.status === 'PENDING' && (
              <div className="flex flex-col gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-white">Quyết định phê duyệt</h4>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Nhận xét / Phản hồi (Bắt buộc nếu Từ chối)</label>
                  <textarea 
                    className="w-full min-h-[80px] p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    placeholder="Nhập lý do phê duyệt hoặc từ chối..."
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3 mt-2">
                  <Button 
                    variant="outline"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                    onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: 'REJECTED', comment: adminComment })}
                    disabled={updateStatusMutation.isPending || !adminComment}
                  >
                    Từ chối
                  </Button>
                  <Button 
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: 'APPROVED', comment: adminComment })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Phê duyệt Nâng Sao
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
