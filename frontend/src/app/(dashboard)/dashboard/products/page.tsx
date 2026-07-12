'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Plus, Edit, Trash2, Check, X, ShoppingBag, Star } from 'lucide-react';

// ─── Schema giữ nguyên 100% ──────────────────────────────────────────────────
const productSchema = z.object({
  name: z.string().min(2, 'Tên sản phẩm phải dài ít nhất 2 ký tự'),
  description: z.string().min(10, 'Mô tả chi tiết sản phẩm phải dài ít nhất 10 ký tự'),
  price: z.number().min(0, 'Giá bán phải lớn hơn hoặc bằng 0'),
  unit: z.string().min(1, 'Đơn vị tính không được trống'),
  ocopLevelId: z.string().uuid('Vui lòng chọn xếp hạng sao hợp lệ'),
  categoryId: z.string().uuid('Vui lòng chọn ngành hàng hợp lệ'),
  businessId: z.string().uuid('Vui lòng chọn chủ thể sản xuất hợp lệ'),
  provinceId: z.string().uuid('Vui lòng chọn tỉnh thành hợp lệ'),
  wardId: z.string().uuid('Vui lòng chọn xã phường hợp lệ'),
  latitude: z.number(),
  longitude: z.number(),
  videoUrl: z.string().optional().or(z.literal('')),
  imageUrls: z.array(z.string().url('Đường dẫn ảnh không hợp lệ').or(z.literal(''))).max(10, 'Tối đa 10 ảnh').optional(),
  originProcess: z.string().optional(),
  farmingProcess: z.string().optional(),
  harvestProcess: z.string().optional(),
  packagingProcess: z.string().optional(),
  certificateNumber: z.string().optional(),
  harvestDate: z.string().optional().or(z.literal('')),
});

type ProductFormValues = z.infer<typeof productSchema>;

// Shared select class
const selectCls = 'h-11 w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 px-3.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all disabled:opacity-50 cursor-pointer';

export default function ProductsCrudPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const limit = 8;

  // ─── Modal state ─────────────────────────────────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [approvingProduct, setApprovingProduct] = useState<any>(null);
  const [rejectingProduct, setRejectingProduct] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  
  // ─── Upgrade State ───────────────────────────────────────────────────────
  const [upgradingProduct, setUpgradingProduct] = useState<any>(null);
  const [upgradeTargetId, setUpgradeTargetId] = useState('');
  const [upgradeReason, setUpgradeReason] = useState('');
  const [upgradeDocUrls, setUpgradeDocUrls] = useState<string[]>(['']);

  // ─── Form ────────────────────────────────────────────────────────────────
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { latitude: 16, longitude: 108, imageUrls: [] },
  });

  const { fields: imageFields, append: appendImage, remove: removeImage } = useFieldArray({
    control: control as any,
    name: 'imageUrls' as any,
  });

  const watchedProvinceId = watch('provinceId');

  // ─── Queries giữ nguyên 100% ─────────────────────────────────────────────
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['crudProductsList', isAdmin, page],
    queryFn: async () => {
      const url = isAdmin ? '/api/v1/products' : '/api/v1/products/my';
      const params = { page, limit };
      const res = await api.get(url, { params });
      return res.data;
    },
    enabled: !!user,
  });

  const productsList = productsData?.data || [];
  const totalPages = productsData?.meta?.totalPages || 1;

  const { data: provinces = [] } = useQuery({
    queryKey: ['crudProvinces'],
    queryFn: async () => {
      const res = await api.get('/api/v1/provinces');
      return res.data.data || [];
    },
  });

  const { data: wards = [] } = useQuery({
    queryKey: ['crudWards', watchedProvinceId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/wards?limit=100&provinceId=${watchedProvinceId}`);
      return res.data.data || [];
    },
    enabled: !!watchedProvinceId,
  });

  const { data: metadataProducts = [] } = useQuery({
    queryKey: ['crudMetadataExtraction'],
    queryFn: async () => {
      const res = await api.get('/api/v1/products?limit=100');
      return res.data.data || [];
    },
  });

  const categories = Array.from(new Map(metadataProducts.map((p: any) => [p.category?.id, p.category])).values()).filter(Boolean);
  const ocopLevels = Array.from(new Map(metadataProducts.map((p: any) => [p.ocopLevel?.id, p.ocopLevel])).values()).filter(Boolean);

  const { data: businesses = [] } = useQuery({
    queryKey: ['crudBusinessesList', isAdmin, user?.id],
    queryFn: async () => {
      const url = isAdmin ? '/api/v1/businesses?limit=100' : `/api/v1/businesses?limit=100&ownerId=${user?.id}`;
      const res = await api.get(url);
      return res.data.data || [];
    },
    enabled: !!user,
  });

  // ─── Mutations giữ nguyên 100% ───────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: ProductFormValues) => api.post('/api/v1/products', data),
    onSuccess: () => {
      toast.success('Thêm mới sản phẩm thành công!');
      queryClient.invalidateQueries({ queryKey: ['crudProductsList'] });
      setIsFormOpen(false);
      reset();
    },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Không thể tạo sản phẩm'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductFormValues }) => api.patch(`/api/v1/products/${id}`, data),
    onSuccess: () => {
      toast.success('Cập nhật sản phẩm thành công!');
      queryClient.invalidateQueries({ queryKey: ['crudProductsList'] });
      setIsFormOpen(false);
      setEditingProduct(null);
      reset();
    },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Không thể cập nhật sản phẩm'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => {
      toast.success('Đã xóa sản phẩm thành công');
      queryClient.invalidateQueries({ queryKey: ['crudProductsList'] });
      setDeletingProductId(null);
    },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Không thể xóa sản phẩm'); },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, status, rejectReason }: { id: string; status: 'APPROVED' | 'REJECTED'; rejectReason?: string }) =>
      api.patch(`/api/v1/products/${id}/approve`, { status, rejectReason }),
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái phê duyệt sản phẩm');
      queryClient.invalidateQueries({ queryKey: ['crudProductsList'] });
      setApprovingProduct(null);
      setRejectingProduct(null);
      setRejectReason('');
    },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Không thể duyệt sản phẩm'); },
  });

  const upgradeMutation = useMutation({
    mutationFn: (data: { productId: string, targetLevelId: string, reason: string, documentUrls: string[] }) =>
      api.post('/api/v1/upgrades', data),
    onSuccess: () => {
      toast.success('Gửi hồ sơ xin nâng hạng sao thành công!');
      setUpgradingProduct(null);
      setUpgradeTargetId('');
      setUpgradeReason('');
      setUpgradeDocUrls(['']);
    },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Có lỗi xảy ra'); },
  });

  const watchedBusinessId = watch('businessId');

  useEffect(() => {
    if (editingProduct) {
      setValue('name', editingProduct.name);
      setValue('description', editingProduct.description);
      setValue('price', Number(editingProduct.price));
      setValue('unit', editingProduct.unit);
      setValue('ocopLevelId', editingProduct.ocopLevelId);
      setValue('categoryId', editingProduct.categoryId);
      setValue('businessId', editingProduct.businessId);
      setValue('provinceId', editingProduct.provinceId);
      setValue('wardId', editingProduct.wardId);
      setValue('latitude', editingProduct.latitude);
      setValue('longitude', editingProduct.longitude);
      setValue('videoUrl', editingProduct.videoUrl || '');
      
      
      const images = editingProduct.images?.map((img: any) => img.imageUrl) || [];
      setValue('imageUrls', images);
      
      setValue('originProcess', editingProduct.originProcess || '');
      setValue('farmingProcess', editingProduct.farmingProcess || '');
      setValue('harvestProcess', editingProduct.harvestProcess || '');
      setValue('packagingProcess', editingProduct.packagingProcess || '');
      setValue('certificateNumber', editingProduct.certificateNumber || '');
      setValue('harvestDate', editingProduct.harvestDate ? new Date(editingProduct.harvestDate).toISOString().split('T')[0] : '');
    } else {
      // Khôi phục mặc định nếu form đóng mở (hoặc tạo mới)
      // Không reset provinceId, wardId ở đây nếu nó bị đè bởi effect dưới
    }
  }, [editingProduct, setValue]);

  // Tự động điền Tỉnh/Xã theo Chủ thể được chọn
  useEffect(() => {
    if (watchedBusinessId && !editingProduct) {
      const selectedBiz = businesses.find((b: any) => b.id === watchedBusinessId);
      if (selectedBiz) {
        if (selectedBiz.province?.id) setValue('provinceId', selectedBiz.province.id);
        if (selectedBiz.ward?.id) setValue('wardId', selectedBiz.ward.id);
      }
    }
  }, [watchedBusinessId, businesses, editingProduct, setValue]);

  const handleOpenCreate = () => { setEditingProduct(null); reset({ latitude: 16, longitude: 108, imageUrls: [] }); setIsFormOpen(true); };
  const handleOpenEdit = (product: any) => { setEditingProduct(product); setIsFormOpen(true); };
  const onSubmit = (data: ProductFormValues) => {
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'APPROVED') return <Badge variant="success">Đã duyệt</Badge>;
    if (status === 'PENDING')  return <Badge variant="warning">Chờ duyệt</Badge>;
    return <Badge variant="error">Từ chối</Badge>;
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
            {isAdmin ? 'Kiểm duyệt sản phẩm OCOP' : 'Quản lý sản phẩm của tôi'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Đăng ký mới, sửa đổi thông tin và theo dõi tình trạng hồ sơ
          </p>
        </div>
        <div>
          <Button variant="primary" size="md" className="flex items-center gap-2 shrink-0" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" /> {isAdmin ? 'Tạo sản phẩm mới' : 'Đăng ký sản phẩm'}
          </Button>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        {isLoading ? (
          <div className="py-24 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : productsList.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên sản phẩm</TableHead>
                    <TableHead>Giá bán</TableHead>
                    <TableHead>Đơn vị</TableHead>
                    <TableHead>Chủ thể</TableHead>
                    <TableHead>Phân hạng</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsList.map((product: any) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100 max-w-[180px] truncate">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-[#16A34A] dark:text-emerald-400 font-bold">
                        {Number(product.price).toLocaleString('vi-VN')}đ
                      </TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className="text-xs text-slate-500 dark:text-slate-400 max-w-[120px] truncate">
                        {product.business?.name}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 font-bold rounded-full text-xs">
                          {product.ocopLevel?.level} ★
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && product.status === 'PENDING' && (
                            <>
                              <button
                                title="Phê duyệt"
                                onClick={() => setApprovingProduct(product)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                title="Từ chối"
                                onClick={() => setRejectingProduct(product)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          
                          {!isAdmin && product.status === 'APPROVED' && (
                            <button
                              title="Nâng hạng sao"
                              onClick={() => setUpgradingProduct(product)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/20 transition-colors"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          )}
                          
                          <button
                            title="Chỉnh sửa"
                            onClick={() => handleOpenEdit(product)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            title="Xóa"
                            onClick={() => setDeletingProductId(product.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
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
            icon={<ShoppingBag className="h-8 w-8" />}
            title="Không có sản phẩm nào đăng ký"
            description="Nhấp nút Đăng ký sản phẩm để bắt đầu thêm mới sản phẩm OCOP."
            action={<Button variant="primary" size="sm" onClick={handleOpenCreate}><Plus className="h-4 w-4" /> {isAdmin ? 'Tạo sản phẩm mới' : 'Đăng ký sản phẩm'}</Button>}
          />
        )}
      </motion.div>

      {/* Form Modal – Create & Edit */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingProduct ? 'Cập nhật thông tin sản phẩm' : 'Đăng ký sản phẩm OCOP mới'}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Tên sản phẩm" placeholder="Hồng sấy treo gió Cầu Đất" error={errors.name?.message} {...register('name')} />
            <Input label="Giá bán (VNĐ)" type="number" placeholder="250000" error={errors.price?.message} {...register('price', { valueAsNumber: true })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Đơn vị tính" placeholder="Gói 500g, Hộp, Chai..." error={errors.unit?.message} {...register('unit')} />
            <Input label="Đường dẫn Video (Tùy chọn)" placeholder="https://youtube.com/..." error={errors.videoUrl?.message} {...register('videoUrl')} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Ngành hàng</label>
              <select {...register('categoryId')} className={selectCls}>
                <option value="">-- Chọn ngành hàng --</option>
                {categories.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
              {errors.categoryId && <span className="text-xs text-red-500 font-medium">{errors.categoryId.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Phân hạng sao</label>
              <select {...register('ocopLevelId')} className={selectCls}>
                <option value="">-- Chọn số sao --</option>
                {ocopLevels.map((lvl: any) => <option key={lvl.id} value={lvl.id}>{lvl.title}</option>)}
              </select>
              {errors.ocopLevelId && <span className="text-xs text-red-500 font-medium">{errors.ocopLevelId.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Chủ thể liên kết</label>
              <select {...register('businessId')} className={selectCls}>
                <option value="">-- Chọn chủ thể --</option>
                {businesses.map((biz: any) => <option key={biz.id} value={biz.id}>{biz.name}</option>)}
              </select>
              {errors.businessId && <span className="text-xs text-red-500 font-medium">{errors.businessId.message}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tỉnh / Thành phố</label>
              <select {...register('provinceId')} className={`${selectCls} pointer-events-none bg-slate-50 dark:bg-slate-800/50 opacity-70`}>
                <option value="">-- Chọn tỉnh/thành --</option>
                {provinces.map((prov: any) => <option key={prov.id} value={prov.id}>{prov.name}</option>)}
              </select>
              {errors.provinceId && <span className="text-xs text-red-500 font-medium">{errors.provinceId.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Xã / Phường</label>
              <select {...register('wardId')} className={`${selectCls} pointer-events-none bg-slate-50 dark:bg-slate-800/50 opacity-70`}>
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

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Hình ảnh sản phẩm (Tối đa 10 ảnh)</label>
              <Button type="button" variant="outline" size="sm" onClick={() => { if (imageFields.length < 10) appendImage(''); }} disabled={imageFields.length >= 10}>
                Thêm ảnh
              </Button>
            </div>
            <div className="space-y-2">
              {imageFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <Input placeholder="https://..." error={(errors.imageUrls?.[index] as any)?.message} {...register(`imageUrls.${index}` as const)} />
                  </div>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 text-red-500 hover:text-red-600 border-slate-200 dark:border-slate-700" onClick={() => removeImage(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {imageFields.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có hình ảnh nào. Ảnh đầu tiên sẽ là ảnh đại diện chính.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bài viết giới thiệu sản phẩm</label>
            <textarea
              {...register('description')}
              rows={8}
              placeholder="Giới thiệu chi tiết sản phẩm, thành phần, công nghệ sản xuất, câu chuyện OCOP..."
              className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
            />
            {errors.description && <span className="text-xs text-red-500 font-medium">{errors.description.message}</span>}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Thông tin Truy xuất Nguồn gốc (Tùy chọn)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input label="Số giấy chứng nhận VSATTP/OCOP" placeholder="VD: VSATTP-01/2026" error={errors.certificateNumber?.message} {...register('certificateNumber')} />
              <Input label="Ngày thu hoạch/Sản xuất" type="date" error={errors.harvestDate?.message} {...register('harvestDate')} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nguồn gốc nguyên liệu</label>
                <textarea
                  {...register('originProcess')}
                  rows={2}
                  placeholder="VD: Vùng trồng xoài hữu cơ tại Cam Lâm..."
                  className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quy trình chăm sóc / Nuôi trồng</label>
                <textarea
                  {...register('farmingProcess')}
                  rows={2}
                  placeholder="VD: Canh tác chuẩn VietGAP..."
                  className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quy trình thu hoạch & Sơ chế</label>
                <textarea
                  {...register('harvestProcess')}
                  rows={2}
                  placeholder="VD: Thu hoạch thủ công..."
                  className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quy trình đóng gói</label>
                <textarea
                  {...register('packagingProcess')}
                  rows={2}
                  placeholder="VD: Hút chân không, tiệt trùng..."
                  className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-5">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsFormOpen(false)}>Hủy</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createMutation.isPending || updateMutation.isPending}>
              Lưu sản phẩm
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modals */}
      <ConfirmDialog
        isOpen={!!deletingProductId}
        onClose={() => setDeletingProductId(null)}
        onConfirm={() => deletingProductId && deleteMutation.mutate(deletingProductId)}
        title="Xóa sản phẩm OCOP"
        description="Bạn có chắc chắn muốn xóa sản phẩm này? Thao tác này sẽ đưa sản phẩm vào trạng thái xóa mềm."
        type="danger"
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        isOpen={!!approvingProduct}
        onClose={() => setApprovingProduct(null)}
        onConfirm={() => approvingProduct && approveMutation.mutate({ id: approvingProduct.id, status: 'APPROVED' })}
        title="Phê duyệt sản phẩm"
        description={`Xác nhận phê duyệt sản phẩm "${approvingProduct?.name}" đạt chuẩn hạng sao. Sản phẩm sẽ hiển thị công khai trên bản đồ số.`}
        isLoading={approveMutation.isPending}
      />

      <Modal
        isOpen={!!rejectingProduct}
        onClose={() => { setRejectingProduct(null); setRejectReason(''); }}
        title="Từ chối phê duyệt sản phẩm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vui lòng nêu rõ lý do từ chối hồ sơ chất lượng sản phẩm &quot;{rejectingProduct?.name}&quot;:
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Ví dụ: Thiếu tài liệu chứng minh nguồn gốc xuất xứ..."
            className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
          />
          <div className="flex justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="outline" size="sm" onClick={() => { setRejectingProduct(null); setRejectReason(''); }}>Hủy</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!rejectReason.trim()}
              onClick={() => rejectingProduct && approveMutation.mutate({ id: rejectingProduct.id, status: 'REJECTED', rejectReason })}
              isLoading={approveMutation.isPending}
            >
              Gửi từ chối
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!upgradingProduct}
        onClose={() => { setUpgradingProduct(null); setUpgradeTargetId(''); setUpgradeReason(''); setUpgradeDocUrls(['']); }}
        title="Xin nâng hạng sao OCOP"
        className="max-w-xl"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Đăng ký nâng hạng sao cho sản phẩm &quot;<span className="font-bold text-slate-900 dark:text-white">{upgradingProduct?.name}</span>&quot; (Đang đạt {upgradingProduct?.ocopLevel?.title}).
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Chọn sao mục tiêu</label>
            <select className={selectCls} value={upgradeTargetId} onChange={e => setUpgradeTargetId(e.target.value)}>
              <option value="">-- Chọn số sao --</option>
              {ocopLevels.filter((lvl: any) => lvl.level > (upgradingProduct?.ocopLevel?.level || 0)).map((lvl: any) => (
                <option key={lvl.id} value={lvl.id}>{lvl.title}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lý do nâng hạng</label>
            <textarea
              value={upgradeReason}
              onChange={(e) => setUpgradeReason(e.target.value)}
              rows={3}
              placeholder="VD: Sản phẩm đã cải tiến chất lượng bao bì, đạt chứng nhận ISO..."
              className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A] transition-all resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tài liệu chứng minh (Links)</label>
              <Button type="button" variant="outline" size="sm" onClick={() => setUpgradeDocUrls([...upgradeDocUrls, ''])}>
                Thêm Link
              </Button>
            </div>
            <div className="space-y-2 mt-1">
              {upgradeDocUrls.map((url, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input 
                    value={url} 
                    onChange={e => {
                      const newUrls = [...upgradeDocUrls];
                      newUrls[idx] = e.target.value;
                      setUpgradeDocUrls(newUrls);
                    }} 
                    placeholder="https://drive.google.com/..." 
                  />
                  <Button type="button" variant="outline" size="sm" className="text-red-500" onClick={() => {
                    const newUrls = [...upgradeDocUrls];
                    newUrls.splice(idx, 1);
                    setUpgradeDocUrls(newUrls);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="outline" size="sm" onClick={() => setUpgradingProduct(null)}>Hủy</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!upgradeTargetId || upgradeDocUrls.filter(u => u.trim()).length === 0}
              onClick={() => {
                if (upgradingProduct) {
                  upgradeMutation.mutate({
                    productId: upgradingProduct.id,
                    targetLevelId: upgradeTargetId,
                    reason: upgradeReason,
                    documentUrls: upgradeDocUrls.filter(u => u.trim())
                  });
                }
              }}
              isLoading={upgradeMutation.isPending}
            >
              Gửi hồ sơ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
