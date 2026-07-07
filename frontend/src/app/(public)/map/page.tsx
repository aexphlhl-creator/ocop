'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Map, AlertCircle, RefreshCw } from 'lucide-react';

export default function MapPage() {
  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Bản đồ số OCOP Việt Nam</h1>
        <p className="text-xs text-slate-400">Khám phá và tra cứu sản phẩm OCOP theo vùng địa lý địa phương</p>
      </div>

      <div className="flex-grow relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col items-center justify-center p-6 text-center shadow-inner">
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-200 via-slate-100 to-slate-200 pointer-events-none" />

        <div className="z-10 flex flex-col items-center gap-4 max-w-sm">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full shadow-md shadow-emerald-500/5">
            <Map className="h-10 w-10 animate-pulse" />
          </div>
          <h2 className="font-extrabold text-slate-700 text-md tracking-tight">Khung chứa Bản đồ trực quan</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hệ thống đang thiết lập các phân vùng hành chính tọa độ Leaflet / MapLibre. Các lớp ranh giới địa lý tỉnh/xã sẽ tự động xuất hiện ở Phase 2.
          </p>
          <div className="flex gap-2 items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Đang liên kết tọa độ địa lý...
          </div>
        </div>
      </div>
    </div>
  );
}
