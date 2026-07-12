'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent } from '../../../../components/ui/card';
import { api } from '../../../../services/api';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const queryParams = new URLSearchParams(searchParams.toString()).toString();
        const res = await api.get(`/api/v1/payments/vnpay-return?${queryParams}`);
        
        if (res.data.data.success) {
          setStatus('success');
          setMessage(res.data.data.message);
        } else {
          setStatus('error');
          setMessage(res.data.data.message);
        }
      } catch (error) {
        setStatus('error');
        setMessage('Lỗi xác thực giao dịch');
      }
    };

    if (searchParams.toString()) {
      verifyPayment();
    }
  }, [searchParams]);

  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <Card className="text-center shadow-lg border-0 overflow-hidden">
        <CardContent className="pt-12 pb-10 flex flex-col items-center gap-6">
          {status === 'loading' && (
            <>
              <div className="w-20 h-20 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Đang xác thực thanh toán...</h2>
              <p className="text-slate-500">Vui lòng đợi trong giây lát</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-24 h-24 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-14 h-14" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">Thanh toán thành công!</h2>
              <p className="text-slate-500 text-lg">{message}</p>
              
              <div className="flex gap-4 mt-6 w-full px-4">
                <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => router.push('/products')}>
                  Mua sắm tiếp
                </Button>
                <Button className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => router.push('/dashboard/orders')}>
                  Xem đơn hàng <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-24 h-24 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-2">
                <XCircle className="w-14 h-14" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">Thanh toán thất bại!</h2>
              <p className="text-slate-500 text-lg">{message}</p>
              
              <div className="flex gap-4 mt-6 w-full px-4">
                <Button className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white" onClick={() => router.push('/products')}>
                  Quay lại cửa hàng
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckoutCallbackPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center">Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
