'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  ClipboardList, CheckCircle2, FileText, History, 
  Paperclip, ArrowRight, XCircle, Printer, Truck, FileSignature, RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { GoodsReceiptModal } from '@/components/procurement/GoodsReceiptModal';

export default function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'timeline' | 'items' | 'attachments' | 'audit'>('items');
  const [isReceiving, setIsReceiving] = useState(false);

  const { data: po, isLoading } = useQuery({
    queryKey: ['po-detail', params.id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/purchase-orders/${params.id}`);
      return res.data.data;
    },
  });

  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get(`/api/v1/purchase-orders/${params.id}/export-pdf`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Yêu cầu xuất PDF thành công!');
      // In a real app, window.open(data.url) or similar
    },
    onError: () => toast.error('Lỗi khi xuất PDF'),
  });

  if (isLoading) return <div className="flex justify-center p-16"><LoadingSpinner /></div>;
  if (!po) return <div className="p-16 text-center text-slate-500">Không tìm thấy đơn mua hàng</div>;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Link href="/dashboard/procurement" className="hover:text-emerald-600">Mua sắm ERP</Link>
        <span>/</span>
        <Link href="/dashboard/procurement/orders" className="hover:text-emerald-600">Đơn mua hàng</Link>
        <span>/</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{po.code}</span>
      </div>

      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-emerald-600" /> 
            Đơn mua hàng {po.code}
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-sm font-semibold ml-2">
              {po.status}
            </span>
          </h1>
          <div className="mt-3 text-sm text-slate-500 space-y-1">
            <p><span className="font-medium">Nhà cung cấp:</span> {po.supplier?.name} ({po.supplier?.code})</p>
            <p><span className="font-medium">Kho nhận:</span> {po.warehouse?.name}</p>
            <p><span className="font-medium">Ngày tạo:</span> {new Date(po.createdAt).toLocaleString('vi-VN')}</p>
          </div>
        </div>
        
        <div className="flex flex-col gap-2 min-w-[200px]">
          <Button 
            onClick={() => exportPdfMutation.mutate()} 
            disabled={exportPdfMutation.isPending}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white flex justify-center gap-2"
          >
            <Printer className="w-4 h-4" /> Xuất PDF (Bản in)
          </Button>

          {po.status === 'DRAFT' && (
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white flex justify-center gap-2">
              <FileSignature className="w-4 h-4" /> Trình duyệt
            </Button>
          )}
          {po.status === 'SUBMITTED' && (
            <div className="flex gap-2">
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Duyệt</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">Y/C Sửa</Button>
            </div>
          )}
          {po.status === 'APPROVED' && (
            <Button 
              onClick={() => {
                 api.patch(`/api/v1/purchase-orders/${po.id}/order`).then(() => {
                   toast.success('Đã đặt hàng thành công');
                   queryClient.invalidateQueries({ queryKey: ['po-detail', params.id] });
                 });
              }}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white flex justify-center gap-2"
            >
              <Truck className="w-4 h-4" /> Đặt hàng (Phát hành PO)
            </Button>
          )}
          {['ORDERED', 'RECEIVING', 'PARTIALLY_RECEIVED'].includes(po.status) && (
            <Button 
              onClick={() => setIsReceiving(true)}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white flex justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Nhận hàng (GR)
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 px-2">
        <button onClick={() => setActiveTab('items')} className={`py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'items' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Sản phẩm & Nhận hàng</button>
        <button onClick={() => setActiveTab('timeline')} className={`py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'timeline' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Tiến độ (Timeline)</button>
        <button onClick={() => setActiveTab('attachments')} className={`py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'attachments' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Tài liệu đính kèm</button>
        <button onClick={() => setActiveTab('audit')} className={`py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'audit' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Lịch sử Audit</button>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm min-h-[400px]">
        
        {activeTab === 'items' && (
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Danh sách Sản phẩm</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Sản phẩm</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Số lượng đặt</th>
                    <th className="text-right px-4 py-3 font-semibold text-emerald-600">Đã nhận</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Đơn giá</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items?.map((item: any) => (
                    <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.product?.name || item.productId}</td>
                      <td className="px-4 py-3 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{item.receivedQuantity}</td>
                      <td className="px-4 py-3 text-right">{Number(item.unitPrice).toLocaleString()} {po.currency}</td>
                      <td className="px-4 py-3 text-right font-semibold">{(Number(item.unitPrice) * item.quantity).toLocaleString()} {po.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Note Section */}
            {po.notes && (
              <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-900/50">
                <h4 className="font-bold text-amber-800 dark:text-amber-500 mb-2">Ghi chú PO</h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">{po.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="max-w-2xl mx-auto py-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 text-center">Tiến trình xét duyệt & Mua hàng</h3>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-emerald-500 text-slate-100 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-slate-900">Tạo nháp (DRAFT)</div>
                    <time className="text-xs font-medium text-emerald-500">{new Date(po.createdAt).toLocaleDateString()}</time>
                  </div>
                  <div className="text-slate-500 text-sm">Đơn hàng được khởi tạo.</div>
                </div>
              </div>

              {po.submittedAt && (
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-500 text-slate-100 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-slate-900">Trình duyệt (SUBMITTED)</div>
                      <time className="text-xs font-medium text-blue-500">{new Date(po.submittedAt).toLocaleDateString()}</time>
                    </div>
                  </div>
                </div>
              )}

              {po.approvedAt && (
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-emerald-600 text-slate-100 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-slate-900">Đã duyệt (APPROVED)</div>
                      <time className="text-xs font-medium text-emerald-600">{new Date(po.approvedAt).toLocaleDateString()}</time>
                    </div>
                    <div className="text-slate-500 text-sm">Người duyệt: {po.approvedBy?.fullName || po.approvedById}</div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {activeTab === 'attachments' && (
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Tài liệu đính kèm</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['Báo giá (Quotation)', 'Hợp đồng (Contract)', 'Hóa đơn (Invoice)', 'Chứng nhận (Certificate)'].map((docType) => (
                <div key={docType} className="border border-slate-200 dark:border-slate-700 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                    <Paperclip className="w-5 h-5 text-slate-400 group-hover:text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{docType}</p>
                  <p className="text-xs text-slate-400 mt-1">Chưa có file</p>
                  <Button variant="outline" size="sm" className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">Tải lên</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Lịch sử Audit Log</h3>
            <div className="p-16 text-center text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
              <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Module Audit Logs chưa được tích hợp API hiển thị trên giao diện này.</p>
              <p className="text-sm mt-2">Dữ liệu Audit đã được ghi nhận trên Server thông qua AuditInterceptor.</p>
            </div>
          </div>
        )}

      </div>

      {isReceiving && (
        <GoodsReceiptModal 
          po={po} 
          onClose={() => setIsReceiving(false)} 
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['po-detail', params.id] })} 
        />
      )}
    </div>
  );
}
