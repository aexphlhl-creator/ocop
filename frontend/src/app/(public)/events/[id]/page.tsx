'use client';

import { AssetImage } from '@/components/ui/asset-image';

import React from 'react';
import type { OcopEvent } from '@/types/events';
import type { ApiResponse } from '@/types/catalog';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../services/api';
import { Button } from '../../../../components/ui/button';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { useAuthStore } from '../../../../stores/auth.store';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  CalendarRange, Calendar, MapPin, Users, Phone, Mail,
  Clock, ArrowLeft, Share2, CheckCircle2, CalendarCheck,
  Building2, Sparkles, ExternalLink, ShieldCheck, ArrowRight
} from 'lucide-react';

export default function PublicEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuthStore();

  const isAdminOrCoordinator = user?.role === 'ADMIN' || user?.role === 'EVENT_COORDINATOR';

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['publicEventDetail', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<OcopEvent>>('/api/v1/events/' + id);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: relatedEvents = [] } = useQuery({
    queryKey: ['publicRelatedEvents', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<OcopEvent[]>>('/api/v1/events', { params: { page: 1, limit: 4 } });
      return res.data.data.filter((e) => e.id !== id && e.slug !== id).slice(0, 3);
    },
    enabled: !!id,
  });

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Đã sao chép liên kết sự kiện vào bộ nhớ tạm!');
    } catch {
      toast.error('Không thể sao chép liên kết. Bạn có thể sao chép từ thanh địa chỉ.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <CalendarRange className="h-16 w-16 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Không tìm thấy sự kiện</h2>
        <p className="text-sm text-slate-500 max-w-md">
          Sự kiện hoặc hội chợ này không tồn tại, đã bị gỡ hoặc liên kết không chính xác.
        </p>
        <Button onClick={() => router.push('/events')} className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2">
          Quay lại danh sách sự kiện
        </Button>
      </div>
    );
  }

  const isOngoing = event.status === 'ONGOING';
  const isPublished = event.status === 'PUBLISHED';
  const isCompleted = event.status === 'COMPLETED';

  const startDate = event.startDate ? new Date(event.startDate).toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  }) : '';
  const endDate = event.endDate ? new Date(event.endDate).toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  }) : '';
  const regDeadline = event.registrationDeadline ? new Date(event.registrationDeadline).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }) : '';

  const maxPart = event.maxParticipants || 0;
  const currPart = event.currentParticipants || 0;
  const partPercent = maxPart > 0 ? Math.min(100, Math.round((currPart / maxPart) * 100)) : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Navigation & Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link href="/" className="hover:text-emerald-600 transition-colors">Trang chủ</Link>
            <span>/</span>
            <Link href="/events" className="hover:text-emerald-600 transition-colors">Sự kiện & Hội chợ</Link>
            <span>/</span>
            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[200px] sm:max-w-xs">{event.title}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/events')}
              className="gap-2 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Tất cả sự kiện
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2 text-xs"
            >
              <Share2 className="w-3.5 h-3.5" /> Chia sẻ
            </Button>
            {isAdminOrCoordinator && (
              <Link href={'/dashboard/events/' + event.id}>
                <Button size="sm" className="gap-2 text-xs bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Quản trị sự kiện
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Hero Header Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {/* Banner Image */}
          <div className="relative h-64 sm:h-80 md:h-96 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            {event.banner || event.coverImage ? (
              <AssetImage
                src={event.banner || event.coverImage || ''}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-800 to-slate-950 text-white p-6 text-center">
                <CalendarRange className="w-16 h-16 text-emerald-300 mb-3" />
                <h3 className="text-xl font-bold max-w-lg">{event.title}</h3>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            
            {/* Badges on Banner */}
            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3 text-white">
              <div className="flex flex-wrap items-center gap-2">
                {isOngoing && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Đang diễn ra
                  </span>
                )}
                {isPublished && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500 text-white shadow-lg">
                    <CalendarCheck className="w-3.5 h-3.5" /> Sắp diễn ra
                  </span>
                )}
                {isCompleted && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-700 text-white">
                    Đã kết thúc
                  </span>
                )}
                {event.eventType && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/20">
                    {event.eventType}
                  </span>
                )}
                {event.isFeatured && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-lg">
                    <Sparkles className="w-3.5 h-3.5" /> Tiêu biểu quốc gia
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Title and Intro */}
          <div className="p-6 sm:p-10 border-b border-slate-100 dark:border-slate-800">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
              {event.title}
            </h1>
            {event.summary && (
              <p className="mt-3 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                {event.summary}
              </p>
            )}
          </div>
        </div>

        {/* Content Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Event Body Content */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Description Section */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-emerald-600" />
                Giới thiệu sự kiện &amp; Hội chợ
              </h2>
              <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed space-y-4 text-sm sm:text-base whitespace-pre-line">
                {event.description || 'Chưa có nội dung mô tả chi tiết cho sự kiện này.'}
              </div>
            </div>

            {/* Timeline & Important Milestones */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Lịch trình tổ chức
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                    Ngày khai mạc
                  </span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
                    {startDate}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider block mb-1">
                    Ngày bế mạc
                  </span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
                    {endDate}
                  </p>
                </div>

                {regDeadline && (
                  <div className="sm:col-span-2 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-0.5">
                        Hạn chót đăng ký gian hàng / tham dự
                      </span>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {regDeadline}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 px-3 py-1 bg-white dark:bg-slate-900 rounded-full border border-amber-200 dark:border-amber-800">
                      Ưu tiên chủ thể OCOP
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Location & Map Section */}
            {event.location && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                  Địa điểm tổ chức
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                  {event.location}
                </p>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 mt-2"
                >
                  Xem vị trí trên Bản đồ số OCOP <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>

          {/* Right Column: Quick Info & Registration Action */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm sticky top-24 space-y-6">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">
                Thông tin tham dự
              </h3>

              <div className="space-y-4 text-xs sm:text-sm">
                <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                  <Building2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-[11px] text-slate-400 font-medium">Đơn vị tổ chức</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{event.organizer || 'Văn phòng Điều phối OCOP'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                  <Calendar className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-[11px] text-slate-400 font-medium">Thời gian diễn ra</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {event.startDate ? new Date(event.startDate).toLocaleDateString('vi-VN') : ''} - {event.endDate ? new Date(event.endDate).toLocaleDateString('vi-VN') : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-[11px] text-slate-400 font-medium">Địa điểm</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{event.location || 'Toàn quốc'}</span>
                  </div>
                </div>

                {event.contactPhone && (
                  <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Hotline hỗ trợ</span>
                      <a href={'tel:' + event.contactPhone} className="font-semibold text-emerald-600 hover:underline">
                        {event.contactPhone}
                      </a>
                    </div>
                  </div>
                )}

                {event.contactEmail && (
                  <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                    <Mail className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Email liên hệ</span>
                      <a href={'mailto:' + event.contactEmail} className="font-semibold text-emerald-600 hover:underline">
                        {event.contactEmail}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Participants status */}
              {maxPart > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">Số lượng đăng ký</span>
                    <span className="text-emerald-600">{currPart} / {maxPart}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: partPercent + '%' }}
                    />
                  </div>
                </div>
              )}

              {/* Registration Action */}
              <div className="pt-2 space-y-3">
                {!isCompleted && event.status !== 'CANCELLED' && (event.contactEmail || event.contactPhone) ? (
                  <a
                    href={event.contactEmail ? `mailto:${event.contactEmail}?subject=${encodeURIComponent(`Đăng ký tham gia ${event.title}`)}` : `tel:${event.contactPhone}`}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-600/25 transition-all text-sm"
                  >
                    Liên hệ ban tổ chức để đăng ký
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">{isCompleted ? 'Sự kiện đã kết thúc' : event.status === 'CANCELLED' ? 'Sự kiện đã hủy' : 'Ban tổ chức chưa cung cấp thông tin đăng ký.'}</p>
                )}

                <Button
                  variant="outline"
                  onClick={handleShare}
                  className="w-full rounded-2xl text-xs gap-2"
                >
                  <Share2 className="w-3.5 h-3.5" /> Chia sẻ sự kiện với đối tác
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Related Events Section */}
        {relatedEvents.length > 0 && (
          <div className="pt-12 border-t border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Các sự kiện &amp; Hội chợ khác
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Khám phá thêm các chương trình xúc tiến thương mại nông nghiệp đang mở
                </p>
              </div>
              <Link
                href="/events"
                className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
              >
                Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="group flex flex-col justify-between bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all p-5"
                >
                  <div>
                    <div className="relative h-40 w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-4">
                      {evt.banner || evt.coverImage ? (
                        <AssetImage
                          src={evt.banner || evt.coverImage || ''}
                          alt={evt.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20">
                          <CalendarRange className="w-10 h-10" />
                        </div>
                      )}
                    </div>

                    <Link
                      href={'/events/' + (evt.slug || evt.id)}
                      className="font-bold text-base text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 line-clamp-2 leading-snug transition-colors mb-2 block"
                    >
                      {evt.title}
                    </Link>

                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                      {evt.summary || evt.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 truncate max-w-[150px]">
                      {evt.location || 'Toàn quốc'}
                    </span>
                    <Link
                      href={'/events/' + (evt.slug || evt.id)}
                      className="font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      Xem <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
