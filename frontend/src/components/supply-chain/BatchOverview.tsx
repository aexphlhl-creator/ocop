import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Package, ShieldCheck, MapPin, Building2, Calendar, FileCheck2, Scale, QrCode, Truck } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { lotStatusLabel } from './lot-status';

interface BatchOverviewProps {
  batch?: {
    batchNumber?: string;
    status?: string;
    lifecycleStatus?: string;
    quantity?: number;
    initialQuantity?: number;
    qualityStatus?: string;
    expiryDate?: string | null;
    blockchainSynced?: boolean;
    blockchainConfirmedCount?: number;
    inventory?: {
      product?: { name?: string; seller?: { fullName?: string; sellerProfile?: { displayName?: string } | null } };
      warehouse?: { name?: string };
    };
    journeys?: Array<{
      stage?: { displayName?: string; name?: string };
    }>;
    shipmentItems?: Array<{
      shipment?: {
        status?: string;
        trackingCode?: string | null;
        carrierOrganization?: {
          name?: string | null;
          trackingUrlTemplate?: string | null;
        } | null;
      } | null;
    }>;
  };
  onShowQR: () => void;
}

export function BatchOverview({ batch, onShowQR }: BatchOverviewProps) {
  const journeys = batch?.journeys || [];
  const shipment = batch?.shipmentItems?.find((item) => item.shipment)?.shipment;
  const trackingTemplate = shipment?.carrierOrganization?.trackingUrlTemplate;
  const trackingUrl =
    trackingTemplate && shipment?.trackingCode
      ? trackingTemplate.replace(
          '{trackingCode}',
          encodeURIComponent(shipment.trackingCode),
        )
      : undefined;
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
            <Badge variant={getStatusColor(batch?.status ?? '')} className="bg-white/20 hover:bg-white/30 text-white border-0 shadow-none">
              {lotStatusLabel(batch ?? {})}
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
              <span className="text-xs text-slate-400 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Người bán</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{batch?.inventory?.product?.seller?.sellerProfile?.displayName ?? batch?.inventory?.product?.seller?.fullName ?? '---'}</span>
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
            <ShieldCheck className={`w-8 h-8 mb-2 ${batch?.blockchainSynced ? 'text-emerald-500' : 'text-amber-500'}`} />
            <span className={`text-sm font-medium ${batch?.blockchainSynced ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {batch?.blockchainSynced ? 'Đã xác nhận toàn bộ' : 'Đang chờ xác nhận'}
            </span>
            <span className="text-[10px] text-slate-400 mt-1">
              {batch?.blockchainConfirmedCount ?? 0}/{journeys.length} công đoạn đã xác nhận
            </span>
          </div>
        </div>

      </div>

      {shipment && (
        <div className="mx-6 mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/20 md:grid-cols-4">
          <div>
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
              <Truck className="h-3.5 w-3.5" /> Hãng vận chuyển
            </span>
            <p className="mt-1 font-bold text-slate-800 dark:text-white">
              {shipment.carrierOrganization?.name ?? 'Chưa có hãng'}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Mã vận đơn</span>
            <p className="mt-1 font-mono font-bold text-blue-700 dark:text-blue-300">
              {shipment.trackingCode ?? '---'}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Trạng thái shipment</span>
            <p className="mt-1 font-bold text-blue-700 dark:text-blue-300">
              {{
                DRAFT: 'Nháp',
                ASSIGNED: 'Đã tạo vận đơn',
                HANDED_OVER: 'Đã bàn giao hãng',
                IN_TRANSIT: 'Hãng đang vận chuyển',
                AT_DISTRIBUTOR: 'Đến điểm trung chuyển',
                AT_RETAIL: 'Đến điểm bán',
                OUT_FOR_DELIVERY: 'Đang giao cuối',
                DELIVERED: 'Đã giao',
                DELIVERY_FAILED: 'Giao thất bại',
                RETURNING: 'Đang hoàn',
                RETURNED: 'Đã hoàn',
                CANCELLED: 'Đã hủy',
              }[shipment.status ?? ''] ?? shipment.status ?? '---'}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Theo dõi từ hãng</span>
            {trackingUrl ? (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900 dark:text-blue-300"
              >
                Mở tracking <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className="mt-1 text-slate-500">Chưa cấu hình link tracking</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
