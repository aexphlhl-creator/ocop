'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Map, ShoppingBag, Store, ArrowRight, Star, ShieldCheck, Award } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 py-8">
      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-tr from-slate-900 via-slate-800 to-emerald-950 text-white py-20 px-8 md:px-12 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl shadow-emerald-950/10">
        <div className="flex flex-col gap-6 max-w-xl">
          <Badge variant="success" className="w-fit bg-emerald-500/20 text-emerald-400 border-none">
            Phiên bản MVP Phase 1
          </Badge>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            Nền tảng Bản đồ số <span className="text-emerald-400">OCOP Việt Nam</span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            Khám phá, tra cứu và kết nối giao thương trực quan các sản phẩm OCOP đạt chuẩn quốc gia.
            Bản đồ số hóa chi tiết từ cấp Quốc gia, Tỉnh đến từng xã phường.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-2 justify-center md:justify-start">
            <Link href="/map">
              <Button size="lg" className="w-full sm:w-auto flex items-center gap-2">
                <Map className="h-4.5 w-4.5" />
                Khám phá bản đồ số
              </Button>
            </Link>
            <Link href="/products">
              <Button variant="outline" size="lg" className="w-full sm:w-auto border-slate-600 text-white hover:bg-slate-800">
                Xem sản phẩm OCOP
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative flex items-center justify-center w-full max-w-sm h-64 md:h-80 bg-slate-800/40 border border-slate-700/50 rounded-2xl backdrop-blur-md shadow-2xl p-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-teal-500/5 rounded-2xl pointer-events-none" />
          <div className="text-center flex flex-col items-center gap-4">
            <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-full">
              <Map className="h-12 w-12 animate-pulse" />
            </div>
            <h3 className="font-bold text-lg">Bản đồ số đang chờ</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              Mô phỏng 34 tỉnh/thành phố và phân vùng các xã OCOP trọng điểm.
            </p>
            <Link href="/map">
              <Button variant="secondary" size="sm" className="flex items-center gap-1">
                Xem Map <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Highlight Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardContent className="pt-6 flex flex-col gap-3">
            <div className="p-2.5 w-fit bg-emerald-50 text-emerald-600 rounded-lg">
              <Map className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-slate-800">Bản đồ số hóa OCOP</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Trực quan hóa vùng nguyên liệu và địa điểm sản xuất các sản phẩm OCOP từ cấp Tỉnh đến từng Xã.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardContent className="pt-6 flex flex-col gap-3">
            <div className="p-2.5 w-fit bg-amber-50 text-amber-600 rounded-lg">
              <Award className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-slate-800">Phân cấp hạng Sao</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dễ dàng tra cứu các sản phẩm OCOP được chứng nhận đạt chuẩn 3 sao, 4 sao và 5 sao toàn quốc.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardContent className="pt-6 flex flex-col gap-3">
            <div className="p-2.5 w-fit bg-blue-50 text-blue-600 rounded-lg">
              <Store className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-slate-800">Thông tin chủ thể</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Kết nối trực tiếp tới các hợp tác xã, doanh nghiệp sản xuất nông sản và đặc sản địa phương được xác thực.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// Inline badge mock for visual consistency
function Badge({ className, variant, children }: { className?: string; variant?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}
