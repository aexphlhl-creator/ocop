'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { api } from '../../services/api';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Boxes,
  ChevronRight,
  FileCheck2,
  Leaf,
  Map,
  MapPin,
  Newspaper,
  PackageCheck,
  QrCode,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react';
import { useStatisticsOverview } from '../../hooks/use-dashboard';
import { ProductCard } from '../../components/ui/product-card';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const STATS_CARDS = [
  { key: 'products', label: 'Sản phẩm OCOP', icon: ShoppingBag, image: '/images/stat_products.jpg' },
  { key: 'businesses', label: 'Chủ thể sản xuất', icon: Store, image: '/images/stat_producers.jpg' },
  { key: 'provinces', label: 'Tỉnh thành', icon: Map, image: '/images/stat_provinces.jpg' },
  { key: 'categories', label: 'Ngành hàng', icon: Leaf, image: '/images/stat_categories.jpg' },
];

const TRUST_POINTS = [
  {
    title: 'Truy xuất minh bạch',
    desc: 'Theo dõi hành trình lô hàng và chứng nhận.',
    icon: QrCode,
  },
  {
    title: 'Chứng nhận rõ ràng',
    desc: 'OCOP, VietGAP, an toàn thực phẩm.',
    icon: FileCheck2,
  },
  {
    title: 'Bản đồ số',
    desc: 'Khám phá sản phẩm theo địa phương.',
    icon: MapPin,
  },
];

const CATEGORIES = [
  { id: '1', name: 'Thực phẩm', color: 'bg-[#E07A5F]', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80' },
  { id: '2', name: 'Đồ uống', color: 'bg-[#D4A373]', image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=800&q=80' },
  { id: '3', name: 'Thảo dược', color: 'bg-[#1B4332]', image: 'https://images.unsplash.com/photo-1596541223130-5d31a73fb6c6?auto=format&fit=crop&w=800&q=80' },
  { id: '4', name: 'Thủ công', color: 'bg-[#005F73]', image: 'https://images.unsplash.com/photo-1606722590583-6951b5ea92ad?auto=format&fit=crop&w=800&q=80' },
  { id: '5', name: 'Nông sản', color: 'bg-[#606C38]', image: 'https://images.unsplash.com/photo-1592424041795-5853bf686255?auto=format&fit=crop&w=800&q=80' },
  { id: '6', name: 'Quà biếu', color: 'bg-[#9B2226]', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80' },
];

export default function HomePage() {
  const { data: stats, isLoading: isStatsLoading } = useStatisticsOverview();
  const [selectedProvince, setSelectedProvince] = useState<any>(null);

  const { data: provinces = [] } = useQuery({
    queryKey: ['homeProvinces'],
    queryFn: async () => {
      const res = await api.get('/api/v1/provinces');
      return res.data.data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: wardsData = [] } = useQuery({
    queryKey: ['homeWards', selectedProvince?.id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/wards?provinceId=${selectedProvince.id}&limit=12`);
      return res.data.data || [];
    },
    enabled: !!selectedProvince,
    staleTime: 5 * 60 * 1000,
  });

  const { data: newsData = [] } = useQuery({
    queryKey: ['homeNews'],
    queryFn: async () => {
      const res = await api.get('/api/v1/news', { params: { page: 1, limit: 3, status: 'PUBLISHED' } });
      return Array.isArray(res.data.data) ? res.data.data : res.data.data?.items || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: topProductsData = [] } = useQuery({
    queryKey: ['homeTopProducts'],
    queryFn: async () => {
      const res = await api.get('/api/v1/products', {
        params: { limit: 8, status: 'APPROVED', sortBy: 'createdAt', sortOrder: 'desc' },
      });
      return res.data.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const topProducts: any[] = topProductsData || [];
  const newsList: any[] = newsData || [];
  const displayedProvinces: any[] = provinces.slice(0, 12);

  return (
    <div className="flex flex-col overflow-hidden bg-background text-foreground font-sans">
      {/* Organic Premium Hero Section */}
      <section className="relative min-h-[calc(100vh-4rem)] flex items-center bg-background overflow-hidden">
        {/* Dynamic Background Elements */}
        <motion.div 
          animate={{ rotate: 360, scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
          className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary-light/20 rounded-full blur-[100px] opacity-60 pointer-events-none -translate-y-1/4 translate-x-1/4" 
        />
        <motion.div 
          animate={{ rotate: -360, scale: [1, 1.2, 1] }} 
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
          className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent-light/30 rounded-full blur-[100px] opacity-50 pointer-events-none translate-y-1/4 -translate-x-1/4" 
        />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col lg:flex-row items-center justify-between px-6 py-16 sm:px-8 lg:px-12 gap-12">
          
          <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-2xl flex-1 mt-12 lg:mt-0">
            <motion.div variants={fadeUp} className="mb-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary/10 text-primary rounded-full border border-primary/20">
                <BadgeCheck className="h-4 w-4" /> 
                <span className="text-[11px] font-bold uppercase tracking-widest">Nền tảng chính thức</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-surface text-foreground rounded-full border border-border shadow-sm">
                <ShieldCheck className="h-4 w-4 text-accent" /> 
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Dữ liệu minh bạch</span>
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-heading text-5xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl"
            >
              Sản vật địa phương <br/>
              <span className="text-primary font-medium italic relative z-10">
                Nâng tầm
                <div className="absolute -bottom-2 left-0 w-full h-4 bg-primary-light/50 -z-10 rounded-full blur-[2px]"></div>
              </span> Quốc gia
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-8 max-w-xl text-base md:text-lg text-muted leading-relaxed font-medium"
            >
              Hệ thống OCOP Quốc gia. Tìm kiếm sản phẩm, tra cứu vùng nguyên liệu và theo dõi chuỗi cung ứng nông sản với dữ liệu minh bạch, an toàn nhất.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link href="/products">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base shadow-md hover:shadow-lg hover:-translate-y-0.5">
                  <ShoppingBag className="h-5 w-5" /> Khám phá sản phẩm
                </Button>
              </Link>
              <Link href="/map">
                <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 text-base bg-surface border-border text-foreground shadow-sm hover:shadow-md hover:-translate-y-0.5">
                  <Map className="h-5 w-5 text-primary" /> Bản đồ số
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="flex-1 relative hidden lg:block w-full max-w-lg mx-auto"
          >
            <motion.div 
              animate={{ y: [0, -15, 0] }} 
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="relative aspect-[4/5] w-full rounded-[2rem] overflow-hidden shadow-[0_20px_50px_-12px_rgba(16,185,129,0.3)] border border-white/50 ring-1 ring-black/5"
            >
              <img
                src="https://images.unsplash.com/photo-1592424041795-5853bf686255?auto=format&fit=crop&w=800&q=80"
                alt="Nông sản hữu cơ"
                className="w-full h-full object-cover scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-transparent"></div>
              
              <div className="absolute bottom-6 left-6 right-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="bg-surface/80 backdrop-blur-xl p-4 rounded-2xl border border-white/40 shadow-2xl flex items-center gap-4 hover:bg-surface/95 transition-colors"
                >
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Leaf className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Sản phẩm 100% hữu cơ</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Thu hoạch trực tiếp từ nông trại</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
            
            {/* Decorative float elements */}
            <motion.div 
              animate={{ y: [0, 20, 0], rotate: [0, 10, 0] }}
              transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
              className="absolute -top-10 -right-10 h-32 w-32 bg-accent/20 rounded-full blur-2xl" 
            />
            <motion.div 
              animate={{ y: [0, -25, 0], rotate: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
              className="absolute -bottom-16 -left-16 h-40 w-40 bg-primary/20 rounded-full blur-3xl" 
            />
          </motion.div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="py-16 md:py-24 bg-surface/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 relative z-10 max-w-6xl mx-auto px-6">
          {STATS_CARDS.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 * idx }}
                className="group relative overflow-hidden rounded-[2.5rem] bg-white border border-slate-100 shadow-xl shadow-emerald-900/5 hover:shadow-2xl hover:shadow-emerald-900/10 transition-all duration-500 hover:-translate-y-2 flex flex-col h-full"
              >
                {/* Image Header */}
                <div className="w-full aspect-[4/3] overflow-hidden relative">
                  <div 
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat group-hover:scale-110 transition-transform duration-700" 
                    style={{ backgroundImage: `url(${stat.image})` }} 
                  />
                  {/* Subtle gradient overlay to make the top less harsh */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                </div>
                
                {/* Content Area */}
                <div className="p-6 pt-0 flex flex-col items-center flex-1 relative z-10 bg-white text-center">
                  {/* Floating Icon */}
                  <div className="relative -mt-10 mb-4 w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-500 shadow-inner border-[6px] border-white">
                    <Icon className="w-6 h-6 relative z-10" />
                  </div>
                  
                  {/* Stats Data */}
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight group-hover:text-emerald-700 transition-colors duration-500">
                      {isStatsLoading ? <span className="skeleton w-16 h-10 inline-block rounded-xl"></span> : (stats?.[stat.key as keyof typeof stats] ?? 0).toLocaleString('vi-VN')}
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 mt-2 uppercase tracking-[0.2em]">
                      {stat.label}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Organic Category Wall */}
      <section className="py-24 lg:py-32 bg-surface">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <motion.div
            className="mb-14 flex flex-col md:flex-row md:items-end justify-between gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            <div className="max-w-2xl">
              <motion.div variants={fadeUp} className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary mb-4 border border-primary/20">
                <span className="text-xs font-bold uppercase tracking-widest">Khám phá theo nhu cầu</span>
              </motion.div>
              <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.2]">
                Chọn một <span className="text-primary italic">hương vị</span><br/>để bắt đầu.
              </motion.h2>
            </div>
            <motion.div variants={fadeUp}>
              <Link href="/products" className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 font-semibold text-foreground shadow-sm hover:shadow-md hover:border-primary/50 transition-all">
                Tất cả danh mục <ArrowRight className="h-4 w-4 group-hover:translate-x-1 text-primary transition-transform" />
              </Link>
            </motion.div>
          </motion.div>

          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
          >
            {CATEGORIES.map((cat, index) => (
              <motion.div key={cat.id} variants={fadeUp} className={`group relative h-48 md:h-64 rounded-[2.5rem] border border-white/50 shadow-sm hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-all duration-500 overflow-hidden cursor-pointer flex flex-col justify-end p-8 bg-surface`}>
                
                <img 
                  src={cat.image} 
                  alt={cat.name} 
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-in-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                <div className={`absolute inset-0 ${cat.color.replace('bg-', 'bg-opacity-40 bg-')} mix-blend-multiply opacity-50 group-hover:opacity-80 transition-opacity duration-500`}></div>
                
                <div className="absolute top-6 right-6 bg-white/20 backdrop-blur-md w-12 h-12 flex items-center justify-center rounded-full shadow-lg border border-white/30 group-hover:scale-110 group-hover:bg-primary group-hover:shadow-primary/30 transition-all duration-500 z-10">
                  <ArrowRight className="h-5 w-5 text-white -rotate-45 group-hover:rotate-0 transition-all duration-500" />
                </div>
                
                <h3 className="font-heading text-3xl md:text-4xl font-bold text-white tracking-tight relative z-10 group-hover:-translate-y-1 transition-all duration-500">
                  {cat.name}
                </h3>
                <div className="mt-2 text-white/80 text-xs font-bold uppercase tracking-widest relative z-10 opacity-80 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-500">
                  Khám phá ngay
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-24 lg:py-32 bg-background">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <motion.div
            className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            <div>
              <motion.div variants={fadeUp} className="inline-block px-4 py-1.5 rounded-full bg-accent/10 text-accent mb-4 border border-accent/20">
                <span className="text-xs font-bold uppercase tracking-widest">Sản phẩm mới nổi bật</span>
              </motion.div>
              <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.2] max-w-2xl">
                Đặc sản địa phương được <span className="text-primary italic">số hóa rõ ràng</span>
              </motion.h2>
            </div>
            <motion.div variants={fadeUp}>
              <Link href="/products" className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 font-semibold text-foreground shadow-sm hover:shadow-md hover:border-primary/50 transition-all">
                Xem tất cả <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </motion.div>

          {topProducts.length > 0 ? (
            <motion.div
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-40px' }}
            >
              {topProducts.map((product: any) => (
                <motion.div key={product.id} variants={fadeUp}>
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border/60 bg-surface/50 p-12 text-center">
              <span className="font-heading text-xl font-medium text-muted">Chưa có sản phẩm được công bố.</span>
            </div>
          )}
        </div>
      </section>

      <section className="bg-surface py-24 lg:py-32 relative overflow-hidden">
        {/* Soft Background Graphic */}
        <motion.div 
          animate={{ y: [0, -30, 0], scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 15, ease: "easeInOut" }}
          className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary-light/20 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/3 pointer-events-none" 
        />
        <motion.div 
          animate={{ y: [0, 30, 0], scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 18, ease: "easeInOut" }}
          className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-accent-light/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" 
        />
        
        <div className="mx-auto grid max-w-7xl gap-16 px-6 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 relative z-10 items-center">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.div variants={fadeUp} className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary mb-6 border border-primary/20 shadow-sm shadow-primary/10">
              <span className="text-xs font-bold uppercase tracking-widest">QR Traceability</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.15]">
              Hành trình <br/><span className="text-primary italic relative">
                minh bạch
                <div className="absolute -bottom-1 left-0 w-full h-3 bg-primary-light/40 -z-10 rounded-full blur-[2px]"></div>
              </span> từ trang trại.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-6 text-base leading-relaxed text-muted md:text-lg">
              Hồ sơ truy xuất tổng hợp từ vùng trồng, doanh nghiệp, lô hàng, nhà kho cho tới các chứng nhận an toàn thực phẩm. Giao diện trực quan giúp khách hàng dễ dàng theo dõi và hoàn toàn an tâm.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-2 mb-10">
              {['Sản phẩm', 'Lô hàng', 'Nhà kho', 'Nhật ký', 'Chứng nhận'].map((item) => (
                <span key={item} className="rounded-full bg-surface-hover px-4 py-2 text-xs font-semibold text-foreground shadow-sm border border-white/50 hover:-translate-y-1 transition-transform cursor-default hover:shadow-md">
                  {item}
                </span>
              ))}
            </motion.div>

            <motion.div variants={fadeUp} className="relative aspect-video w-full max-w-sm rounded-3xl overflow-hidden shadow-lg border border-white/50 hidden lg:block">
              <img 
                src="https://images.unsplash.com/photo-1590402494587-44b71d7772f6?auto=format&fit=crop&w=800&q=80" 
                alt="Người nông dân" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg shrink-0">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-bold">Cam kết nguồn gốc</p>
                  <p className="text-white/80 text-xs">Từ nông trại đến bàn ăn</p>
                </div>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 24 }}
            whileInView={{ opacity: 1, scale: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[2rem] border border-white/60 bg-surface/60 backdrop-blur-xl p-8 shadow-[0_20px_50px_-12px_rgba(16,185,129,0.2)] relative"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2rem] pointer-events-none"></div>
            <div className="rounded-[1.5rem] bg-surface/90 backdrop-blur-md p-6 shadow-sm border border-white/50 relative z-10 hover:shadow-lg transition-shadow duration-500">
              <div className="mb-8 flex items-center justify-between border-b border-border/50 pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Verified journey</p>
                  <h3 className="mt-1 font-heading text-2xl font-bold tracking-tight">Hành trình sản phẩm</h3>
                </div>
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary-light/40 to-primary/10 flex items-center justify-center shadow-inner cursor-pointer"
                >
                  <QrCode className="h-6 w-6 text-primary" />
                </motion.div>
              </div>
              {[
                { icon: Leaf, label: 'Thu hoạch tại vùng nguyên liệu' },
                { icon: PackageCheck, label: 'Kiểm định và đóng gói' },
                { icon: Boxes, label: 'Nhập kho theo lô' },
                { icon: Award, label: 'Kiểm tra chứng nhận' },
              ].map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="relative flex gap-5 pb-8 last:pb-0">
                    {index < 3 && <span className="absolute left-[1.15rem] top-10 h-full w-px bg-border/80" />}
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="pt-1">
                      <p className="font-semibold text-sm md:text-base text-foreground">{step.label}</p>
                      <p className="text-xs text-muted mt-1">Dữ liệu từ hệ thống lưu trữ OCOP</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 lg:py-32 bg-background relative">
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="mx-auto max-w-7xl px-6 text-center sm:px-8 lg:px-12">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="flex flex-col items-center">
            <motion.div variants={fadeUp} className="inline-block px-4 py-1.5 rounded-full bg-secondary/10 text-secondary mb-4 border border-secondary/20">
              <span className="text-xs font-bold uppercase tracking-widest">Khám phá địa phương</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.2] max-w-2xl">
              Mỗi vùng có một câu chuyện <span className="text-primary italic">riêng biệt</span>
            </motion.h2>
          </motion.div>

          <motion.div
            className="mt-12 flex flex-wrap justify-center gap-3 relative z-10"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {displayedProvinces.map((province: any) => (
              <motion.button
                key={province.id}
                variants={fadeUp}
                onClick={() => setSelectedProvince(selectedProvince?.id === province.id ? null : province)}
                className={`rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 border backdrop-blur-sm ${
                  selectedProvince?.id === province.id
                    ? 'bg-primary border-primary text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)] -translate-y-1 scale-105'
                    : 'bg-surface/80 border-white/50 text-foreground hover:bg-surface hover:border-primary/30 hover:text-primary hover:shadow-[0_8px_15px_-5px_rgba(0,0,0,0.05)] hover:-translate-y-0.5'
                }`}
              >
                {province.name.replace('Tỉnh ', '').replace('Thành phố ', '')}
              </motion.button>
            ))}
            <Link href="/map" className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-surface/80 backdrop-blur-sm px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-surface hover:text-primary hover:shadow-[0_8px_15px_-5px_rgba(0,0,0,0.05)] hover:border-primary/30 hover:-translate-y-0.5 transition-all">
              Bản đồ số <Map className="h-4 w-4" />
            </Link>
          </motion.div>

          <AnimatePresence>
            {selectedProvince && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: 20 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: 20 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="mt-10 overflow-hidden text-left relative z-10"
              >
                <div className="rounded-[2rem] border border-white/60 bg-surface/60 p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] backdrop-blur-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none"></div>
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center justify-between gap-4 border-b border-border/50 pb-4">
                      <h3 className="font-heading text-xl md:text-2xl font-bold text-foreground tracking-tight">
                        Vùng nguyên liệu tại <span className="text-primary">{selectedProvince.name}</span>
                      </h3>
                      <Search className="h-5 w-5 text-muted" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {wardsData.map((ward: any) => (
                        <Link
                          key={ward.id}
                          href={`/products?provinceId=${selectedProvince.id}&wardId=${ward.id}`}
                          className="rounded-2xl border border-white/50 bg-surface/80 px-3 py-3 text-center text-sm font-medium text-foreground shadow-sm hover:bg-primary/5 hover:border-primary/30 hover:text-primary hover:-translate-y-1 hover:shadow-md transition-all tracking-tight"
                        >
                          {ward.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="py-24 lg:py-32 bg-surface">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="mb-12 flex items-end justify-between gap-6 border-b border-border/50 pb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">
                Bản tin OCOP
              </p>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Tin tức nông nghiệp</h2>
            </div>
            <Link href="/news" className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-background font-semibold text-foreground hover:border-primary/50 hover:text-primary transition-all text-sm">
              Đọc tất cả <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {newsList.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {newsList.map((article: any) => (
                <Link key={article.id} href={`/news/${article.slug}`} className="group flex flex-col bg-surface/60 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-sm hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-all duration-500 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10"></div>
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted-bg rounded-t-[2rem]">
                    <img
                      src={article.thumbnailUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80'}
                      alt={article.title}
                      className="h-full w-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-in-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-md text-primary px-3 py-1.5 rounded-full border border-white/50 font-bold text-[10px] uppercase shadow-lg">
                      Tin mới
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-6 relative z-10 bg-surface/80">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                      {new Date(article.publishedAt || article.createdAt).toLocaleDateString('vi-VN')}
                    </p>
                    <h3 className="font-heading font-bold text-xl leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="mt-3 text-sm text-muted font-medium line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                    <div className="mt-auto pt-6 flex items-center text-xs font-bold uppercase tracking-widest text-primary">
                      Đọc tiếp <ArrowRight className="ml-1.5 h-4 w-4 group-hover:translate-x-2 transition-transform duration-300" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-[2rem] border-2 border-dashed border-border/60 bg-surface/50 p-12 text-center">
              <span className="font-heading text-lg font-medium text-muted">Chưa có tin tức được công bố.</span>
            </div>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-32 px-6">
        <div className="mx-auto max-w-6xl relative">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-[3rem] p-8 text-center sm:p-16 relative shadow-[0_30px_60px_-15px_rgba(16,185,129,0.3)] border border-white/40"
          >
            {/* Background Image & Overlays */}
            <img 
              src="https://images.unsplash.com/photo-1592424002621-e8d11c19b05c?auto=format&fit=crop&w=2000&q=80" 
              alt="Cánh đồng chè xanh" 
              className="absolute inset-0 w-full h-full object-cover scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/90 via-emerald-800/80 to-emerald-900/90 mix-blend-multiply"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-900/40 to-emerald-900/80"></div>
            
            {/* Dynamic Orbs */}
            <motion.div 
              animate={{ rotate: 360, scale: [1, 1.2, 1] }} 
              transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
              className="absolute -top-32 -right-32 w-96 h-96 bg-primary/40 rounded-full blur-[80px] pointer-events-none" 
            />
            <motion.div 
              animate={{ rotate: -360, scale: [1, 1.3, 1] }} 
              transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
              className="absolute -bottom-32 -left-32 w-96 h-96 bg-accent/30 rounded-full blur-[80px] pointer-events-none" 
            />
            
            <div className="relative z-10 mx-auto max-w-3xl flex flex-col items-center bg-white/10 backdrop-blur-md p-8 md:p-12 rounded-[2.5rem] border border-white/20 shadow-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 mb-6">
                <Store className="h-4 w-4 text-emerald-300" />
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-100">Dành cho chủ thể sản xuất</span>
              </div>
              
              <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-white leading-[1.15]">
                Đưa sản phẩm OCOP lên <span className="text-emerald-300 italic">bản đồ số</span>
              </h2>
              
              <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg leading-relaxed text-emerald-50/90 font-medium">
                Tham gia hệ sinh thái kết nối nông sản số. Quản lý sản phẩm, kho hàng, chứng nhận và minh bạch hành trình truy xuất trên cùng một nền tảng duy nhất.
              </p>
              
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row w-full sm:w-auto">
                <Link href="/register">
                  <Button size="lg" className="h-14 w-full rounded-full bg-white px-10 font-bold text-emerald-800 hover:bg-emerald-50 sm:w-auto hover:-translate-y-1 shadow-[0_10px_20px_-10px_rgba(255,255,255,0.5)] transition-all duration-300 text-base">
                    Đăng ký tài khoản ngay
                  </Button>
                </Link>
                <Link href="/shops">
                  <Button size="lg" variant="outline" className="h-14 w-full rounded-full border-2 border-white/30 bg-white/5 backdrop-blur-sm px-10 font-bold text-white hover:bg-white/20 hover:border-white/50 sm:w-auto hover:-translate-y-1 shadow-lg transition-all duration-300 text-base">
                    Xem gian hàng mẫu
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
