'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import { PackageOpen, AlertTriangle, ShieldCheck } from 'lucide-react';

export function GoodsReceiptModal({ po, onClose, onSuccess }: any) {
  const [items, setItems] = useState(() =>
    po.items.map((item: any) => ({
      productId: item.productId,
      name: item.product?.name || item.productId,
      orderedQuantity: item.quantity,
      alreadyReceived: item.receivedQuantity,
      remainingQuantity: item.quantity - item.receivedQuantity,
      quantity: item.quantity - item.receivedQuantity, // Default to receiving remaining
      rejectedQuantity: 0,
      damagedQuantity: 0,
      qualityStatus: 'PENDING',
      rejectionReason: '',
      expiryDate: '',
    }))
  );

  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        purchaseOrderId: po.id,
        notes,
        items: items
          .filter((i: any) => i.quantity > 0)
          .map((i: any) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            rejectedQuantity: Number(i.rejectedQuantity),
            damagedQuantity: Number(i.damagedQuantity),
            qualityStatus: i.qualityStatus,
            rejectionReason: i.rejectionReason,
            expiryDate: i.expiryDate || undefined,
          })),
      };

      if (payload.items.length === 0) {
        throw new Error('Vui lòng nhập số lượng nhận cho ít nhất 1 sản phẩm');
      }

      const res = await api.post('/api/v1/goods-receipt', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Nhập kho thành công!');
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Có lỗi xảy ra khi nhập kho');
    },
  });

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Nhận hàng - PO: ${po.code}`} className="max-w-4xl w-full">
      <div className="space-y-6 mt-4">
        
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50 flex gap-3">
          <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0 mt-1" />
          <div>
            <h4 className="font-bold text-blue-800 dark:text-blue-400">Kiểm định chất lượng (QA/QC)</h4>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              Hệ thống ERP yêu cầu kiểm tra chất lượng. Số lượng hàng hỏng/từ chối sẽ được ghi nhận riêng biệt và không được tính vào tồn kho (Inventory). 
              Chỉ hàng hóa đạt tiêu chuẩn mới được tạo Batch và đẩy lên Blockchain Supply Chain.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 font-semibold">Sản phẩm</th>
                <th className="px-3 py-2 font-semibold w-24">Cần nhận</th>
                <th className="px-3 py-2 font-semibold w-24">SL Nhận</th>
                <th className="px-3 py-2 font-semibold w-24 text-rose-600">Từ chối</th>
                <th className="px-3 py-2 font-semibold w-24 text-amber-600">Hư hỏng</th>
                <th className="px-3 py-2 font-semibold w-32">Kiểm định</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => {
                if (item.remainingQuantity <= 0) return null;
                const netQty = item.quantity - (Number(item.rejectedQuantity) + Number(item.damagedQuantity));

                return (
                  <tr key={item.productId} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{item.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Input 
                          type="date" 
                          className="h-7 text-xs w-32" 
                          value={item.expiryDate}
                          onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                          placeholder="Hạn sử dụng"
                          title="Hạn sử dụng (Tùy chọn)"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500 font-semibold text-center">{item.remainingQuantity}</td>
                    <td className="px-3 py-3">
                      <Input 
                        type="number" 
                        min={0} 
                        max={item.remainingQuantity}
                        className="h-8 text-center font-bold text-emerald-600" 
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Input 
                        type="number" 
                        min={0} 
                        className="h-8 text-center text-rose-600" 
                        value={item.rejectedQuantity}
                        onChange={(e) => handleItemChange(idx, 'rejectedQuantity', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Input 
                        type="number" 
                        min={0} 
                        className="h-8 text-center text-amber-600" 
                        value={item.damagedQuantity}
                        onChange={(e) => handleItemChange(idx, 'damagedQuantity', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3 space-y-1">
                      <select
                        className="w-full h-8 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"
                        value={item.qualityStatus}
                        onChange={(e) => handleItemChange(idx, 'qualityStatus', e.target.value)}
                      >
                        <option value="PENDING">Chờ kiểm</option>
                        <option value="PASSED">Đạt (Passed)</option>
                        <option value="FAILED">Lỗi (Failed)</option>
                      </select>
                      {item.qualityStatus === 'FAILED' && (
                        <Input 
                          placeholder="Lý do từ chối..." 
                          className="h-7 text-xs" 
                          value={item.rejectionReason}
                          onChange={(e) => handleItemChange(idx, 'rejectionReason', e.target.value)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-2">Ghi chú phiếu nhập kho</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Ghi chú người nhận hàng..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Hủy</Button>
          <Button 
            onClick={() => mutation.mutate()} 
            disabled={mutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
          >
            {mutation.isPending ? <LoadingSpinner size="sm" /> : <PackageOpen className="w-4 h-4" />}
            Xác nhận Nhập kho
          </Button>
        </div>
      </div>
    </Modal>
  );
}
