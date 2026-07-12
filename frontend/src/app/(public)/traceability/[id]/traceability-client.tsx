'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../../../services/api';
import { Badge } from '../../../../components/ui/badge';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Fingerprint,
  MapPin,
  PackageCheck,
  Route,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Warehouse,
} from 'lucide-react';
import { motion } from 'framer-motion';

const SupplyChainMap = dynamic(() => import('../../../../components/dashboard/supply-chain-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-slate-400">
      <LoadingSpinner />
    </div>
  ),
});

type TraceabilityData = {
  product: any;
  business: any;
  batches: any[];
  supplyChainTimeline: any[];
  certificates: any[];
  warehouse: any;
  orderStatus: any;
  summary: any;
  relatedProducts: any[];
};

const STAGE_ICON: Record<string, string> = {
  HARVEST: '🌱',
  RECEIVED: '🚜',
  QUALITY_INSPECTION: '🔬',
  PROCESSING: '🏭',
  PACKAGING: '📦',
  WAREHOUSE: '🏬',
  SHIPPING: '🚚',
  DISTRIBUTOR: '🏪',
  RETAIL: '🛒',
  CUSTOMER: '✅',
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('vi-VN') : '-';
}

function formatMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('vi-VN');
}

function isExpired(value?: string | null) {
  return value ? new Date(value).getTime() < Date.now() : false;
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="mx-auto max-w-6xl space-y-5 pt-8">
        <div className="h-80 animate-pulse rounded-[2rem] bg-white/10" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white/10" />)}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-white/10" />
      </div>
    </div>
  );
}

function GlassPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-white/80 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:bg-slate-900/70 dark:border-white/10 ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: any) {
  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="truncate text-xl font-black text-slate-950 dark:text-white">{value}</p>
          {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
        </div>
      </div>
    </GlassPanel>
  );
}

export default function TraceabilityClient({
  productId,
  initialData,
}: {
  productId: string;
  initialData: TraceabilityData | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['traceability-v2', productId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/traceability/${productId}`);
      return res.data.data as TraceabilityData;
    },
    initialData: initialData ?? undefined,
    enabled: !!productId,
  });

  const mapPoints = useMemo(
    () => (data?.supplyChainTimeline ?? [])
      .filter((item: any) => item.latitude != null && item.longitude != null)
      .map((item: any, index: number) => ({
        id: `${item.stage?.name ?? 'stage'}-${index}`,
        latitude: item.latitude,
        longitude: item.longitude,
        location: item.location,
        actorName: item.actorName,
        note: item.note,
        createdAt: item.time,
        stage: item.stage,
      })),
    [data],
  );

  if (isLoading) return <Skeleton />;

  if (isError || !data?.product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-center text-white">
        <GlassPanel className="max-w-md p-8">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
          <h1 className="text-xl font-black">Không tìm thấy hồ sơ truy xuất</h1>
          <p className="mt-2 text-sm text-slate-400">Mã QR có thể không hợp lệ hoặc sản phẩm chưa sẵn sàng công khai.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">
            Về trang chủ
          </Link>
        </GlassPanel>
      </div>
    );
  }

  const product = data.product;
  const primaryImage = product.images?.[0] || '/placeholder.jpg';
  const currentBatch = data.batches?.[0];
  const latestCertificate = data.summary?.latestCertificate;
  const latestCertificateExpired = isExpired(latestCertificate?.expiryDate);
  const currentStage = data.summary?.currentStage;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d1fae5,transparent_30%),linear-gradient(135deg,#f8fafc,#eef2ff_45%,#ecfdf5)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,#064e3b,transparent_28%),linear-gradient(135deg,#020617,#0f172a_50%,#052e2b)] dark:text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 md:py-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-600 backdrop-blur hover:text-emerald-700 dark:bg-white/10 dark:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Trang chủ
        </Link>

        <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-slate-950 shadow-2xl shadow-emerald-950/20">
          <img src={primaryImage} alt={product.name} className="absolute inset-0 h-full w-full object-cover opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/20" />
          <div className="relative grid min-h-[520px] gap-8 p-6 md:grid-cols-[1fr_320px] md:p-10">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col justify-end">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="success" className="bg-emerald-400/15 text-emerald-100 border-emerald-300/30">
                  <ShieldCheck className="h-3.5 w-3.5" /> QR Verified
                </Badge>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-amber-950">
                  OCOP {product.ocopLevel?.level} <Star className="h-3.5 w-3.5 fill-amber-950" />
                </span>
                {currentStage && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/15">
                    Hiện tại: {currentStage.displayName}
                  </span>
                )}
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">{product.name}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">{product.description}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs text-slate-300">Mã sản phẩm</p>
                  <p className="font-mono text-lg font-black text-white">{product.code}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs text-slate-300">Danh mục</p>
                  <p className="font-bold text-white">{product.category?.name ?? '-'}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs text-slate-300">Đơn vị</p>
                  <p className="font-bold text-white">{product.unit}</p>
                </div>
              </div>
            </motion.div>

            <GlassPanel className="self-end p-5 text-center">
              <div className="mx-auto inline-flex rounded-2xl bg-white p-4">
                <QRCodeSVG value={`/traceability/${productId}`} size={168} />
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-black">Verified OCOP Traceability</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Dữ liệu được tổng hợp trực tiếp từ sản phẩm, lô hàng, kho, hành trình và chứng nhận trong hệ thống.
              </p>
            </GlassPanel>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard icon={<Route className="h-5 w-5" />} label="Bước hành trình" value={data.supplyChainTimeline?.length ?? 0} sub={currentStage?.displayName} />
          <StatCard icon={<Boxes className="h-5 w-5" />} label="Batch" value={currentBatch?.batchNumber ?? '-'} sub={`${data.summary?.currentQuantity ?? 0} còn lại`} />
          <StatCard icon={<Warehouse className="h-5 w-5" />} label="Kho hiện tại" value={data.summary?.currentWarehouse?.name ?? '-'} sub={currentBatch?.warehouseLocation} />
          <StatCard icon={<Award className="h-5 w-5" />} label="Chứng nhận" value={data.certificates?.length ?? 0} sub={latestCertificate?.type?.name} />
        </section>

        <main className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <GlassPanel className="p-5 md:p-6">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Hành trình sản phẩm</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Timeline được sắp xếp theo thời gian thực tế</p>
                </div>
                <PackageCheck className="h-6 w-6 text-emerald-600" />
              </div>

              {data.supplyChainTimeline?.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                  Chưa có hành trình chuỗi cung ứng cho sản phẩm này.
                </div>
              ) : (
                <div className="relative ml-4 space-y-6 border-l border-emerald-300/60 pl-7 dark:border-emerald-700">
                  {data.supplyChainTimeline.map((step: any, index: number) => (
                    <motion.article
                      key={`${step.stage?.name}-${index}`}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="relative rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50"
                    >
                      <div className="absolute -left-[47px] top-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-400 bg-white text-lg shadow-md dark:bg-slate-900">
                        {STAGE_ICON[step.stage?.name] ?? '📍'}
                      </div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">Bước {index + 1}</p>
                          <h3 className="text-base font-black">{step.stage?.displayName ?? 'Công đoạn'}</h3>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {formatDateTime(step.time)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-500" /> {step.location}</p>
                        <p className="flex items-center gap-2"><Store className="h-4 w-4 text-blue-500" /> {step.actorName}</p>
                        {step.note && <p className="rounded-xl bg-slate-50 p-3 text-slate-500 dark:bg-slate-900 dark:text-slate-400">{step.note}</p>}
                      </div>
                      {step.imageUrls?.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto">
                          {step.imageUrls.map((url: string) => (
                            <img key={url} src={url} alt={step.stage?.displayName ?? 'Journey'} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                          ))}
                        </div>
                      )}
                    </motion.article>
                  ))}
                </div>
              )}
            </GlassPanel>

            {mapPoints.length > 0 && (
              <GlassPanel className="overflow-hidden p-0">
                <div className="flex items-center justify-between p-5">
                  <div>
                    <h2 className="text-xl font-black">Bản đồ hành trình</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Marker theo stage, polyline nối toàn bộ hành trình</p>
                  </div>
                  <MapPin className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="h-[420px]">
                  <SupplyChainMap points={mapPoints} />
                </div>
              </GlassPanel>
            )}

            <GlassPanel className="p-5 md:p-6">
              <h2 className="mb-4 text-xl font-black">Chứng nhận</h2>
              <div className="grid gap-3">
                {data.certificates?.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                    Chưa có chứng nhận công khai cho sản phẩm này.
                  </div>
                ) : data.certificates.map((certificate: any, index: number) => {
                  const expired = isExpired(certificate.expiryDate) || certificate.status === 'EXPIRED';
                  return (
                    <div key={`${certificate.certificateNumber}-${index}`} className={`rounded-2xl border p-4 ${expired ? 'border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/20' : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Badge variant={expired ? 'error' : 'success'}>{expired ? 'Hết hạn' : 'Còn hiệu lực'}</Badge>
                          <h3 className="mt-2 font-black">{certificate.type?.name}</h3>
                          <p className="font-mono text-xs text-slate-500">{certificate.certificateNumber}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>Cấp: {formatDate(certificate.issueDate)}</p>
                          <p>Hết hạn: {formatDate(certificate.expiryDate)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{certificate.issuingOrganization}</p>
                      {certificate.documentHash && (
                        <div className="mt-3 rounded-xl bg-white/80 p-3 dark:bg-slate-950/60">
                          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                            <Fingerprint className="h-3.5 w-3.5" /> SHA-256 Fingerprint
                          </p>
                          <p className="break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">{certificate.documentHash}</p>
                          <div className={`mt-3 rounded-xl border p-3 ${certificate.blockchainVerification?.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
                            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {certificate.blockchainVerification?.verified ? 'Blockchain Verified' : 'Pending Verification'}
                            </p>
                            {certificate.blockchainVerification?.txHash && (
                              <p className="mt-2 break-all font-mono text-[11px]">
                                {certificate.blockchainVerification.txHash}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                              {certificate.blockchainVerification?.confirmations != null && (
                                <span>{certificate.blockchainVerification.confirmations} confirmations</span>
                              )}
                              {certificate.blockchainVerification?.timestamp && (
                                <span>{formatDateTime(certificate.blockchainVerification.timestamp)}</span>
                              )}
                              {certificate.blockchainVerification?.explorerUrl && (
                                <a href={certificate.blockchainVerification.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                                  Explorer <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {certificate.files?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {certificate.files.map((file: any) => (
                            <a key={file.fileUrl} href={file.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:text-emerald-700 dark:bg-slate-900 dark:text-slate-300">
                              <FileText className="h-3.5 w-3.5" /> {file.fileName}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassPanel>
          </div>

          <aside className="space-y-6">
            <GlassPanel className="p-5">
              <h2 className="mb-4 text-lg font-black">Trạng thái hiện tại</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-500">Công đoạn</span><strong>{currentStage?.displayName ?? '-'}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Kho</span><strong>{data.summary?.currentWarehouse?.name ?? '-'}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Số lượng</span><strong>{data.summary?.currentQuantity ?? 0}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Sản xuất</span><strong>{formatDate(data.summary?.productionDate)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Hết hạn</span><strong>{formatDate(data.summary?.expiryDate)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Đơn hàng</span><strong>{data.orderStatus?.status ?? '-'}</strong></div>
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Warehouse className="h-5 w-5 text-emerald-600" /> Kho & Batch</h2>
              <div className="space-y-3 text-sm">
                <div><p className="text-xs text-slate-400">Kho hiện tại</p><p className="font-bold">{data.warehouse?.name ?? '-'}</p></div>
                <div><p className="text-xs text-slate-400">Batch Number</p><p className="font-mono font-bold">{currentBatch?.batchNumber ?? '-'}</p></div>
                <div><p className="text-xs text-slate-400">Vị trí kệ</p><p className="font-bold">{currentBatch?.warehouseLocation ?? '-'}</p></div>
                <div><p className="text-xs text-slate-400">Số lượng còn lại</p><p className="font-bold">{currentBatch?.quantity ?? 0}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-slate-400">Ngày sản xuất</p><p className="font-semibold">{formatDate(currentBatch?.manufactureDate ?? currentBatch?.harvestDate)}</p></div>
                  <div><p className="text-xs text-slate-400">Ngày hết hạn</p><p className="font-semibold">{formatDate(currentBatch?.expiryDate)}</p></div>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Store className="h-5 w-5 text-emerald-600" /> Chủ thể sản xuất</h2>
              <p className="font-black">{data.business?.name}</p>
              <p className="mt-1 text-sm text-slate-500">{data.business?.address}</p>
              {data.business?.isVerified && (
                <Badge variant="success" className="mt-3"><CheckCircle2 className="h-3.5 w-3.5" /> Đã xác minh</Badge>
              )}
            </GlassPanel>

            <GlassPanel className="p-5">
              <h2 className="mb-4 text-lg font-black">Thông tin sản phẩm</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">OCOP Rating</span><strong>{product.ocopLevel?.title ?? '-'}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Khối lượng</span><strong>{product.unit}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Giá bán</span><strong>{formatMoney(product.price)}đ</strong></div>
              </div>
              <Link href={`/products/${product.slug}`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 dark:bg-emerald-600">
                <ShoppingBag className="h-4 w-4" /> Xem sản phẩm <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </GlassPanel>
          </aside>
        </main>

        {data.relatedProducts?.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-4 text-xl font-black">Sản phẩm liên quan</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.relatedProducts.map((item: any) => (
                <Link key={item.slug} href={`/products/${item.slug}`} className="group overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-slate-900/70">
                  <img src={item.image || '/placeholder.jpg'} alt={item.name} className="h-36 w-full object-cover" />
                  <div className="p-4">
                    <p className="line-clamp-2 font-bold">{item.name}</p>
                    <p className="mt-2 text-sm font-black text-emerald-600">{formatMoney(item.price)}đ/{item.unit}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
