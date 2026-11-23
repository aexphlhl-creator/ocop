'use client';

import { getErrorMessage } from '@/utils/api-error';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../../../../services/api';
import { Button } from '../../../../components/ui/button';
import { Badge, type BadgeProps } from '../../../../components/ui/badge';
import { Card, CardContent } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { Modal } from '../../../../components/ui/modal';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  FileCheck2,
  FileText,
  Filter,
  Link as LinkIcon,
  Plus,
  ScrollText,
  ShieldCheck,
  Upload,
  Printer,
  Award,
} from 'lucide-react';
import { OcopCertificateModal } from '../../../../components/certificates/OcopCertificateModal';

type Certificate = {
  id: string;
  certificateNumber: string;
  issuingOrganization: string;
  issueDate: string;
  expiryDate: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING';
  verificationUrl?: string;
  note?: string;
  documentHash: string;
  certificateType?: { id: string; name: string };
  product?: { id: string; name: string };
  batch?: { id: string; batchNumber: string };
  files?: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string; fileSize: number }>;
};

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  ACTIVE: { label: 'Hiệu lực', variant: 'success' },
  EXPIRED: { label: 'Hết hạn', variant: 'error' },
  REVOKED: { label: 'Thu hồi', variant: 'warning' },
  PENDING: { label: 'Chờ duyệt', variant: 'default' },
};

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: number; tone: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-xl ${tone}`}>{icon}</div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{value ?? 0}</p>
      </div>
    </div>
  );
}

export default function CertificatesPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    certificateTypeId: '',
    status: '',
    productId: '',
    batchId: '',
    expiryTo: '',
  });
  const [selected, setSelected] = useState<Certificate | null>(null);
  const [showCertPrint, setShowCertPrint] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({
    certificateNumber: '',
    certificateTypeId: '',
    productId: '',
    batchId: '',
    issuingOrganization: '',
    issueDate: '',
    expiryDate: '',
    status: 'ACTIVE',
    verificationUrl: '',
    note: '',
  });
  const [files, setFiles] = useState<FileList | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    return params.toString();
  }, [filters]);

  const { data: types = [] } = useQuery({
    queryKey: ['certificate-types'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string }> }>('/api/v1/certificates/types').then((r) => r.data.data || []),
  });

  const { data: stats } = useQuery({
    queryKey: ['certificate-stats'],
    queryFn: () => api.get('/api/v1/certificates/stats').then((r) => r.data.data),
  });

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ['certificates', queryString],
    queryFn: () => api.get(`/api/v1/certificates?${queryString}`).then((r) => r.data.data || []),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['certificate-products'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string }> }>('/api/v1/products?limit=100').then((r) => r.data.data || []),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });
      Array.from(files || []).forEach((file) => payload.append('files', file));
      return api.post('/api/v1/certificates', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Đã tạo chứng nhận');
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      queryClient.invalidateQueries({ queryKey: ['certificate-stats'] });
      setIsCreateOpen(false);
      setForm({
        certificateNumber: '',
        certificateTypeId: '',
        productId: '',
        batchId: '',
        issuingOrganization: '',
        issueDate: '',
        expiryDate: '',
        status: 'ACTIVE',
        verificationUrl: '',
        note: '',
      });
      setFiles(null);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Không thể tạo chứng nhận')),
  });

  const inputCls = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';
  const labelCls = 'text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block';

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-emerald-600" /> Chứng nhận
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý chứng nhận sản phẩm và lô hàng, sẵn sàng cho QR Traceability 2.0
          </p>
        </div>
        <Button variant="primary" size="sm" className="gap-2" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" /> Thêm chứng nhận
        </Button>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FileCheck2 className="w-5 h-5 text-blue-600" />} label="Tổng chứng nhận" value={stats?.total} tone="bg-blue-50 dark:bg-blue-950/30" />
        <StatCard icon={<CalendarClock className="w-5 h-5 text-amber-600" />} label="Sắp hết hạn" value={stats?.expiringSoon} tone="bg-amber-50 dark:bg-amber-950/30" />
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-red-600" />} label="Đã hết hạn" value={stats?.expired} tone="bg-red-50 dark:bg-red-950/30" />
        <StatCard icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />} label="Loại chứng nhận" value={Object.keys(stats?.byType || {}).length} tone="bg-emerald-50 dark:bg-emerald-950/30" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
            <Filter className="w-4 h-4" /> Bộ lọc
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select className={inputCls} value={filters.certificateTypeId} onChange={(e) => setFilters((f) => ({ ...f, certificateTypeId: e.target.value }))}>
              <option value="">Tất cả loại</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className={inputCls} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
            <select className={inputCls} value={filters.productId} onChange={(e) => setFilters((f) => ({ ...f, productId: e.target.value }))}>
              <option value="">Tất cả sản phẩm</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className={inputCls} value={filters.batchId} onChange={(e) => setFilters((f) => ({ ...f, batchId: e.target.value }))} placeholder="Batch ID" />
            <input className={inputCls} type="date" value={filters.expiryTo} onChange={(e) => setFilters((f) => ({ ...f, expiryTo: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : certificates.length === 0 ? (
        <EmptyState icon={<FileText className="w-8 h-8" />} title="Chưa có chứng nhận" description="Tải lên chứng nhận thật để bắt đầu quản lý hồ sơ sản phẩm và lô hàng" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Số chứng nhận</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Loại</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Đối tượng</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Tổ chức cấp</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Hết hạn</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Trạng thái</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">File</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert: Certificate) => {
                    const cfg = STATUS_CONFIG[cert.status] ?? STATUS_CONFIG.PENDING;
                    return (
                      <tr key={cert.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer" onClick={() => setSelected(cert)}>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{cert.certificateNumber}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{cert.certificateType?.name}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {cert.product?.name || cert.batch?.batchNumber || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{cert.issuingOrganization}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(cert.expiryDate)}</td>
                        <td className="px-4 py-3 text-center"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                        <td className="px-4 py-3 text-right text-slate-400">{cert.files?.length ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Chi tiết chứng nhận" className="max-w-2xl">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Số chứng nhận', selected.certificateNumber],
                ['Loại', selected.certificateType?.name],
                ['Tổ chức cấp', selected.issuingOrganization],
                ['Ngày cấp', formatDate(selected.issueDate)],
                ['Ngày hết hạn', formatDate(selected.expiryDate)],
                ['Trạng thái', STATUS_CONFIG[selected.status]?.label],
              ].map(([label, value]) => (
                <div key={label as string} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{value || '-'}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
              <p className="text-xs text-slate-400 mb-1">SHA-256 documentHash</p>
              <p className="font-mono text-xs break-all text-slate-700 dark:text-slate-200">{selected.documentHash}</p>
            </div>
            {selected.verificationUrl && (
              <a className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:underline" href={selected.verificationUrl} target="_blank" rel="noreferrer">
                <LinkIcon className="w-4 h-4" /> Mở URL xác minh
              </a>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">File đính kèm</p>
              <div className="space-y-2">
                {selected.files?.map((file) => (
                  <a key={file.id} href={file.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200"><FileText className="w-4 h-4" /> {file.fileName}</span>
                    <span className="text-xs text-slate-400">{Math.round(file.fileSize / 1024)} KB</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">Bảo chứng số hóa OCOP Quốc Gia</span>
              <Button
                type="button"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowCertPrint(true)}
              >
                <Printer className="w-4 h-4" /> In Giấy chứng nhận A4
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {selected && (
        <OcopCertificateModal
          isOpen={showCertPrint}
          onClose={() => setShowCertPrint(false)}
          data={{
            certificateNumber: selected.certificateNumber,
            productName: selected.product?.name || selected.batch?.batchNumber || 'Hồ sơ chứng nhận',
            issuingOrganization: selected.issuingOrganization,
            status: STATUS_CONFIG[selected.status]?.label || selected.status,
            issueDate: selected.issueDate,
            expiryDate: selected.expiryDate,
            qrUrl: selected.verificationUrl,
            documentHash: selected.documentHash,
          }}
        />
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Thêm chứng nhận" className="max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className={labelCls}>Số chứng nhận *</label><input className={inputCls} value={form.certificateNumber} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} /></div>
          <div><label className={labelCls}>Loại chứng nhận *</label><select className={inputCls} value={form.certificateTypeId} onChange={(e) => setForm((f) => ({ ...f, certificateTypeId: e.target.value }))}><option value="">Chọn loại</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className={labelCls}>Product</label><select className={inputCls} value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}><option value="">Không gắn product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className={labelCls}>Batch ID</label><input className={inputCls} value={form.batchId} onChange={(e) => setForm((f) => ({ ...f, batchId: e.target.value }))} placeholder="UUID lô hàng" /></div>
          <div><label className={labelCls}>Tổ chức cấp *</label><input className={inputCls} value={form.issuingOrganization} onChange={(e) => setForm((f) => ({ ...f, issuingOrganization: e.target.value }))} /></div>
          <div><label className={labelCls}>Trạng thái</label><select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>{Object.entries(STATUS_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}</select></div>
          <div><label className={labelCls}>Ngày cấp *</label><input className={inputCls} type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} /></div>
          <div><label className={labelCls}>Ngày hết hạn *</label><input className={inputCls} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} /></div>
          <div className="md:col-span-2"><label className={labelCls}>URL xác minh</label><input className={inputCls} value={form.verificationUrl} onChange={(e) => setForm((f) => ({ ...f, verificationUrl: e.target.value }))} placeholder="https://..." /></div>
          <div className="md:col-span-2"><label className={labelCls}>Ghi chú</label><textarea className={`${inputCls} resize-none`} rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
          <div className="md:col-span-2"><label className={labelCls}>File chứng nhận *</label><input className={inputCls} type="file" multiple onChange={(e) => setFiles(e.target.files)} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>Hủy</Button>
          <Button
            variant="primary"
            size="sm"
            className="gap-2"
            isLoading={createMutation.isPending}
            disabled={!form.certificateNumber || !form.certificateTypeId || !form.issuingOrganization || !form.issueDate || !form.expiryDate || (!form.productId && !form.batchId) || !files?.length}
            onClick={() => createMutation.mutate()}
          >
            <Upload className="w-4 h-4" /> Lưu chứng nhận
          </Button>
        </div>
      </Modal>
    </div>
  );
}
