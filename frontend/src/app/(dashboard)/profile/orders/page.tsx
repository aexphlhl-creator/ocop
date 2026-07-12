'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Package, Search } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import { OrderTimeline } from '../../../../components/ui/order-timeline';
import { Modal } from '../../../../components/ui/modal';

export default function MyOrdersPage() {
  const { user } = useAuthStore();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const res = await api.get('/api/v1/orders/my');
      return res.data.data;
    },
    enabled: !!user,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="default" className="bg-amber-100 text-amber-700">Chờ xác nhận</Badge>;
      case 'PROCESSING': return <Badge variant="default" className="bg-blue-100 text-blue-700">Đang chuẩn bị hàng</Badge>;
      case 'SHIPPED': return <Badge variant="default" className="bg-indigo-100 text-indigo-700">Đang giao</Badge>;
      case 'DELIVERED': return <Badge variant="success">Đã giao thành công</Badge>;
      case 'CANCELLED': return <Badge variant="error">Đã hủy</Badge>;
      default: return <Badge variant="default">{status}</Badge>;
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Đơn hàng của tôi</h1>
        <p className="text-sm text-slate-500 mt-1">Quản lý và theo dõi tiến trình các đơn hàng bạn đã đặt.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        {orders.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title="Chưa có đơn hàng nào"
            description="Bạn chưa đặt mua sản phẩm nào trên hệ thống."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order: any) => (
              <div key={order.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">Mã đơn: {order.id.slice(0, 8).toUpperCase()}</span>
                    {getStatusBadge(order.status)}
                  </div>
                  <span className="text-sm text-slate-500">Cửa hàng: <span className="font-medium text-emerald-600">{order.business?.name}</span></span>
                  <span className="text-sm text-slate-500">Ngày đặt: {new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-1">
                    {order.items.map((i: any) => `${i.quantity}x ${i.product.name}`).join(', ')}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-lg font-bold text-emerald-600">{Number(order.totalAmount).toLocaleString('vi-VN')} đ</span>
                  <button className="text-sm font-medium text-blue-600 hover:underline">Xem chi tiết & Hành trình</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title="Chi tiết đơn hàng">
        {selectedOrder && (
          <div className="flex flex-col gap-6 mt-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Hành trình đơn hàng</h3>
              <OrderTimeline trackingHistory={selectedOrder.tracking} />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-slate-900 dark:text-white border-b pb-2 border-slate-100 dark:border-slate-800">Danh sách sản phẩm</h3>
              {selectedOrder.items.map((item: any) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <img src={item.product.images?.[0]?.imageUrl || 'https://via.placeholder.com/150'} alt={item.product.name} className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate text-slate-900 dark:text-white">{item.product.name}</p>
                    <p className="text-xs text-slate-500">{item.quantity} x {Number(item.price).toLocaleString('vi-VN')} đ</p>
                  </div>
                  <div className="font-bold text-sm text-emerald-600">
                    {(item.quantity * Number(item.price)).toLocaleString('vi-VN')} đ
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
              <span className="font-bold text-slate-900 dark:text-white">Tổng cộng</span>
              <span className="text-xl font-black text-emerald-600">{Number(selectedOrder.totalAmount).toLocaleString('vi-VN')} đ</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
