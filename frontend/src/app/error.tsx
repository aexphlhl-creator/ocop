'use client';

import React, { useEffect } from 'react';
import { Button } from '../components/ui/button';
import { AlertOctagon } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-[80vh] w-full flex-col items-center justify-center text-center p-6">
      <div className="p-4 bg-red-50 text-red-500 rounded-full mb-4">
        <AlertOctagon className="h-10 w-10" />
      </div>
      <h1 className="text-xl font-bold text-slate-800 mb-2">Đã xảy ra lỗi hệ thống</h1>
      <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
        Hệ thống bản đồ số OCOP Việt Nam tạm thời gặp sự cố. Chúng tôi đang nhanh chóng xử lý.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" size="md" onClick={() => (window.location.href = '/')}>
          Về trang chủ
        </Button>
        <Button variant="primary" size="md" onClick={reset}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}
