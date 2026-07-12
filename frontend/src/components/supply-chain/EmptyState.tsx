import React from 'react';
import { PackageSearch } from 'lucide-react';
import { motion } from 'framer-motion';

export function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
    >
      <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-full mb-4">
        <PackageSearch className="w-16 h-16 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Chưa chọn Lô hàng nào</h3>
      <p className="text-sm text-slate-500 max-w-sm text-center">
        Hãy chọn một lô hàng từ danh sách bên dưới hoặc sử dụng thanh tìm kiếm để xem tổng quan, hành trình và lịch sử.
      </p>
    </motion.div>
  );
}
