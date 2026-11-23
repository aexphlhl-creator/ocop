'use client';

import { AssetImage } from '@/components/ui/asset-image';

import React from 'react';
import type { OcopEvent } from '@/types/events';
import type { ApiResponse } from '@/types/catalog';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { LoadingSpinner } from '../ui/loading-spinner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { CalendarRange, Calendar, MapPin, ArrowRight, Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

export const EventsWidget: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'EVENT_COORDINATOR';

  const { data: recentEvents = [], isLoading } = useQuery({
    queryKey: ['dashboardRecentEvents', user?.id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<OcopEvent[]>>('/api/v1/events', { params: { page: 1, limit: 3 } });
      return res.data.data;
    },
    staleTime: 3 * 60 * 1000,
  });

  return (
    <Card className="rounded-[2rem] border-white dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-none overflow-hidden">
      <CardHeader className="p-6 md:p-8 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600">
            <CalendarRange className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
              Sự kiện &amp; Hội chợ Xúc tiến Thương mại OCOP
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Lịch trình tuần lễ nông sản, hội chợ vùng miền và kết nối giao thương trực tiếp
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/dashboard/events/create"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> Tạo sự kiện mới
            </Link>
          )}
          <Link
            href="/dashboard/events"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
          >
            Quản lý tất cả <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-6 md:p-8">
        {isLoading ? (
          <div className="py-12 flex justify-center"><LoadingSpinner size="md" /></div>
        ) : recentEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {recentEvents.map((evt) => {
              const isOngoing = evt.status === 'ONGOING';
              const isPublished = evt.status === 'PUBLISHED';
              const startDateStr = evt.startDate ? new Date(evt.startDate).toLocaleDateString('vi-VN') : '';
              const endDateStr = evt.endDate ? new Date(evt.endDate).toLocaleDateString('vi-VN') : '';

              return (
                <div
                  key={evt.id}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all duration-200 p-4 relative overflow-hidden"
                >
                  <div>
                    <div className="relative h-36 w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3.5">
                      {evt.banner || evt.coverImage ? (
                        <AssetImage
                          src={evt.banner || evt.coverImage || ''}
                          alt={evt.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
                          <CalendarRange className="h-10 w-10 text-emerald-500/50" />
                        </div>
                      )}
                      <div className="absolute top-2.5 left-2.5">
                        {isOngoing ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Đang diễn ra
                          </span>
                        ) : isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-md">
                            Sắp diễn ra
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-white">
                            {evt.status === 'COMPLETED' ? 'Đã kết thúc' : evt.status === 'DRAFT' ? 'Bản nháp' : evt.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={'/dashboard/events/' + evt.id}
                      className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 line-clamp-2 leading-snug transition-colors mb-2 block"
                    >
                      {evt.title}
                    </Link>

                    <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>{startDateStr} - {endDateStr}</span>
                      </div>
                      {evt.location && (
                        <div className="flex items-center gap-1.5 line-clamp-1">
                          <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{evt.location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3.5 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                      {evt.organizer || 'Ban tổ chức OCOP'}
                    </span>
                    <Link
                      href={'/dashboard/events/' + evt.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 shrink-0"
                    >
                      Chi tiết <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-slate-400 space-y-2">
            <CalendarRange className="h-10 w-10 mx-auto text-slate-300" />
            <p>Chưa có sự kiện hoặc hội chợ nào được lên lịch.</p>
            {isAdmin && (
              <Link href="/dashboard/events/create" className="inline-block mt-2">
                <span className="text-xs text-emerald-600 hover:underline font-semibold">
                  + Tạo sự kiện mới ngay
                </span>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
