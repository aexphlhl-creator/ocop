'use client';

import type { NewsArticle, QueryParams, PaginationMeta } from '@/types/catalog';

import { getErrorMessage } from '@/utils/api-error';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
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
import { Plus, Edit, Trash2, Newspaper, Calendar, Eye, EyeOff, Search } from 'lucide-react';

const newsSchema = z.object({
  title: z.string().min(5, 'Tiêu đề phải dài ít nhất 5 ký tự'),
  content: z.string().min(20, 'Nội dung phải dài ít nhất 20 ký tự'),
  thumbnail: z.string().url('URL ảnh đại diện không hợp lệ').optional().or(z.literal('')),
  status: z.enum(['DRAFT', 'PUBLISHED']),
});

type NewsFormValues = z.infer<typeof newsSchema>;

export default function DashboardNewsPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const limit = 8;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsArticle | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { register, handleSubmit, setValue, control, reset, formState: { errors } } = useForm<NewsFormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: { status: 'DRAFT' },
  });

  const selectedStatus = useWatch({ control, name: 'status' });

  const { data: newsData, isLoading } = useQuery<{ items: NewsArticle[]; meta: PaginationMeta }>({
    queryKey: ['dashboardNews', page, searchTerm, statusFilter],
    queryFn: async () => {
      const params: QueryParams = { page, limit };
      if (searchTerm) params.keyword = searchTerm;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const res = await api.get('/api/v1/news', { params });
      const raw = res.data;
      const rawData = raw?.data;
      const items = Array.isArray(rawData) ? rawData : (rawData?.items || raw?.items || []);
      const meta = raw?.meta || rawData?.meta || {
        totalPages: Math.ceil(items.length / limit) || 1,
        totalItems: items.length,
      };
      return { items, meta };
    },
    enabled: !!user,
  });

  const newsList = newsData?.items || [];
  const totalPages = newsData?.meta?.totalPages || 1;

  const invalidateAllNews = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboardNews'] });
    queryClient.invalidateQueries({ queryKey: ['homeNews'] });
    queryClient.invalidateQueries({ queryKey: ['publicNewsList'] });
    queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    queryClient.invalidateQueries({ queryKey: ['statisticsOverview'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: NewsFormValues) => api.post('/api/v1/news', data),
    onSuccess: () => {
      toast.success('Đăng bài viết thành công!');
      invalidateAllNews();
      setIsFormOpen(false);
      reset();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Không thể tạo bài viết')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: NewsFormValues }) =>
      api.patch(`/api/v1/news/${id}`, data),
    onSuccess: () => {
      toast.success('Cập nhật bài viết thành công!');
      invalidateAllNews();
      setIsFormOpen(false);
      setEditingNews(null);
      reset();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Không thể cập nhật')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/news/${id}`),
    onSuccess: () => {
      toast.success('Đã xóa bài viết');
      invalidateAllNews();
      setDeletingId(null);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Không thể xóa')),
  });

  useEffect(() => {
    if (editingNews) {
      setValue('title', editingNews.title);
      setValue('content', editingNews.content);
      setValue('thumbnail', editingNews.thumbnail || '');
      setValue('status', editingNews.status);
    } else {
      reset();
    }
  }, [editingNews, setValue, reset]);

  const onSubmit = (data: NewsFormValues) => {
    if (editingNews) {
      updateMutation.mutate({ id: editingNews.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getStatusBadge = (status: string) =>
    status === 'PUBLISHED'
      ? <Badge variant="success"><Eye className="h-3 w-3" />Đã đăng</Badge>
      : <Badge variant="default"><EyeOff className="h-3 w-3" />Nháp</Badge>;

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
            Tin tức &amp; Thông báo
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý bài viết, tin tức chính sách và sự kiện OCOP
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            size="md"
            className="flex items-center gap-2 shrink-0"
            onClick={() => { setEditingNews(null); reset(); setIsFormOpen(true); }}
          >
            <Plus className="h-4 w-4" /> Viết bài mới
          </Button>
        )}
      </motion.div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Tìm theo tiêu đề hoặc nội dung..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#16A34A]/20 focus:border-[#16A34A] transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'PUBLISHED', label: 'Đã đăng' },
            { id: 'DRAFT', label: 'Bản nháp' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { if (tab.id === 'ALL' || tab.id === 'PUBLISHED' || tab.id === 'DRAFT') setStatusFilter(tab.id); setPage(1); }}
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

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        {isLoading ? (
          <div className="py-24 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : newsList.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tiêu đề bài viết</TableHead>
                    <TableHead>Tác giả</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    {isAdmin && <TableHead className="text-right">Hành động</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {newsList.map((article: NewsArticle) => (
                    <TableRow key={article.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5 max-w-[320px]">
                          {article.thumbnail ? (
                            <AssetImage
                              src={article.thumbnail}
                              alt=""
                              className="h-9 w-14 rounded-lg object-cover shrink-0 bg-slate-100"
                            />
                          ) : (
                            <div className="flex h-9 w-14 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-300 shrink-0">
                              <Newspaper className="h-4 w-4" />
                            </div>
                          )}
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                            {article.title}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {article.author?.fullName || '—'}
                      </TableCell>
                      <TableCell>{getStatusBadge(article.status)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(article.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Chỉnh sửa"
                              onClick={() => { setEditingNews(article); setIsFormOpen(true); }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              title="Xóa"
                              onClick={() => setDeletingId(article.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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
            icon={<Newspaper className="h-8 w-8" />}
            title={searchTerm || statusFilter !== 'ALL' ? 'Không tìm thấy bài viết phù hợp' : 'Chưa có bài viết nào'}
            description={searchTerm || statusFilter !== 'ALL' ? 'Vui lòng thử lại với từ khóa hoặc trạng thái lọc khác.' : 'Nhấn Viết bài mới để đăng tin tức OCOP đầu tiên.'}
            action={
              searchTerm || statusFilter !== 'ALL' ? (
                <Button variant="outline" size="sm" onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setPage(1); }}>
                  Xóa bộ lọc
                </Button>
              ) : isAdmin ? (
                <Button variant="primary" size="sm" onClick={() => { setEditingNews(null); reset(); setIsFormOpen(true); }}>
                  <Plus className="h-4 w-4" /> Viết bài mới
                </Button>
              ) : undefined
            }
          />
        )}
      </motion.div>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingNews(null); reset(); }}
        title={editingNews ? 'Chỉnh sửa bài viết' : 'Viết bài viết mới'}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Tiêu đề bài viết"
            placeholder="Hội chợ OCOP tỉnh Lâm Đồng năm 2025..."
            error={errors.title?.message}
            {...register('title')}
          />
          <Input
            label="URL ảnh đại diện (tùy chọn)"
            placeholder="https://example.com/thumbnail.jpg"
            error={errors.thumbnail?.message}
            {...register('thumbnail')}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nội dung bài viết</label>
            <textarea
              {...register('content')}
              rows={7}
              placeholder="Nội dung chi tiết bài viết, thông báo chính sách OCOP..."
              className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
            />
            {errors.content && <span className="text-xs text-red-500 font-medium">{errors.content.message}</span>}
          </div>

          {/* Status toggle */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Trạng thái xuất bản</label>
            <input type="hidden" {...register('status')} />
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'DRAFT', label: 'Lưu nháp', icon: EyeOff, desc: 'Chưa hiển thị công khai' },
                { value: 'PUBLISHED', label: 'Đăng ngay', icon: Eye, desc: 'Hiển thị trên trang tin tức' },
              ].map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('status', value as 'DRAFT' | 'PUBLISHED')}
                  className={`flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 text-left transition-all duration-150 ${
                    selectedStatus === value
                      ? 'border-[#16A34A] bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${selectedStatus === value ? 'bg-[#16A34A] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className={`text-xs font-bold ${selectedStatus === value ? 'text-[#16A34A]' : 'text-slate-700 dark:text-slate-300'}`}>{label}</span>
                  <span className="text-[10px] text-slate-400 leading-snug">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => { setIsFormOpen(false); setEditingNews(null); reset(); }}>Hủy</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createMutation.isPending || updateMutation.isPending}>
              {selectedStatus === 'PUBLISHED' ? 'Đăng bài' : 'Lưu nháp'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="Xóa bài viết"
        description="Bạn có chắc chắn muốn xóa bài viết này? Thao tác này không thể hoàn tác."
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
