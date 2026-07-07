'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { SearchBox } from '../../../components/ui/search-box';
import { Pagination } from '../../../components/ui/pagination';
import { Calendar, User } from 'lucide-react';

const mockNews = [
  {
    id: '1',
    title: 'Hội nghị xúc tiến thương mại sản phẩm OCOP khu vực phía Bắc năm 2026',
    summary: 'Hội nghị quy tụ hơn 200 gian hàng OCOP đạt tiêu chuẩn từ 3 đến 5 sao tham gia trưng bày và kết nối chuỗi cung ứng sản phẩm hữu cơ...',
    thumbnail: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80',
    createdAt: '05/07/2026',
    author: 'Ban chỉ đạo OCOP',
  },
  {
    id: '2',
    title: 'Thúc đẩy số hóa đặc sản OCOP thông qua nền tảng Bản đồ số OCOP Việt Nam',
    summary: 'Bộ Nông nghiệp công bố đề án tích hợp dữ liệu vùng trồng và số hóa toàn bộ hệ thống cơ sở dữ liệu quốc gia lên bản đồ trực quan...',
    thumbnail: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=400&q=80',
    createdAt: '01/07/2026',
    author: 'Văn phòng Điều phối',
  },
];

export default function NewsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Tin tức nông sản & OCOP</h1>
          <p className="text-xs text-slate-400">Tin tức, hoạt động xúc tiến thương mại nông sản OCOP Việt Nam</p>
        </div>

        <SearchBox value={search} onChange={setSearch} placeholder="Tìm tin tức, sự kiện..." />
      </div>

      {/* Grid of news */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {mockNews.map((article) => (
          <Card key={article.id} className="group overflow-hidden flex flex-col sm:flex-row">
            <div className="relative h-48 w-full sm:w-48 bg-slate-100 shrink-0 overflow-hidden">
              <img
                src={article.thumbnail}
                alt={article.title}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <CardContent className="p-5 flex flex-col justify-between gap-3 flex-grow">
              <div className="flex flex-col gap-1.5">
                <h3 className="font-bold text-sm text-slate-800 leading-snug group-hover:text-emerald-600 transition-colors line-clamp-2">
                  {article.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {article.summary}
                </p>
              </div>

              <div className="flex items-center gap-4 text-[10px] text-slate-400 font-semibold border-t border-slate-50 pt-3">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {article.createdAt}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {article.author}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Pagination currentPage={page} totalPages={1} onPageChange={setPage} />
    </div>
  );
}
