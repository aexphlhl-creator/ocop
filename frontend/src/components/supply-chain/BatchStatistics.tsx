import React from 'react';
import { motion } from 'framer-motion';
import { Boxes, PackagePlus, Truck, CheckCircle2, ShieldCheck, Clock, AlertTriangle, Search, Handshake } from 'lucide-react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
  delay?: number;
}

function StatCard({ icon, label, value, color, sub, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
    >
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{value ?? '–'}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[150px]">{sub}</p>}
      </div>
    </motion.div>
  );
}

interface BatchStatisticsProps {
  stats?: {
    totalBatches?: number;
    activeBatches?: number;
    releasedBatches?: number;
    inProgressBatches?: number;
    awaitingCarrierPickup?: number;
    completedBatches?: number;
    blockchainSynced?: number;
    expiringSoon?: number;
    failedQcBatches?: number;
    pendingInspection?: number;
  };
  isLoading: boolean;
}

export function BatchStatistics({ stats, isLoading }: BatchStatisticsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-4 animate-pulse">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 h-24 border border-slate-100 dark:border-slate-800" />
        ))}
      </div>
    );
  }

  // Map backend stats to the UI requirements
  // stats contains: activeBatches, inProgressBatches, completedBatches, failedQcBatches, totalBatches
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3">
      <StatCard
        icon={<Boxes className="w-5 h-5 text-indigo-600" />}
        label="Total"
        value={stats?.totalBatches || 0}
        color="bg-indigo-50"
        sub="Tổng số lô hàng"
        delay={0.05}
      />
      <StatCard
        icon={<PackagePlus className="w-5 h-5 text-emerald-600" />}
        label="Được xuất bán"
        value={stats?.releasedBatches || 0}
        color="bg-emerald-50"
        sub="Đã phát hành, còn hạn"
        delay={0.1}
      />
      <StatCard
        icon={<Handshake className="w-5 h-5 text-sky-600" />}
        label="Chờ lấy hàng"
        value={stats?.awaitingCarrierPickup || 0}
        color="bg-sky-50"
        sub="Đã bàn giao vận đơn"
        delay={0.15}
      />
      <StatCard
        icon={<Truck className="w-5 h-5 text-blue-600" />}
        label="Đang vận chuyển"
        value={stats?.inProgressBatches || 0}
        color="bg-blue-50"
        sub="Đang vận chuyển"
        delay={0.2}
      />
      <StatCard
        icon={<CheckCircle2 className="w-5 h-5 text-teal-600" />}
        label="Đã giao"
        value={stats?.completedBatches || 0}
        color="bg-teal-50"
        sub="Lô có chuyến đã giao"
        delay={0.25}
      />
      <StatCard
        icon={<ShieldCheck className="w-5 h-5 text-purple-600" />}
        label="Đã xác nhận"
        value={stats?.blockchainSynced || 0}
        color="bg-purple-50"
        sub="Blockchain verified"
        delay={0.3}
      />
      <StatCard
        icon={<Clock className="w-5 h-5 text-orange-500" />}
        label="Sắp hết hạn"
        value={stats?.expiringSoon || 0}
        color="bg-orange-50"
        sub="Sắp hết hạn (<30d)"
        delay={0.35}
      />
      <StatCard
        icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
        label="Không đạt QC"
        value={stats?.failedQcBatches || 0}
        color="bg-red-50"
        sub="Lỗi chất lượng"
        delay={0.4}
      />
      <StatCard
        icon={<Search className="w-5 h-5 text-slate-600" />}
        label="Chờ kiểm định"
        value={stats?.pendingInspection || 0}
        color="bg-slate-100"
        sub="Chờ kiểm định"
        delay={0.45}
      />
    </div>
  );
}
