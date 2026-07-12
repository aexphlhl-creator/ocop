'use client';

import React, { useState } from 'react';
import { api } from '@/services/api';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Save, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// removed Textarea import
import { toast } from 'sonner';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';

export default function CreateEventPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    content: '',
    startDate: '',
    endDate: '',
    location: '',
    isPublic: true,
    registrationRequired: false,
    maxParticipants: '',
    contactEmail: '',
    contactPhone: ''
  });
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const generateSlug = (text: string) => {
    return text.toString().toLowerCase()
      .replace(/á|à|ả|ạ|ã|ă|ắ|ằ|ẳ|ẵ|ặ|â|ấ|ầ|ẩ|ẫ|ậ/gi, 'a')
      .replace(/é|è|ẻ|ẽ|ẹ|ê|ế|ề|ể|ễ|ệ/gi, 'e')
      .replace(/i|í|ì|ỉ|ĩ|ị/gi, 'i')
      .replace(/ó|ò|ỏ|õ|ọ|ô|ố|ồ|ổ|ỗ|ộ|ơ|ớ|ờ|ở|ỡ|ợ/gi, 'o')
      .replace(/ú|ù|ủ|ũ|ụ|ư|ứ|ừ|ử|ữ|ự/gi, 'u')
      .replace(/ý|ỳ|ỷ|ỹ|ỵ/gi, 'y')
      .replace(/đ/gi, 'd')
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      title: e.target.value,
      slug: generateSlug(e.target.value)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.startDate || !formData.endDate) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    try {
      setLoading(true);
      
      // Submit text data first
      const payload = {
        ...formData,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants) : undefined,
      };

      const { data } = await api.post('/api/v1/events', payload);
      const eventId = data.id;

      // If there's an image, upload it
      if (coverImage) {
        const formDataImg = new FormData();
        formDataImg.append('file', coverImage);
        
        // Assume an endpoint exists to upload event cover, or use a general media upload and update event
        const uploadRes = await api.post('/api/v1/media/upload', formDataImg, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        await api.patch(`/api/v1/events/${eventId}`, { coverImage: uploadRes.data.url });
      }

      toast.success('Tạo sự kiện thành công');
      router.push('/dashboard/events');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi khi tạo sự kiện');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Tạo Sự kiện mới</h1>
          <p className="text-slate-500">Điền thông tin bên dưới để tạo sự kiện hoặc hội chợ</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">Thông tin cơ bản</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tên sự kiện <span className="text-red-500">*</span></label>
              <Input placeholder="Hội chợ nông sản OCOP 2024..." value={formData.title} onChange={handleTitleChange} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Đường dẫn (Slug)</label>
              <Input value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mô tả ngắn</label>
            <textarea 
              className="w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:focus-visible:ring-slate-300"
              placeholder="Tóm tắt về sự kiện..." 
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nội dung chi tiết</label>
            <textarea 
              className="w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:focus-visible:ring-slate-300"
              placeholder="Nội dung chi tiết của sự kiện..." 
              value={formData.content} 
              onChange={e => setFormData({ ...formData, content: e.target.value })}
              rows={8}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Thời gian bắt đầu <span className="text-red-500">*</span></label>
              <Input type="datetime-local" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Thời gian kết thúc <span className="text-red-500">*</span></label>
              <Input type="datetime-local" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} required />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Địa điểm tổ chức</label>
            <div className="relative">
              <Input 
                placeholder="Nhập địa chỉ hoặc tọa độ..." 
                className="pl-10"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">Banner Sự kiện</h2>
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative overflow-hidden">
            <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            {coverPreview ? (
              <img src={coverPreview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <p className="text-sm text-slate-600 font-medium">Kéo thả hoặc click để tải ảnh lên</p>
                <p className="text-xs text-slate-400 mt-1">Hỗ trợ JPG, PNG (Max 5MB)</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">Tùy chọn đăng ký</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <input type="checkbox" id="registrationRequired" className="w-4 h-4 accent-emerald-600" checked={formData.registrationRequired} onChange={e => setFormData({ ...formData, registrationRequired: e.target.checked })} />
              <label htmlFor="registrationRequired" className="font-medium cursor-pointer">Yêu cầu đăng ký tham gia</label>
            </div>
            
            {formData.registrationRequired && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Giới hạn số người (Để trống = Không giới hạn)</label>
                <Input type="number" placeholder="Ví dụ: 100" value={formData.maxParticipants} onChange={e => setFormData({ ...formData, maxParticipants: e.target.value })} />
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email liên hệ</label>
              <Input type="email" placeholder="email@example.com" value={formData.contactEmail} onChange={e => setFormData({ ...formData, contactEmail: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Số điện thoại liên hệ</label>
              <Input placeholder="0912..." value={formData.contactPhone} onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4 pb-12">
          <Link href="/dashboard/events">
            <Button variant="outline" type="button">Hủy</Button>
          </Link>
          <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]">
            {loading ? <span className="animate-spin mr-2">⏳</span> : <Save className="w-4 h-4 mr-2" />}
            Lưu Sự kiện
          </Button>
        </div>
      </form>
    </div>
  );
}
