'use client';

import { useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { AssetImage } from '@/components/ui/asset-image';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { OcopCertificateModal } from '@/components/certificates/OcopCertificateModal';
import type { TraceabilityData, TraceCertificate, TraceEvent } from '@/types/traceability';

const SupplyChainMap = dynamic(() => import('@/components/dashboard/supply-chain-map'), { ssr: false, loading: () => <LoadingSpinner /> });
const subscribe = () => () => {};
const dateLabel = (value?: string | null) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu';
const safeUrl = (value?: string | null) => value && /^https?:\/\//i.test(value) ? value : undefined;

function certificateState(cert: TraceCertificate, now: number) {
  if (cert.status === 'REVOKED') return 'Đã thu hồi';
  if (cert.status === 'EXPIRED' || (cert.expiryDate && new Date(cert.expiryDate).getTime() <= now)) return 'Đã hết hạn';
  if (cert.status === 'ACTIVE') return 'Hồ sơ đang hiệu lực';
  return 'Chờ xác minh';
}

export default function TraceabilityClient({ productId, initialData }: { productId: string; initialData: TraceabilityData | null }) {
  const [tab, setTab] = useState<'timeline' | 'qa' | 'map' | 'batches'>('timeline');
  const [printCertificate, setPrintCertificate] = useState<TraceCertificate | null>(null);
  const [now] = useState(() => Date.now());
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => '');
  const qrUrl = origin ? origin + '/traceability/' + encodeURIComponent(productId) : '';
  const { data, isLoading, isError } = useQuery({
    queryKey: ['traceability-v2', productId],
    queryFn: async () => {
      try {
        return (await api.get<{ data: TraceabilityData }>('/api/v1/traceability/batch/' + encodeURIComponent(productId))).data.data;
      } catch (error) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;
        return (await api.get<{ data: TraceabilityData }>('/api/v1/traceability/' + encodeURIComponent(productId))).data.data;
      }
    },
    initialData: initialData ?? undefined,
    enabled: !!productId,
  });

  async function copyLink() {
    try { await navigator.clipboard.writeText(qrUrl); toast.success('Đã sao chép liên kết'); }
    catch { toast.error('Không thể sao chép liên kết'); }
  }

  function downloadQR() {
    const svg = document.getElementById('traceability-qrcode');
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'QR_' + productId + '.svg';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (isLoading) return <div className="min-h-[60vh] flex items-center justify-center"><LoadingSpinner /></div>;
  if (isError || !data?.product) return <div role="alert" className="max-w-xl mx-auto py-20 px-6 text-center"><h1 className="text-2xl font-bold">Không tải được hồ sơ truy xuất</h1><p className="my-4">Mã không tồn tại hoặc hệ thống chưa trả về dữ liệu. Vui lòng thử lại.</p><Link href="/" className="text-emerald-700 underline">Về trang chủ</Link></div>;

  const { product, seller } = data;
  const batches = data.batches ?? [];
  const certificates = data.certificates ?? [];
  const timeline = data.supplyChainTimeline ?? [];
  const verification = data.summary?.traceabilityVerification;
  const blockchain = data.summary?.blockchain;
  const explorer = safeUrl(blockchain?.explorerUrl);
  const points = timeline.filter((event): event is TraceEvent & { latitude: number; longitude: number } =>
    event.latitude != null && event.longitude != null && Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
  ).map((event, i) => ({
    id: 'event-' + i, latitude: event.latitude, longitude: event.longitude,
    location: event.location ?? 'Chưa ghi địa điểm', actorName: event.actorName ?? 'Chưa ghi người thực hiện',
    createdAt: event.time, stage: event.stage, note: event.note ?? undefined,
  }));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/" className="text-sm text-emerald-700 hover:underline">← Trang chủ</Link>
        <section className="rounded-2xl bg-white border p-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-5">
            {product.images?.[0] && <AssetImage src={product.images[0]} alt={product.name} className="w-32 h-32 rounded-xl object-cover" />}
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-700">Hồ sơ truy xuất nguồn gốc</p>
              <h1 className="text-2xl font-bold mt-1">{product.name}</h1>
              <p className="text-slate-600 mt-2">{seller?.name || 'Chưa có thông tin chủ thể'}</p>
              <p className="text-sm text-slate-500">{[product.origin?.ward, product.origin?.province].filter(Boolean).join(', ') || 'Chưa có địa bàn sản xuất'}</p>
              <p className="text-sm mt-3">{product.ocopLevel?.level ? product.ocopLevel.level + ' sao OCOP theo hồ sơ sản phẩm' : 'Chưa có thông tin xếp hạng OCOP'}</p>
            </div>
            {qrUrl && <div className="flex flex-col items-center gap-2"><QRCodeSVG id="traceability-qrcode" value={qrUrl} size={104} /><button onClick={downloadQR} className="text-xs text-emerald-700 underline">Tải mã QR (SVG)</button><button onClick={copyLink} className="text-xs text-emerald-700 underline">Sao chép liên kết</button></div>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-sm border-t pt-4">
            <p>Hồ sơ nguồn gốc: <strong>{verification?.fullyVerified ? 'Đủ dữ liệu đã xác minh' : 'Chưa xác minh đầy đủ'}</strong></p>
            <p>Kiểm định: <strong>{verification?.qualityVerified ? 'Đã đạt QC' : 'Chưa xác nhận đạt QC'}</strong></p>
            <p>Blockchain: <strong>{verification?.blockchainVerified ? 'Đã xác nhận các công đoạn được ghi' : 'Chưa xác nhận đầy đủ'}</strong></p>
          </div>
          {data.traceabilityScope === 'PRODUCT' && <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{data.traceabilityWarning || 'Đây là hồ sơ tổng hợp cấp sản phẩm. Chọn lô cụ thể để tra cứu đúng hàng trên bao bì.'}</p>}
        </section>

        <nav aria-label="Nội dung truy xuất" className="flex flex-wrap gap-2">
          {([{ key: 'timeline', label: 'Hành trình thực tế' }, { key: 'qa', label: 'Chứng nhận' }, { key: 'map', label: 'Bản đồ' }, { key: 'batches', label: 'Thông tin lô' }] as const).map(item =>
            <button key={item.key} onClick={() => setTab(item.key)} aria-pressed={tab === item.key} className={'rounded-xl px-4 py-2 text-sm font-semibold ' + (tab === item.key ? 'bg-emerald-700 text-white' : 'bg-white border')}>{item.label}</button>)}
        </nav>

        <section className="rounded-2xl border bg-white p-6 space-y-5">
          {tab === 'timeline' && <>
            <h2 className="text-xl font-bold">Các công đoạn đã ghi nhận</h2>
            {!timeline.length ? <p className="text-slate-500">Chưa có dữ liệu hành trình.</p> : <ol className="space-y-4">{timeline.map((event, i) =>
              <li key={event.source + event.time + i} className="border-l-2 border-emerald-500 pl-4 space-y-1">
                <h3 className="font-semibold">{event.stage?.displayName || event.stage?.name || 'Công đoạn'}</h3>
                <p className="text-xs text-slate-500">{dateLabel(event.time)} · Lô {event.batchNumber}</p>
                <p className="text-sm">{event.location || 'Chưa ghi địa điểm'} · {event.actorName || 'Chưa ghi người thực hiện'}</p>
                {event.note && <p className="text-sm text-slate-600 whitespace-pre-wrap">{event.note}</p>}
                {event.blockchainVerification && <p className="text-xs text-slate-500">{event.blockchainVerification.verified ? 'Công đoạn đã xác nhận trên blockchain' : 'Công đoạn chưa xác nhận trên blockchain'}</p>}
              </li>)}</ol>}
          </>}
          {tab === 'qa' && <>
            <h2 className="text-xl font-bold">Hồ sơ chứng nhận</h2>
            {!certificates.length && <p className="text-slate-500">Chưa có chứng nhận được cung cấp. Hệ thống không tự cấp chứng nhận thay cho cơ quan có thẩm quyền.</p>}
            {certificates.map((cert, i) => <article key={cert.certificateNumber + i} className="rounded-xl border p-4 space-y-2">
              <h3 className="font-semibold">{cert.type?.name || 'Chứng nhận'} — {cert.certificateNumber}</h3>
              <p className="text-sm">{cert.issuingOrganization || 'Chưa có đơn vị cấp'}</p>
              <p className="text-sm">{certificateState(cert, now)} · {dateLabel(cert.issueDate)} — {dateLabel(cert.expiryDate)}</p>
              <div className="flex flex-wrap gap-4 text-sm">{cert.files?.map(file => <a key={file.fileUrl} href={safeUrl(file.fileUrl)} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{file.fileName || 'Xem tệp gốc'}</a>)}</div>
              <button onClick={() => setPrintCertificate(cert)} className="text-sm text-emerald-700 underline">In bản tra cứu hồ sơ</button>
            </article>)}
          </>}
          {tab === 'map' && <>
            <h2 className="text-xl font-bold">Vị trí công đoạn đã ghi nhận</h2>
            {points.length ? <div className="h-96"><SupplyChainMap points={points} /></div> : <p className="text-slate-500">Chưa có tọa độ thực tế. Bản đồ không tự gán địa điểm cho lô hàng.</p>}
          </>}
          {tab === 'batches' && <>
            <h2 className="text-xl font-bold">Các lô hàng trong hồ sơ</h2>
            {!batches.length && <p className="text-slate-500">Chưa có lô hàng.</p>}
            {batches.map(batch => <article key={batch.id} className="rounded-xl border p-4 space-y-2">
              <Link href={'/traceability/' + batch.id} className="font-semibold text-emerald-700 underline">{batch.batchNumber}</Link>
              <p className="text-sm">Số lượng hiện tại: {batch.quantity} / Ban đầu: {batch.initialQuantity} {product.unit}</p>
              <p className="text-sm">Trạng thái: {batch.status || 'Chưa có'} · QC: {batch.qualityStatus || 'Chưa có'}</p>
              <p className="text-sm">Sản xuất: {dateLabel(batch.manufactureDate)} · Hạn sử dụng: {dateLabel(batch.expiryDate)}</p>
              <p className="text-sm">Kho: {batch.warehouse?.name || 'Chưa có'}</p>
              {batch.traceabilityVerification?.requirements?.filter(item => item.applicable).map((item, i) => <p key={item.key || i} className="text-xs text-slate-500">{item.complete ? '✓' : '○'} {item.label}</p>)}
            </article>)}
          </>}
        </section>
        {blockchain?.txHash && <section className="rounded-xl border bg-white p-4 text-xs space-y-2"><p className="break-all">Giao dịch được ghi: {blockchain.txHash}</p><p>{blockchain.verified ? 'Bản ghi đã được xác nhận' : 'Bản ghi chưa được xác nhận'}</p>{explorer && <a href={explorer} target="_blank" rel="noreferrer" className="text-emerald-700 underline">Xem trên trình khám phá blockchain</a>}</section>}
        {printCertificate && <OcopCertificateModal isOpen onClose={() => setPrintCertificate(null)} data={{
          productName: product.name, ownerName: seller?.name, issuingOrganization: printCertificate.issuingOrganization,
          certificateNumber: printCertificate.certificateNumber, issueDate: printCertificate.issueDate, expiryDate: printCertificate.expiryDate,
          status: certificateState(printCertificate, now), documentHash: printCertificate.documentHash, qrUrl,
        }} />}
      </div>
    </main>
  );
}
