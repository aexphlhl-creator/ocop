'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { Star, MessageSquare, Send } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface ProductReviewsProps {
  productId: string;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({ productId }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['product-reviews', productId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/reviews/product/${productId}`);
      return res.data.data;
    },
  });

  const submitReview = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/reviews', { productId, rating, comment });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Gửi đánh giá thành công!');
      setComment('');
      setRating(5);
      queryClient.invalidateQueries({ queryKey: ['product-reviews', productId] });
      queryClient.invalidateQueries({ queryKey: ['productDetail', productId] }); // Update average rating
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra khi gửi đánh giá');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      toast.error('Vui lòng nhập nội dung đánh giá');
      return;
    }
    submitReview.mutate();
  };

  return (
    <div className="mt-12 bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-10 shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
        <MessageSquare className="h-6 w-6 text-emerald-500" />
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
          Đánh giá sản phẩm ({reviews.length})
        </h2>
      </div>

      {/* Review Form */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-10 bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4">Gửi đánh giá của bạn</h3>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 mr-2">Chất lượng:</span>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  className={`h-6 w-6 ${
                    star <= rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700'
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Sản phẩm này thế nào? Hãy chia sẻ cảm nhận của bạn nhé..."
            className="w-full min-h-[100px] p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y mb-4"
          />
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={submitReview.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 h-10 font-bold flex items-center gap-2 shadow-md"
            >
              <Send className="h-4 w-4" /> {submitReview.isPending ? 'Đang gửi...' : 'Gửi đánh giá'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mb-10 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800 flex items-center justify-between">
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Vui lòng đăng nhập để lại đánh giá của bạn về sản phẩm này.</p>
          <Button variant="outline" onClick={() => window.location.href = '/login'} className="border-amber-200 text-amber-700 hover:bg-amber-100 h-9 px-4 text-xs">
            Đăng nhập
          </Button>
        </div>
      )}

      {/* Reviews List */}
      <div className="flex flex-col gap-6">
        {isLoading ? (
          <div className="text-center text-slate-500 py-8">Đang tải đánh giá...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center text-slate-500 py-8 italic">
            Chưa có đánh giá nào cho sản phẩm này. Hãy là người đầu tiên!
          </div>
        ) : (
          reviews.map((review: any) => (
            <div key={review.id} className="flex gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold shrink-0">
                {review.user?.fullName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{review.user?.fullName}</span>
                  <span className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-3.5 w-3.5 ${
                        star <= review.rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {review.comment}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
