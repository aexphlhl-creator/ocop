'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Blocks,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  Filter,
  RefreshCcw,
  ShieldAlert,
  Timer,
  X,
} from 'lucide-react';
import { api } from '../../../../services/api';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';

type BlockchainRecord = {
  id: string;
  recordType: string;
  status: 'QUEUED' | 'PROCESSING' | 'CONFIRMED' | 'FAILED';
  product?: { id: string; name: string; slug: string } | null;
  productId: string;
  batchId?: string | null;
  certificateId?: string | null;
  transactionHash?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
  blockNumber?: string | null;
  gasUsed?: string | null;
  confirmations?: number | null;
  walletAddress?: string | null;
  contractAddress?: string | null;
  chainId?: number | null;
  retryCount?: number;
  confirmationLatencyMs?: number | null;
  createdAt: string;
  confirmedAt?: string | null;
  errorMessage?: string | null;
  metadataHash?: string | null;
  documentHash?: string | null;
  receipt?: Record<string, unknown> | null;
  timeline?: { queued?: string | null; processing?: string | null; confirmed?: string | null };
};

const STATUS_COLORS: Record<string, string> = {
  QUEUED: '#64748b',
  PROCESSING: '#0ea5e9',
  CONFIRMED: '#10b981',
  FAILED: '#ef4444',
};

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  QUEUED: 'default',
  PROCESSING: 'info',
  CONFIRMED: 'success',
  FAILED: 'error',
};

function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('vi-VN') : '0';
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('vi-VN') : '-';
}

function formatDuration(ms?: number | null) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function shortHash(value?: string | null) {
  if (!value) return '-';
  const clean = value.startsWith('demo-') ? '0x' + value.slice(5) : value;
  return clean.length > 18 ? `${clean.slice(0, 10)}...${clean.slice(-6)}` : clean;
}

function StatCard({ title, value, icon, tone }: { title: string; value: React.ReactNode; icon: React.ReactNode; tone: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BlockchainDashboardPage() {
  const [status, setStatus] = useState('');
  const [recordType, setRecordType] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['blockchain-dashboard'],
    queryFn: async () => (await api.get('/api/v1/blockchain/dashboard')).data.data,
    refetchInterval: 30_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['blockchain-records', status, recordType],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '20' });
      if (status) params.set('status', status);
      if (recordType) params.set('recordType', recordType);
      const res = await api.get(`/api/v1/blockchain/records?${params.toString()}`);
      return { items: res.data.data as BlockchainRecord[], meta: res.data.meta };
    },
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ['blockchain-record-detail', selectedId],
    queryFn: async () => (await api.get(`/api/v1/blockchain/records/${selectedId}`)).data.data as BlockchainRecord,
    enabled: Boolean(selectedId),
  });

  const dashboard = dashboardQuery.data;
  const records = recordsQuery.data?.items ?? [];
  const recordTypes = useMemo(
    () => Array.from(new Set([...(dashboard?.latestTransactions ?? []), ...records].map((item: BlockchainRecord) => item.recordType).filter(Boolean))),
    [dashboard?.latestTransactions, records],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-slate-950 dark:text-white">
            <Blocks className="h-7 w-7 text-emerald-600" /> Blockchain
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Theo dõi toàn bộ transaction traceability trên Polygon Amoy.</p>
        </div>
        <Button variant="outline" onClick={() => { dashboardQuery.refetch(); recordsQuery.refetch(); }}>
          <RefreshCcw className="h-4 w-4" /> Làm mới
        </Button>
      </div>

      {dashboardQuery.isLoading ? (
        <div className="flex h-80 items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <StatCard title="Total Records" value={formatNumber(dashboard?.totalRecords)} icon={<Blocks className="h-5 w-5" />} tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
            <StatCard title="Queued" value={formatNumber(dashboard?.queued)} icon={<Clock3 className="h-5 w-5" />} tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
            <StatCard title="Processing" value={formatNumber(dashboard?.processing)} icon={<Timer className="h-5 w-5" />} tone="bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300" />
            <StatCard title="Confirmed" value={formatNumber(dashboard?.confirmed)} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" />
            <StatCard title="Failed" value={formatNumber(dashboard?.failed)} icon={<ShieldAlert className="h-5 w-5" />} tone="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" />
            <StatCard title="Average Confirmation" value={formatDuration(dashboard?.averageConfirmationTime)} icon={<Timer className="h-5 w-5" />} tone="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr_1fr]">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Transactions per Day</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboard?.charts?.transactionsPerDay ?? []}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#059669" fill="#10b981" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Status Pie</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dashboard?.charts?.statusPie ?? []} dataKey="count" nameKey="status" innerRadius={58} outerRadius={92} paddingAngle={3}>
                      {(dashboard?.charts?.statusPie ?? []).map((entry: { status: string }) => <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Gas Usage</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard?.charts?.gasUsage ?? []}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => formatNumber(value)} />
                    <Tooltip formatter={(value) => formatNumber(value)} />
                    <Bar dataKey="gas" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <Card className="rounded-lg">
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <CardTitle>Transactions</CardTitle>
            <p className="text-sm text-slate-500">Latest block: {dashboard?.latestBlock ?? '-'}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
              <Filter className="h-4 w-4 text-slate-400" />
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="bg-transparent outline-none">
                <option value="">All status</option>
                <option value="QUEUED">Queued</option>
                <option value="PROCESSING">Processing</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="FAILED">Failed</option>
              </select>
            </label>
            <select value={recordType} onChange={(event) => setRecordType(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-800 dark:bg-slate-950">
              <option value="">All types</option>
              {recordTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-y border-slate-100 text-xs uppercase text-slate-400 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3">Transaction</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">Certificate</th>
                <th className="px-3 py-3">Confirmations</th>
                <th className="px-3 py-3">Gas</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Confirmed</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recordsQuery.isLoading ? (
                <tr><td colSpan={11} className="py-12 text-center"><LoadingSpinner /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={11} className="py-12 text-center text-slate-500">Không có transaction phù hợp.</td></tr>
              ) : records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-3 py-3 font-mono text-xs">{shortHash(record.txHash)}</td>
                  <td className="px-3 py-3"><Badge variant={STATUS_VARIANT[record.status] ?? 'default'}>{record.status}</Badge></td>
                  <td className="px-3 py-3">{record.recordType}</td>
                  <td className="px-3 py-3 max-w-[180px] truncate">{record.product?.name ?? record.productId}</td>
                  <td className="px-3 py-3 font-mono text-xs">{shortHash(record.batchId)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{shortHash(record.certificateId)}</td>
                  <td className="px-3 py-3">{record.confirmations ?? '-'}</td>
                  <td className="px-3 py-3">{formatNumber(record.gasUsed)}</td>
                  <td className="px-3 py-3">{formatDateTime(record.createdAt)}</td>
                  <td className="px-3 py-3">{formatDateTime(record.confirmedAt)}</td>
                  <td className="px-3 py-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedId(record.id)}>
                      <Eye className="h-4 w-4" /> Detail
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl dark:bg-slate-950">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Transaction Detail</h2>
                <p className="font-mono text-xs text-slate-500">{selectedId}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></Button>
            </div>
            {detailQuery.isLoading ? (
              <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
            ) : detailQuery.data && (
              <div className="space-y-5 p-5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={STATUS_VARIANT[detailQuery.data.status] ?? 'default'}>{detailQuery.data.status}</Badge>
                  {detailQuery.data.explorerUrl && (
                    <a href={detailQuery.data.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                      Explorer <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                <DetailGrid record={detailQuery.data} />

                <Card className="rounded-lg">
                  <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <TimelineRow label="Queued" value={detailQuery.data.timeline?.queued ?? detailQuery.data.createdAt} />
                    <TimelineRow label="Processing" value={detailQuery.data.timeline?.processing} />
                    <TimelineRow label="Confirmed" value={detailQuery.data.timeline?.confirmed ?? detailQuery.data.confirmedAt} />
                  </CardContent>
                </Card>

                <Card className="rounded-lg">
                  <CardHeader><CardTitle>Receipt</CardTitle></CardHeader>
                  <CardContent>
                    <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                      {JSON.stringify(detailQuery.data.receipt ?? {}, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function DetailGrid({ record }: { record: BlockchainRecord }) {
  const rows = [
    ['Transaction Hash', record.txHash],
    ['Metadata Hash', record.metadataHash],
    ['Document Hash', record.documentHash],
    ['Wallet', record.walletAddress],
    ['Contract', record.contractAddress],
    ['Network', record.chainId ? `Polygon Amoy (${record.chainId})` : '-'],
    ['Block', record.blockNumber],
    ['Gas', record.gasUsed],
    ['Confirmations', record.confirmations],
    ['Retry Count', record.retryCount],
    ['Created Time', formatDateTime(record.createdAt)],
    ['Confirmed Time', formatDateTime(record.confirmedAt)],
    ['Error Message', record.errorMessage],
  ];

  return (
    <Card className="rounded-lg">
      <CardContent className="grid gap-3 p-5">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="grid gap-1 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <span className="text-xs font-bold uppercase text-slate-400">{label}</span>
            <span className="flex items-start justify-between gap-3 break-all font-mono text-xs text-slate-700 dark:text-slate-200">
              {value == null || value === '' ? '-' : String(value)}
              {typeof value === 'string' && value.length > 10 && (
                <button onClick={() => navigator.clipboard?.writeText(value)} className="shrink-0 text-slate-400 hover:text-emerald-600" aria-label={`Copy ${label}`}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TimelineRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
      <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="text-slate-500">{formatDateTime(value)}</span>
    </div>
  );
}
