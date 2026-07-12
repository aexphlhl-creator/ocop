'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { MessageSquare, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminReviewsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      const res = await api.get('/api/v1/reviews/all');
      return res.data.data;
    },
    enabled: !!user && user.role === 'ADMIN',
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/v1/reviews/${id}`);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Đã xóa đánh giá thành công');
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: () => {
      toast.error('Có lỗi xảy ra khi xóa đánh giá');
    }
  });

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa đánh giá này? Dữ liệu số sao của sản phẩm sẽ được tự động cập nhật lại.')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quản lý Đánh giá</h1>
        <p className="text-sm text-slate-500 mt-1">Quản lý và kiểm duyệt các đánh giá của khách hàng.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        {reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-12 w-12" />}
            title="Chưa có đánh giá nào"
            description="Hệ thống chưa ghi nhận được đánh giá nào từ khách hàng."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 whitespace-nowrap">
                  <th className="pb-3 font-medium">Khách hàng</th>
                  <th className="pb-3 font-medium">Sản phẩm</th>
                  <th className="pb-3 font-medium">Số sao</th>
                  <th className="pb-3 font-medium min-w-[250px]">Nội dung</th>
                  <th className="pb-3 font-medium">Ngày gửi</th>
                  <th className="pb-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reviews.map((review: any) => (
                  <tr key={review.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white">{review.user?.fullName}</span>
                        <span className="text-xs text-slate-500">{review.user?.email}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        {review.product?.images?.[0] && (
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                            <img src={review.product.images[0].imageUrl} alt="Product" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="font-medium text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[200px]">
                          {review.product?.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-900 dark:text-white">{review.rating}</span>
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      </div>
                    </td>
                    <td className="py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-[300px] line-clamp-2">
                        {review.comment}
                      </p>
                    </td>
                    <td className="py-4 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => handleDelete(review.id)}
                        disabled={deleteMutation.isPending}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        title="Xóa đánh giá này"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
