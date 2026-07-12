'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, CalendarRange, MapPin, Users, Globe, Lock, 
  Mail, Phone, Clock, FileEdit, Trash2, CheckCircle2, PlayCircle, XCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import Link from 'next/link';

export default function EventDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchEvent = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/api/v1/events/${id}`);
      setEvent(data);
    } catch (error) {
      toast.error('Lỗi khi tải chi tiết sự kiện');
      router.push('/dashboard/events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchEvent();
  }, [id]);

  const handleStatusChange = async (action: string) => {
    if (!confirm(`Bạn có chắc chắn muốn chuyển trạng thái này?`)) return;
    try {
      setActionLoading(true);
      await api.patch(`/api/v1/events/${id}/${action}`);
      toast.success('Chuyển trạng thái thành công');
      fetchEvent();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi khi chuyển trạng thái');
    } finally {
      setActionLoading(false);
    }
  };

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

  if (loading) {
    return <div className="p-12 flex justify-center"><LoadingSpinner size="lg" /></div>;
  }

  if (!event) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/events">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{event.title}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(event.status)} border-current/20`}>
                {getStatusText(event.status)}
              </span>
            </div>
            <p className="text-slate-500 mt-1 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" /> Tạo lúc: {new Date(event.createdAt).toLocaleString('vi-VN')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {event.status === 'DRAFT' && (
            <Button onClick={() => handleStatusChange('publish')} disabled={actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Globe className="w-4 h-4 mr-2" /> Xuất bản
            </Button>
          )}
          {event.status === 'PUBLISHED' && (
            <Button onClick={() => handleStatusChange('ongoing')} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <PlayCircle className="w-4 h-4 mr-2" /> Bắt đầu Sự kiện
            </Button>
          )}
          {event.status === 'ONGOING' && (
            <Button onClick={() => handleStatusChange('completed')} disabled={actionLoading} className="bg-violet-600 hover:bg-violet-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Kết thúc Sự kiện
            </Button>
          )}
          {['DRAFT', 'PUBLISHED'].includes(event.status) && (
            <Button onClick={() => handleStatusChange('cancel')} disabled={actionLoading} variant="destructive">
              <XCircle className="w-4 h-4 mr-2" /> Hủy
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            {event.coverImage ? (
              <img src={event.coverImage} alt={event.title} className="w-full h-64 object-cover" />
            ) : (
              <div className="w-full h-64 bg-slate-100 flex items-center justify-center border-b">
                <CalendarRange className="w-16 h-16 text-slate-300" />
              </div>
            )}
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Nội dung chi tiết</h2>
              <div className="prose max-w-none dark:prose-invert">
                <p className="text-lg font-medium text-slate-600 dark:text-slate-300 mb-4">{event.description}</p>
                <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                  {event.content || 'Chưa có nội dung chi tiết.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Info */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <h3 className="font-bold text-lg border-b pb-2">Thông tin Sự kiện</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CalendarRange className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Thời gian</p>
                  <p className="text-sm text-slate-600">
                    Bắt đầu: {new Date(event.startDate).toLocaleString('vi-VN')}
                  </p>
                  <p className="text-sm text-slate-600">
                    Kết thúc: {new Date(event.endDate).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Địa điểm</p>
                  <p className="text-sm text-slate-600">{event.location || 'Trực tuyến'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                {event.isPublic ? <Globe className="w-5 h-5 text-slate-400 mt-0.5" /> : <Lock className="w-5 h-5 text-slate-400 mt-0.5" />}
                <div>
                  <p className="font-medium text-sm">Hiển thị</p>
                  <p className="text-sm text-slate-600">{event.isPublic ? 'Công khai' : 'Nội bộ'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <h3 className="font-bold text-lg border-b pb-2">Đăng ký & Liên hệ</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Người tham gia</p>
                  <p className="text-sm text-slate-600">
                    {event.registrationRequired 
                      ? `${event.currentParticipants || 0} / ${event.maxParticipants || 'Không giới hạn'}`
                      : 'Không yêu cầu đăng ký'
                    }
                  </p>
                </div>
              </div>

              {(event.contactEmail || event.contactPhone) && (
                <>
                  <div className="border-t pt-4">
                    <p className="font-medium text-sm mb-2">Thông tin liên hệ</p>
                    {event.contactEmail && (
                      <p className="text-sm text-slate-600 flex items-center gap-2 mb-1">
                        <Mail className="w-4 h-4" /> {event.contactEmail}
                      </p>
                    )}
                    {event.contactPhone && (
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <Phone className="w-4 h-4" /> {event.contactPhone}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
