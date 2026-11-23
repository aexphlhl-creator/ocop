'use client';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useState } from 'react';
import type { OcopEvent } from '@/types/events';
import type { ApiResponse, QueryParams } from '@/types/catalog';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { motion } from 'framer-motion';
import {
  CalendarRange, MapPin, Users, Clock, Search,
  CalendarCheck, ExternalLink, Sparkles, ArrowRight
} from 'lucide-react';
import { LoadingSpinner } from '../../../components/ui/loading-spinner';
import { EmptyState } from '../../../components/ui/empty-state';

export default function PublicEventsPage() {
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['publicEvents', activeTab, search],
    queryFn: async () => {
      const params: QueryParams = { page: 1, limit: 20 };
      if (activeTab !== 'ALL') params.status = activeTab;
      if (search) params.search = search;
      const res = await api.get<ApiResponse<OcopEvent[]>>('/api/v1/events', { params });
      return res.data.data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const events = eventsData || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ONGOING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm shadow-emerald-500/25 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white"></span>
            Đang diễn ra
          </span>
        );
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500 text-white shadow-sm shadow-blue-500/25">
            <CalendarCheck className="w-3.5 h-3.5" />
            Sắp diễn ra
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Đã kết thúc
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Hero Section */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-950 text-white p-8 md:p-12 mb-10 shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.25),transparent_60%)] pointer-events-none" />
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-emerald-300 text-xs font-bold tracking-wider uppercase mb-4 border border-white/15">
              <Sparkles className="w-3.5 h-3.5" />
              Sự kiện & Hội chợ OCOP 2026
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-4">
              Kết nối & Lan tỏa<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-amber-300">
                Nông sản Việt Nam
              </span>
            </h1>
            <p className="text-emerald-100/90 text-sm sm:text-base leading-relaxed mb-6">
              Lịch trình các tuần lễ xúc tiến thương mại, hội chợ OCOP vùng miền, triển lãm nông sản và ngày hội kết nối cung cầu trên toàn quốc.
            </p>
          </div>
        </div>

        {/* Filter & Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'ONGOING', label: 'Đang diễn ra' },
              { id: 'PUBLISHED', label: 'Sắp diễn ra' },
              { id: 'COMPLETED', label: 'Đã diễn ra' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm sự kiện, hội chợ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Events Grid */}
        {isLoading ? (
          <div className="py-24 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<CalendarRange className="h-10 w-10 text-slate-400" />}
            title="Chưa có sự kiện nào"
            description="Hiện tại chưa có sự kiện hoặc hội chợ nào phù hợp với bộ lọc."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event, idx) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="group flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                {/* Image Cover */}
                <div className="relative h-48 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  {event.coverImage || event.banner ? (
                    <AssetImage
                      src={event.coverImage || event.banner || ''}
                      alt={event.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-200 dark:from-emerald-950 dark:to-teal-950 text-emerald-600 dark:text-emerald-400">
                      <CalendarRange className="w-12 h-12" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute top-3 left-3">
                    {getStatusBadge(event.status)}
                  </div>
                  {event.eventType && (
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 backdrop-blur-sm shadow-sm">
                      {event.eventType}
                    </div>
                  )}
                </div>

                {/* Body Content */}
                <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <Link href={`/events/${event.slug || event.id}`}>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {event.title}
                      </h3>
                    </Link>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {event.summary || event.description}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-4 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        {new Date(event.startDate).toLocaleDateString('vi-VN')} – {new Date(event.endDate).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">{event.location || 'Trực tuyến / Toàn quốc'}</span>
                    </div>

                    {event.registrationRequired && (
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-semibold">
                          <Users className="w-3.5 h-3.5" />
                          {event.currentParticipants || 0} / {event.maxParticipants || '∞'} người tham gia
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Link
                      href={`/events/${event.slug || event.id}`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm"
                    >
                      Xem chi tiết sự kiện
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
