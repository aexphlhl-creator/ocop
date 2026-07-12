'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { 
  CalendarRange, Plus, Search, Filter, 
  MoreVertical, CheckCircle2, XCircle, MapPin, Users 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import Link from 'next/link';

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ search: '', status: '', page: 1, limit: 10 });
  const [meta, setMeta] = useState<any>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter.search) params.append('search', filter.search);
      if (filter.status) params.append('status', filter.status);
      params.append('page', filter.page.toString());
      params.append('limit', filter.limit.toString());

      const { data } = await api.get(`/api/v1/events?${params.toString()}`);
      setEvents(data.data);
      setMeta(data.meta);
    } catch (error) {
      toast.error('Lỗi khi tải danh sách sự kiện');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [filter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-slate-100 text-slate-700';
      case 'PUBLISHED': return 'bg-blue-100 text-blue-700';
      case 'ONGOING': return 'bg-emerald-100 text-emerald-700';
      case 'COMPLETED': return 'bg-violet-100 text-violet-700';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'Bản nháp';
      case 'PUBLISHED': return 'Đã xuất bản';
      case 'ONGOING': return 'Đang diễn ra';
      case 'COMPLETED': return 'Đã kết thúc';
      case 'CANCELLED': return 'Đã hủy';
      default: return status;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-emerald-600" />
            Quản lý Sự kiện & Hội chợ
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi, tạo mới và quản lý các sự kiện nông nghiệp, hội chợ OCOP
          </p>
        </div>
        <Link href="/dashboard/events/create">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-lg shadow-emerald-600/20">
            <Plus className="w-4 h-4" /> Tạo sự kiện mới
          </Button>
        </Link>
      </div>

      {/* KPI Cards Placeholder - Assume 4 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: 'Tổng sự kiện', value: meta?.total || 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { title: 'Đang diễn ra', value: events.filter(e => e.status === 'ONGOING').length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { title: 'Sắp tới', value: events.filter(e => e.status === 'PUBLISHED').length, color: 'text-violet-600', bg: 'bg-violet-50' },
          { title: 'Tổng người tham gia', value: events.reduce((acc, curr) => acc + (curr.currentParticipants || 0), 0), color: 'text-orange-600', bg: 'bg-orange-50' }
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <span className="text-slate-500 text-sm font-medium">{kpi.title}</span>
            <span className={`text-2xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Input 
            placeholder="Tìm kiếm sự kiện..." 
            className="pl-10"
            value={filter.search}
            onChange={(e: any) => setFilter(f => ({ ...f, search: e.target.value, page: 1 }))}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select 
            className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={filter.status}
            onChange={(e: any) => setFilter(f => ({ ...f, status: e.target.value, page: 1 }))}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đã xuất bản</option>
            <option value="ONGOING">Đang diễn ra</option>
            <option value="COMPLETED">Đã kết thúc</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CalendarRange className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p>Không tìm thấy sự kiện nào.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {events.map((event) => (
              <div key={event.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="flex gap-4 items-start">
                  <div className="w-24 h-24 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                    {event.coverImage ? (
                      <img src={event.coverImage} alt={event.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <CalendarRange className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Link href={`/dashboard/events/${event.id}`}>
                      <h3 className="font-bold text-slate-800 dark:text-white hover:text-emerald-600 transition-colors text-lg">
                        {event.title}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <CalendarRange className="w-4 h-4" />
                        {new Date(event.startDate).toLocaleDateString('vi-VN')} - {new Date(event.endDate).toLocaleDateString('vi-VN')}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {event.location || 'Trực tuyến'}
                      </span>
                      {event.registrationRequired && (
                        <span className="flex items-center gap-1 text-orange-600 font-medium">
                          <Users className="w-4 h-4" />
                          {event.currentParticipants} / {event.maxParticipants || '∞'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(event.status)} border-current/20`}>
                    {getStatusText(event.status)}
                  </span>
                  
                  <Link href={`/dashboard/events/${event.id}`}>
                    <Button variant="outline" size="sm">Chi tiết</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500">
            Hiển thị trang {meta.page} / {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}
            >
              Trang trước
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
