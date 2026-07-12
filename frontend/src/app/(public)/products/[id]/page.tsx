'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { motion } from 'framer-motion';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ArrowLeft, Star, MapPin, Store, Mail, Phone, Video, Info, Image as ImageIcon, MessageCircle, PhoneCall, Package, ShoppingCart, Plus, Minus, QrCode } from 'lucide-react';
import Link from 'next/link';
import { useCart } from '../../../../hooks/use-cart';
import { toast } from 'sonner';
import { ProductReviews } from '../../../../components/ecommerce/product-reviews';
import { QRCodeSVG } from 'qrcode.react';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['productDetail', id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/products/${id}`);
      return res.data.data;
    },
    enabled: !!id,
    retry: 1,
  });

  React.useEffect(() => {
    if (product?.id) {
      api.patch(`/api/v1/products/${product.id}/view`).catch(() => {});
    }
  }, [product?.id]);

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="Không tìm thấy sản phẩm"
          description="Sản phẩm này đã ngừng bán hoặc bị gỡ khỏi hệ thống."
          action={
            <button
              onClick={() => router.push('/products')}
              className="mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
            </button>
          }
        />
      </div>
    );
  }

  const images = product.images && product.images.length > 0
    ? product.images.sort((a: any, b: any) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    : [{ imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=800&q=80', isPrimary: true }];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 lg:py-12 flex flex-col gap-8">
      {/* Back button */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </button>
      </div>

      {/* Main Header Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left: Product Images Gallery */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative rounded-3xl overflow-hidden aspect-[4/3] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <img
              src={images[activeImageIndex]?.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover transition-all duration-500"
            />
            <div className="absolute top-4 left-4">
              <Badge variant="success" className="bg-emerald-500 text-white flex items-center gap-1 px-3 py-1.5 text-sm border-none shadow-sm rounded-full">
                {product.ocopLevel?.level} <Star className="h-3.5 w-3.5 fill-white" />
              </Badge>
            </div>
          </motion.div>

          {/* Thumbnail list */}
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {images.map((img: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative h-20 w-24 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    activeImageIndex === idx ? 'border-emerald-500 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img.imageUrl} alt={`${product.name} ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Info & CTA */}
        <div className="lg:col-span-5 flex flex-col gap-6 pt-2">
          <div className="flex flex-col gap-3">
            <Badge variant="default" className="w-fit bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-none font-bold text-xs rounded-full px-3 py-1">
              {product.category?.name}
            </Badge>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
              {product.name}
            </h1>
            
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-0.5">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-bold text-sm ml-1 text-slate-900 dark:text-white">
                  {product.averageRating > 0 ? Number(product.averageRating).toFixed(1) : 'Chưa có'}
                </span>
              </div>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="text-sm text-slate-500">{product.reviewCount || 0} đánh giá</span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {Number(product.price).toLocaleString('vi-VN')} đ
              </span>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/ {product.unit}</span>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden h-12 w-32">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input 
                  type="number" 
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full h-full text-center font-bold text-slate-900 dark:text-white bg-transparent border-none focus:ring-0 p-0"
                />
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button 
                onClick={() => {
                  addItem({
                    id: product.id,
                    name: product.name,
                    price: Number(product.price),
                    quantity,
                    imageUrl: images[0]?.imageUrl,
                    businessId: product.businessId,
                    businessName: product.business?.name,
                  });
                  toast.success('Đã thêm sản phẩm vào giỏ hàng!');
                }}
                className="flex-1 w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all gap-2"
              >
                <ShoppingCart className="h-5 w-5" /> Thêm vào giỏ hàng
              </Button>
            </div>

            {/* CTA Buttons */}
            {product.business?.phone ? (
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <a href={`https://zalo.me/${product.business.phone.replace(/\\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button className="w-full bg-[#0068FF] hover:bg-[#0054cc] text-white flex items-center justify-center gap-2 rounded-xl h-12 shadow-md hover:shadow-lg transition-all text-sm font-bold">
                    <MessageCircle className="h-5 w-5" /> Chat Zalo Mua Hàng
                  </Button>
                </a>
                <a href={`tel:${product.business.phone}`} className="flex-1">
                  <Button variant="outline" className="w-full flex items-center justify-center gap-2 rounded-xl h-12 border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all text-sm font-bold">
                    <PhoneCall className="h-5 w-5" /> Gọi: {product.business.phone}
                  </Button>
                </a>
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-medium border border-amber-200 dark:border-amber-800/50">
                Chủ thể chưa cập nhật số điện thoại liên hệ.
              </div>
            )}
          </div>

          <div className="h-px w-full bg-slate-200 dark:bg-slate-800" />

          <Link href={`/shops/${product.business?.id}`}>
            <Card className="hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer dark:bg-slate-900 dark:border-slate-800 group rounded-2xl">
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 shrink-0">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                      {product.business?.name}
                    </h3>
                    <p className="text-xs text-slate-500">Chủ thể sản xuất</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{product.business?.address}, {product.province?.name}</span>
                  </div>
                  {product.business?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{product.business.phone}</span>
                    </div>
                  )}
                  {product.business?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{product.business.email}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Video / Extra Info */}
          {product.videoUrl && (
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Video className="h-4 w-4 text-red-500" />
                Video giới thiệu
              </div>
              <a href={product.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline truncate bg-white dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-800 inline-block">
                {product.videoUrl}
              </a>
            </div>
          )}

          {/* Traceability QR Code */}
          <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50 rounded-2xl overflow-hidden mt-2">
            <CardContent className="p-5 flex items-center gap-5">
              <div className="bg-white p-2 rounded-xl shadow-sm shrink-0">
                <QRCodeSVG 
                  value={typeof window !== 'undefined' ? `${window.location.origin}/traceability/${product.id}` : ''}
                  size={80}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  Truy xuất nguồn gốc
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
                  Quét mã QR bằng Zalo hoặc Camera để xem chi tiết hồ sơ nguồn gốc sản phẩm này.
                </p>
                <Link href={`/traceability/${product.id}`} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline">
                  Xem chi tiết hồ sơ &rarr;
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Article Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-8"
      >
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-10 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
            <Info className="h-6 w-6 text-emerald-500" />
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
              Bài viết giới thiệu sản phẩm
            </h2>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-4xl prose-p:leading-relaxed prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-headings:text-slate-900 dark:prose-headings:text-white whitespace-pre-wrap md:text-lg">
            {product.description || (
              <p className="italic text-slate-400">Chưa có bài viết giới thiệu chi tiết cho sản phẩm này.</p>
            )}
          </div>
          
          {/* Sub-images in article if there are many */}
          {images.length > 2 && (
            <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                <ImageIcon className="h-5 w-5 text-emerald-500" /> Thư viện hình ảnh
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.slice(1).map((img: any, idx: number) => (
                  <div key={idx} className="rounded-2xl overflow-hidden aspect-[4/3] border border-slate-200 dark:border-slate-800 group">
                    <img src={img.imageUrl} alt="Gallery item" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Reviews Section */}
      <ProductReviews productId={product.id} />
    </div>
  );
}
