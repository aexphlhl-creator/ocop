'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { SearchBox } from '../../../components/ui/search-box';
import { Pagination } from '../../../components/ui/pagination';
import { Store, Mail, Phone, MapPin, CheckCircle2 } from 'lucide-react';

const mockBusinesses = [
  {
    id: '1',
    name: 'Hợp tác xã Gốm sứ Bát Tràng',
    taxCode: '0101234567',
    email: 'contact@battrang.vn',
    phone: '0243874000',
    address: 'Xã Bát Tràng, Gia Lâm',
    province: 'Hà Nội',
    isVerified: true,
  },
  {
    id: '2',
    name: 'Doanh nghiệp chè hữu cơ Cầu Đất',
    taxCode: '6809876543',
    email: 'info@caudattea.vn',
    phone: '0263381000',
    address: 'Xã Trạm Hành, Đà Lạt',
    province: 'Lâm Đồng',
    isVerified: true,
  },
  {
    id: '3',
    name: 'Cơ sở sản xuất muối Cần Giờ Hải Nam',
    taxCode: '7905432109',
    email: 'muoicangio@hainam.com',
    phone: '0283890000',
    address: 'Xã Lý Nhơn, Cần Giờ',
    province: 'TP. Hồ Chí Minh',
    isVerified: false,
  },
];

export default function BusinessesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Chủ thể sản xuất</h1>
          <p className="text-xs text-slate-400">Các hợp tác xã, hộ kinh doanh, doanh nghiệp sản xuất OCOP</p>
        </div>

        <SearchBox value={search} onChange={setSearch} placeholder="Tìm doanh nghiệp, HTX..." />
      </div>

      {/* Grid of businesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockBusinesses.map((business) => (
          <Card key={business.id} className="hover:-translate-y-0.5 transition-all duration-300">
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 text-slate-500 border border-slate-100 rounded-lg">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 leading-snug line-clamp-1">{business.name}</h3>
                    <span className="text-[10px] font-semibold text-slate-400">MST: {business.taxCode}</span>
                  </div>
                </div>

                {business.isVerified && (
                  <Badge variant="success" className="bg-emerald-50 text-emerald-700 flex items-center gap-0.5 px-2 py-0.5 border border-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-500 text-white" />
                    Đã xác minh
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-2 text-xs border-t border-slate-50 pt-4 text-slate-400">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{business.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>{business.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate">{business.address}, {business.province}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Pagination currentPage={page} totalPages={2} onPageChange={setPage} />
    </div>
  );
}
