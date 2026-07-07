'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { SearchBox } from '../../../components/ui/search-box';
import { Pagination } from '../../../components/ui/pagination';
import { Button } from '../../../components/ui/button';
import { Star, MapPin } from 'lucide-react';

const mockProducts = [
  {
    id: '1',
    name: 'Cà phê Arabica Cầu Đất',
    price: 150000,
    unit: 'Túi 250g',
    ocopLevel: 5,
    businessName: 'HTX Cà phê Đà Lạt',
    province: 'Lâm Đồng',
    imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: '2',
    name: 'Hồng sấy treo gió Đà Lạt',
    price: 280000,
    unit: 'Hộp 500g',
    ocopLevel: 4,
    businessName: 'Doanh nghiệp Hồng Việt',
    province: 'Lâm Đồng',
    imageUrl: 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: '3',
    name: 'Bình trà gốm sứ Bát Tràng',
    price: 450000,
    unit: 'Bộ',
    ocopLevel: 5,
    businessName: 'Xưởng Gốm Bát Tràng Hải Nam',
    province: 'Hà Nội',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: '4',
    name: 'Mỳ gạo sạch Hùng Lô',
    price: 35000,
    unit: 'Gói 500g',
    ocopLevel: 4,
    businessName: 'Hợp tác xã Mỳ gạo Hùng Lô',
    province: 'Phú Thọ',
    imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
  },
];

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Sản phẩm OCOP</h1>
          <p className="text-xs text-slate-400">Danh sách đặc sản địa phương đạt chứng nhận OCOP quốc gia</p>
        </div>

        <SearchBox value={search} onChange={setSearch} placeholder="Tìm sản phẩm, chè, cafe..." />
      </div>

      {/* Filters and List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Filters - Skeleton */}
        <div className="flex flex-col gap-6 p-5 bg-white border border-slate-100 rounded-xl shadow-sm h-fit">
          <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-3">Bộ lọc sản phẩm</h3>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-400">Phân hạng sao</span>
            <div className="flex flex-col gap-1.5 mt-1">
              {['5 sao OCOP', '4 sao OCOP', '3 sao OCOP'].map((level) => (
                <label key={level} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">
                  <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500" />
                  {level}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-400">Địa phương</span>
            <select className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-600">
              <option>Tất cả tỉnh thành</option>
              <option>Lâm Đồng</option>
              <option>Hà Nội</option>
              <option>Phú Thọ</option>
            </select>
          </div>

          <Button variant="primary" size="sm" className="w-full">Áp dụng lọc</Button>
        </div>

        {/* Right List */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockProducts.map((product) => (
              <Card key={product.id} className="group overflow-hidden">
                <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 flex gap-1">
                    <Badge variant="success" className="bg-emerald-600 text-white flex items-center gap-0.5 px-2 py-0.5">
                      {product.ocopLevel} <Star className="h-3 w-3 fill-current" />
                    </Badge>
                  </div>
                </div>
                <CardContent className="pt-4 flex flex-col gap-2">
                  <h3 className="font-bold text-sm text-slate-800 line-clamp-1 group-hover:text-emerald-600 transition-colors">
                    {product.name}
                  </h3>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>{product.unit}</span>
                    <span className="font-bold text-emerald-600 text-sm">
                      {product.price.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <div className="border-t border-slate-50 pt-2.5 mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[120px]">{product.businessName}</span>
                    <span className="flex items-center gap-0.5 shrink-0 text-slate-500">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      {product.province}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination currentPage={page} totalPages={3} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
