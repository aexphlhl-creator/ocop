import React from 'react';
import Link from 'next/link';
import { Button } from '../components/ui/button';
import { HelpCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex h-[80vh] w-full flex-col items-center justify-center text-center p-6">
      <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full mb-4">
        <HelpCircle className="h-10 w-10" />
      </div>
      <h1 className="text-4xl font-black text-slate-800 tracking-tight mb-2">404</h1>
      <h2 className="text-lg font-bold text-slate-700 mb-2">Trang không tồn tại</h2>
      <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
        Đường dẫn bạn yêu cầu không tồn tại hoặc đã bị gỡ bỏ khỏi hệ thống bản đồ số OCOP Việt Nam.
      </p>
      <Link href="/">
        <Button variant="primary" size="md">Trở về trang chủ</Button>
      </Link>
    </div>
  );
}
