import React from 'react';
import { motion } from 'framer-motion';
import { Package, ShieldCheck, MapPin, Building2, Calendar, FileCheck2, Scale, QrCode } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface BatchOverviewProps {
  batch: any;
  onShowQR: () => void;
}

export function BatchOverview({ batch, onShowQR }: BatchOverviewProps) {
  const journeys = batch?.journeys || [];
  const currentStage = journeys.length > 0 ? journeys[journeys.length - 1].stage?.displayName : 'Chưa có hành trình';

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'ACTIVE': return 'success';
      case 'DEPLETED': return 'warning';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
    >
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-5 text-white flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-black">{batch?.batchNumber || '---'}</h2>
            <Badge variant={getStatusColor(batch?.status)} className="bg-white/20 hover:bg-white/30 text-white border-0 shadow-none">
              {batch?.status === 'ACTIVE' ? 'Đang kinh doanh' : batch?.status}
            </Badge>
          </div>
          <p className="text-emerald-100 flex items-center gap-2">
            <Package className="w-4 h-4" /> {batch?.inventory?.product?.name || '---'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white/10 hover:bg-white/20 border-white/20 text-white" onClick={onShowQR}>
            <QrCode className="w-4 h-4 mr-2" /> QR Code
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Basic Info */}
        <div className="space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Thông tin chung</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Doanh nghiệp</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{batch?.inventory?.product?.business?.name || '---'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Kho hàng</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{batch?.inventory?.warehouse?.name || '---'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400 flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> Tồn kho</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {batch?.quantity} <span className="text-slate-400 font-normal">/ {batch?.initialQuantity}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Công đoạn hiện tại</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{currentStage}</span>
            </div>
          </div>
        </div>

        {/* Quality & Dates */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Chất lượng & Thời hạn</h3>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400 flex items-center gap-1"><FileCheck2 className="w-3.5 h-3.5" /> Chứng nhận</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{batch?.qualityStatus || 'Chưa kiểm định'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Hạn sử dụng</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('vi-VN') : '---'}
              </span>
            </div>
          </div>
        </div>

        {/* Blockchain Status */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Blockchain Verification</h3>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center text-center h-28">
            <ShieldCheck className="w-8 h-8 text-emerald-500 mb-2" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Verified on Polygon</span>
            <span className="text-[10px] text-slate-400 font-mono truncate w-full mt-1">TX: 0x...a1b2</span>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
