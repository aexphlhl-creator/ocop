'use client';

import { FormEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { LocationPicker } from '../ui/location-picker';

const fieldClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-transparent p-3 text-sm';
const labels: Record<string, string> = {
  DRAFT: 'Nháp — Seller hoàn thiện hồ sơ', SUBMITTED: 'Chờ kho tiếp nhận',
  QUARANTINED: 'Cách ly — chờ QA kiểm định', QC_PASSED: 'Đạt QC — chờ xếp kho/phát hành',
  RELEASED: 'Đã phát hành — được phép xuất bán', REJECTED: 'Không đạt — không được xuất bán',
  RECALLED: 'Đã thu hồi', CLOSED: 'Đã đóng',
};

function message(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[]; error?: { message?: string | string[]; details?: string[] } };
    const details = data?.error?.details;
    if (details && Array.isArray(details) && details.length) {
      return details.join(', ');
    }
    const value = data?.error?.message ?? data?.message;
    if (value) return Array.isArray(value) ? value.join(', ') : String(value);
  }
  return error instanceof Error ? error.message : 'Không thể lưu thao tác. Vui lòng thử lại.';
}

function useLotRefresh() {
  const client = useQueryClient();
  return async () => {
    await Promise.all(['supply-chain-batch', 'supply-chain-all-batches', 'supply-chain-stats',
      'supply-chain-history', 'traceability-batch-profile', 'inventories', 'inv-stats', 'all-batches']
      .map((key) => client.invalidateQueries({ queryKey: [key] })));
  };
}

// Keep the same key when retrying the same request after an uncertain response.
function useRequestKey() {
  const previous = useRef<{ body: string; key: string } | null>(null);
  return (body: object) => {
    const serialized = JSON.stringify(body);
    if (previous.current?.body !== serialized) {
      previous.current = { body: serialized, key: crypto.randomUUID() };
    }
    return previous.current.key;
  };
}

interface InventoryOption {
  id: string;
  product: { name: string };
  warehouse: { name: string };
}

export function CreateProductionLotModal({ onClose, onCreated }: {
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const refresh = useLotRefresh();
  const requestKey = useRequestKey();
  const [form, setForm] = useState({ inventoryId: '', batchNumber: '', declaredQuantity: '1',
    harvestDate: '', manufactureDate: '', expiryDate: '', supplier: '' });
  const inventoryQuery = useQuery({
    queryKey: ['lot-inventory-options'],
    queryFn: async () => {
      const result: InventoryOption[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get(`/api/v1/inventory?page=${page}&limit=100`);
        result.push(...(response.data.data ?? []));
        totalPages = response.data.meta?.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages);
      return result;
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const body = { inventoryId: form.inventoryId, batchNumber: form.batchNumber.trim() || undefined,
        declaredQuantity: Number(form.declaredQuantity), harvestDate: form.harvestDate || undefined,
        manufactureDate: form.manufactureDate || undefined, expiryDate: form.expiryDate || undefined,
        supplier: form.supplier.trim() || undefined };
      return api.post('/api/v1/supply-chain/batches', { ...body, idempotencyKey: requestKey(body) });
    },
    onSuccess: async (response) => {
      await refresh();
      onCreated(response.data.data.id);
      toast.success('Đã tạo hồ sơ nháp. Hoàn thiện nguồn gốc và công đoạn trước khi gửi kho.');
      onClose();
    },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <Modal isOpen onClose={() => { if (!mutation.isPending) onClose(); }} title="Seller khai báo lô sản xuất">
    <form onSubmit={submit} className="space-y-4">
      <p>Hồ sơ nháp chưa làm tăng tồn kho. Warehouse Manager sẽ xác nhận số lượng thực nhận.</p>
      {inventoryQuery.isPending && <p role="status">Đang tải sản phẩm/kho…</p>}
      {inventoryQuery.isError && <p role="alert">{message(inventoryQuery.error)}</p>}
      {inventoryQuery.isSuccess && !inventoryQuery.data.length && <p role="status">Chưa có sản phẩm trong kho của bạn. Nhờ Admin gán kho cho Seller, sau đó thêm sản phẩm đã duyệt tại Quản lý Kho.</p>}
      <fieldset disabled={mutation.isPending} className="space-y-3">
        <label className="block">Sản phẩm / kho đích *<select required value={form.inventoryId} onChange={(e) => setForm({ ...form, inventoryId: e.target.value })} className={fieldClass}>
          <option value="">Chọn sản phẩm và kho</option>
          {inventoryQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.product.name} — {item.warehouse.name}</option>)}
        </select></label>
        <label className="block">Mã lô (để trống: tự sinh)<input maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._/\-]*" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} className={fieldClass} /></label>
        <label className="block">Số lượng khai báo *<input required type="number" min={1} step={1} value={form.declaredQuantity} onChange={(e) => setForm({ ...form, declaredQuantity: e.target.value })} className={fieldClass} /></label>
        <p className="text-xs">Cần ít nhất ngày thu hoạch hoặc ngày sản xuất.</p>
        <label className="block">Ngày thu hoạch<input type="date" required={!form.manufactureDate} value={form.harvestDate} onChange={(e) => setForm({ ...form, harvestDate: e.target.value })} className={fieldClass} /></label>
        <label className="block">Ngày sản xuất<input type="date" value={form.manufactureDate} onChange={(e) => setForm({ ...form, manufactureDate: e.target.value })} className={fieldClass} /></label>
        <label className="block">Hạn sử dụng<input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className={fieldClass} /></label>
        <label className="block">Nguồn cung cấp<input maxLength={250} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={fieldClass} /></label>
      </fieldset>
      {mutation.isError && <p role="alert" className="text-red-600">{message(mutation.error)}</p>}
      <Button type="submit" disabled={mutation.isPending || !form.inventoryId} isLoading={mutation.isPending}>Tạo hồ sơ lô</Button>
    </form>
  </Modal>;
}

export interface LifecycleBatch {
  id: string; lifecycleStatus?: string; declaredQuantity: number; quantity: number;
  journeys?: Array<{ stage?: { name: string } }>;
  lifecycleEvents?: Array<{ id: string; action: string; eventTime: string; note?: string; actor?: { fullName: string } }>;
}

export function BatchLifecyclePanel({ batch, role }: { batch: LifecycleBatch; role: string }) {
  const refresh = useLotRefresh();
  const [action, setAction] = useState('');
  const putAway = batch.lifecycleEvents?.some((event) => event.action === 'PUT_AWAY');
  const available = role === 'SELLER' && batch.lifecycleStatus === 'DRAFT' ? 'submit'
    : role === 'WAREHOUSE_MANAGER' && batch.lifecycleStatus === 'SUBMITTED' ? 'receive'
    : role === 'QUALITY_ASSURANCE' && batch.lifecycleStatus === 'QUARANTINED' ? 'inspect'
    : role === 'WAREHOUSE_MANAGER' && batch.lifecycleStatus === 'QC_PASSED' && !putAway ? 'put-away'
    : role === 'QUALITY_ASSURANCE' && batch.lifecycleStatus === 'QC_PASSED' && putAway ? 'release' : '';
  return <section className="rounded-2xl border border-emerald-200 bg-white p-5 dark:bg-slate-900">
    <h2 className="font-bold">Vòng đời lô: {labels[batch.lifecycleStatus ?? ''] ?? 'Chưa có trạng thái lifecycle'}</h2>
    <p className="mt-2 text-sm">Khai báo: {batch.declaredQuantity ?? '—'} · Tồn thực tế: {batch.quantity}</p>
    <p className="mt-2 text-sm text-slate-500">Seller khai báo → Kho tiếp nhận/cách ly → QA kiểm định → Kho xếp vị trí → QA phát hành → Kho tạo vận đơn và bàn giao cho hãng → Hãng vận chuyển cập nhật tracking.</p>
    {available && <Button type="button" className="mt-3" onClick={() => setAction(available)}>{actionLabels[available]}</Button>}
    {!!batch.lifecycleEvents?.length && <details className="mt-3 text-sm"><summary className="cursor-pointer">Nhật ký chuyển trạng thái ({batch.lifecycleEvents.length})</summary>
      <ol className="mt-2 space-y-2">{batch.lifecycleEvents.map((event) => <li key={event.id}>
        {new Date(event.eventTime).toLocaleString('vi-VN')} — {event.action} — {event.actor?.fullName ?? 'Hệ thống'}{event.note ? `: ${event.note}` : ''}
      </li>)}</ol>
    </details>}
    {action && <LotActionModal key={`${batch.id}:${action}`} batch={batch} action={action} onClose={() => setAction('')} onSuccess={refresh} />}
  </section>;
}

const actionLabels: Record<string, string> = { submit: 'Gửi hồ sơ đến kho', receive: 'Xác nhận tiếp nhận', inspect: 'Ghi kết quả QA', 'put-away': 'Xác nhận vị trí kho', release: 'Phát hành lô để xuất bán' };

function LotActionModal({ batch, action, onClose, onSuccess }: { batch: LifecycleBatch; action: string; onClose: () => void; onSuccess: () => Promise<void> }) {
  const requestKey = useRequestKey();
  const uploads = useRef(new Map<File, string>());
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    referenceCode: '',
    note: '',
    receivedQuantity: String(batch.declaredQuantity),
    qualityStatus: 'PASSED',
    warehouseLocation: '',
  });
  const evidenceRequired = action === 'receive' || action === 'inspect';
  const mutation = useMutation({
    mutationFn: async () => {
      if (evidenceRequired && !files.length) throw new Error('Cần ảnh minh chứng thực tế.');
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw new Error('Mỗi ảnh phải nhỏ hơn hoặc bằng 10 MB.');
        if (!uploads.current.has(file)) {
          const body = new FormData(); body.append('file', file);
          const response = await api.post('/api/v1/media/upload?folder=supply-chain', body, { headers: { 'Content-Type': 'multipart/form-data' } });
          uploads.current.set(file, response.data.data.url);
        }
      }
      const body = {
        location: form.location.trim() || undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        note: form.note.trim() || undefined,
        referenceCode: form.referenceCode.trim() || undefined,
        imageUrls: files.map((file) => uploads.current.get(file)!),
        ...(action === 'receive' ? { receivedQuantity: Number(form.receivedQuantity) } : {}),
        ...(action === 'inspect' ? { qualityStatus: form.qualityStatus } : {}),
        ...(action === 'put-away' ? { warehouseLocation: form.warehouseLocation.trim() } : {}),
      };
      return api.post(`/api/v1/supply-chain/batch/${batch.id}/${action}`, { ...body, idempotencyKey: requestKey(body) });
    },
    onSuccess: async () => { await onSuccess(); toast.success('Đã ghi nhận thao tác và nhật ký lô.'); onClose(); },
  });
  return <Modal isOpen title={actionLabels[action]} onClose={() => { if (!mutation.isPending) onClose(); }}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      {action === 'submit' && <p>Hồ sơ cần nguồn gốc đã xác minh và đầy đủ công đoạn sản xuất. Gửi hồ sơ không làm tăng tồn kho.</p>}
      <fieldset disabled={mutation.isPending} className="space-y-3">
        {action === 'receive' && <label className="block">Số lượng thực nhận *<input required min={1} max={batch.declaredQuantity} step={1} type="number" className={fieldClass} value={form.receivedQuantity} onChange={(e) => setForm({ ...form, receivedQuantity: e.target.value })} /></label>}
        {action === 'inspect' && <label className="block">Kết quả *<select className={fieldClass} value={form.qualityStatus} onChange={(e) => setForm({ ...form, qualityStatus: e.target.value })}><option value="PASSED">Đạt</option><option value="FAILED">Không đạt</option></select></label>}
        {action === 'put-away' && <label className="block">Vị trí lưu trữ *<input required className={fieldClass} maxLength={250} value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} /></label>}
        <LocationPicker
          label="Địa điểm thực hiện"
          required={action !== 'submit' && action !== 'release'}
          value={form.location}
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={({ location, latitude, longitude }) => setForm((prev) => ({ ...prev, location, latitude, longitude }))}
          placeholder={action === 'receive' || action === 'put-away' ? 'Gõ tìm kiếm kho hàng hoặc chọn trên bản đồ...' : 'Nhập địa điểm hoặc chọn trên bản đồ...'}
        />
        <label className="block">Mã chứng từ / biên bản<input required={evidenceRequired || action === 'release'} maxLength={200} className={fieldClass} value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} /></label>
        <label className="block">Kết luận / ghi chú<textarea required={action === 'inspect' || action === 'release'} maxLength={5000} className={fieldClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <label className="block">Ảnh minh chứng{evidenceRequired ? ' *' : ''}<input type="file" multiple accept="image/jpeg,image/png,image/webp" className={fieldClass} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
        <p className="text-xs">Tối đa 10 ảnh, mỗi ảnh tối đa 10 MB. Thời điểm ghi nhận lấy từ máy chủ.</p>
      </fieldset>
      {mutation.isError && <p role="alert" className="text-red-600">{message(mutation.error)}</p>}
      <Button type="submit" isLoading={mutation.isPending} disabled={mutation.isPending || files.length > 10}>{actionLabels[action]}</Button>
    </form>
  </Modal>;
}

export function QualityAccountsModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const query = useQuery({ queryKey: ['quality-assurance-users'], queryFn: async () => (await api.get('/api/v1/users/quality-assurance')).data.data as Array<{ id: string; fullName: string; email: string }> });
  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/users/quality-assurance', { ...form, fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined }),
    onSuccess: () => { setForm({ fullName: '', email: '', phone: '', password: '' }); void query.refetch(); toast.success('Đã tạo QA. Người dùng phải đổi mật khẩu khi đăng nhập.'); },
  });
  return <Modal isOpen title="Tài khoản QA/QC độc lập" onClose={() => { if (!mutation.isPending) onClose(); }}>
    <p>QA kiểm định và phát hành lô; không tự khai báo lô, nhập kho hoặc giao hàng.</p>
    {query.isError && <p role="alert">{message(query.error)}</p>}
    <ul className="my-3">{query.data?.map((user) => <li key={user.id}>{user.fullName} — {user.email}</li>)}</ul>
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <fieldset disabled={mutation.isPending}>
        <label className="block">Họ tên *<input required minLength={2} maxLength={100} className={fieldClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
        <label className="block">Email *<input required type="email" className={fieldClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="block">Điện thoại<input type="tel" className={fieldClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="block">Mật khẩu tạm *<input required type="password" autoComplete="new-password" minLength={8} maxLength={72} className={fieldClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <p className="text-xs">Ít nhất 8 ký tự, có chữ hoa, chữ thường và số.</p>
      </fieldset>
      {mutation.isError && <p role="alert" className="text-red-600">{message(mutation.error)}</p>}
      <Button type="submit" disabled={mutation.isPending} isLoading={mutation.isPending}>Tạo tài khoản QA</Button>
    </form>
  </Modal>;
}
