'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ExternalLink,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LogisticsOrganization } from '../../../../components/shipments/types';
import { Button } from '../../../../components/ui/button';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { api } from '../../../../services/api';

function errorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data
  ) {
    const message = error.response.data.message;
    return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return error instanceof Error
    ? error.message
    : 'Không thể lưu hãng vận chuyển.';
}

export default function CarrierProvidersPage() {
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const [showOrganizationForm, setShowOrganizationForm] = useState(false);
  const [organizationCode, setOrganizationCode] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [providerCode, setProviderCode] = useState('');
  const [trackingUrlTemplate, setTrackingUrlTemplate] = useState('');
  const [editingOrganization, setEditingOrganization] =
    useState<LogisticsOrganization | null>(null);

  const { data: organizations = [], isLoading: isLoadingOrganizations } =
    useQuery({
      queryKey: ['logistics-organizations'],
      queryFn: async () => {
        const response = await api.get(
          '/api/v1/shipments/organizations?includeInactive=true',
        );
        return (response.data.data ?? []) as LogisticsOrganization[];
      },
      enabled: isAdmin,
    });

  const resetForm = () => {
    setOrganizationCode('');
    setOrganizationName('');
    setProviderCode('');
    setTrackingUrlTemplate('');
    setEditingOrganization(null);
    setShowOrganizationForm(false);
  };

  const openEditForm = (organization: LogisticsOrganization) => {
    setEditingOrganization(organization);
    setOrganizationCode(organization.code);
    setOrganizationName(organization.name);
    setProviderCode(organization.providerCode ?? '');
    setTrackingUrlTemplate(organization.trackingUrlTemplate ?? '');
    setShowOrganizationForm(true);
  };

  const saveOrganizationMutation = useMutation({
    mutationFn: () => {
      const payload = {
        code: organizationCode.trim().toUpperCase(),
        name: organizationName.trim(),
        type: 'THIRD_PARTY',
        providerCode: providerCode.trim().toUpperCase() || undefined,
        trackingUrlTemplate: trackingUrlTemplate.trim() || undefined,
      };
      if (editingOrganization) {
        return api.patch(
          `/api/v1/shipments/organizations/${editingOrganization.id}`,
          payload,
        );
      }
      return api.post('/api/v1/shipments/organizations', payload);
    },
    onSuccess: () => {
      toast.success(
        editingOrganization
          ? 'Đã cập nhật hãng vận chuyển.'
          : 'Đã tạo hãng vận chuyển.',
      );
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['logistics-organizations'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggleOrganizationMutation = useMutation({
    mutationFn: (organization: LogisticsOrganization) =>
      api.patch(`/api/v1/shipments/organizations/${organization.id}`, {
        isActive: !(organization.isActive ?? true),
      }),
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái hãng vận chuyển.');
      queryClient.invalidateQueries({ queryKey: ['logistics-organizations'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoadingUser) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-red-100 bg-white p-10 text-center shadow-sm dark:border-red-900 dark:bg-slate-900">
        <ShieldCheck className="mx-auto h-12 w-12 text-red-500" />
        <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">
          Chỉ Admin được quản lý hãng vận chuyển
        </h1>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="rounded-3xl border border-white bg-gradient-to-r from-white to-blue-50 p-7 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-blue-950/20">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600">
              <ShieldCheck className="h-4 w-4" /> Chỉ dành cho Admin
            </div>
            <h1 className="flex items-center gap-3 text-2xl font-black text-slate-900 dark:text-white">
              <Truck className="h-7 w-7 text-blue-600" /> Hãng vận chuyển
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Hệ thống chỉ lưu hãng, mã vận đơn và webhook/tracking ngoài. OCOP
              không tạo nhân viên giao hàng nội bộ.
            </p>
          </div>
          <div className="flex min-w-36 items-center gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 dark:border-blue-900 dark:bg-slate-900">
            <Building2 className="h-6 w-6 text-blue-600" />
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">
                {organizations.length}
              </p>
              <p className="text-[11px] font-bold uppercase text-slate-400">
                Hãng đang cấu hình
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
              <Building2 className="h-5 w-5 text-blue-600" /> Danh sách hãng
            </h2>
            <p className="text-xs text-slate-400">
              Mã adapter dùng để nhận webhook, template tracking dùng để mở
              trang tra cứu ngoài.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (showOrganizationForm) resetForm();
              else setShowOrganizationForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> Tạo hãng
          </Button>
        </div>

        {showOrganizationForm && (
          <form
            className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2 dark:border-blue-900 dark:bg-blue-950/10"
            onSubmit={(event) => {
              event.preventDefault();
              if (organizationCode.trim() && organizationName.trim()) {
                saveOrganizationMutation.mutate();
              }
            }}
          >
            <div className="md:col-span-2">
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {editingOrganization
                  ? `Sửa hãng ${editingOrganization.name}`
                  : 'Tạo hãng vận chuyển mới'}
              </p>
              <p className="text-xs text-slate-500">
                Provider code phải khớp mã adapter/webhook mà backend nhận từ
                hãng.
              </p>
            </div>
            <input
              value={organizationCode}
              onChange={(event) =>
                setOrganizationCode(event.target.value.toUpperCase())
              }
              placeholder="Mã hãng, VD: GHN"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
              required
              pattern="[A-Z0-9_-]{2,50}"
            />
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Tên hãng vận chuyển"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
              required
            />
            <input
              value={providerCode}
              onChange={(event) =>
                setProviderCode(event.target.value.toUpperCase())
              }
              placeholder="Mã adapter webhook, VD: GHN"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
              pattern="[A-Z0-9_-]{2,50}"
            />
            <input
              value={trackingUrlTemplate}
              onChange={(event) => setTrackingUrlTemplate(event.target.value)}
              placeholder="https://.../{trackingCode}"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="flex justify-end md:col-span-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resetForm}
                disabled={saveOrganizationMutation.isPending}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                isLoading={saveOrganizationMutation.isPending}
                className="ml-2"
              >
                {editingOrganization ? 'Cập nhật hãng' : 'Lưu hãng'}
              </Button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoadingOrganizations ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : organizations.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400 dark:bg-slate-800/40">
              Chưa có hãng vận chuyển.
            </p>
          ) : (
            organizations.map((organization) => (
              <div
                key={organization.id}
                className="rounded-xl border border-slate-100 p-4 dark:border-slate-800"
              >
                <p className="font-bold text-slate-800 dark:text-white">
                  {organization.name}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {organization.code} · Adapter:{' '}
                  {organization.providerCode ?? 'chưa cấu hình'}
                </p>
                <p
                  className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    organization.isActive ?? true
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {organization.isActive ?? true ? 'Đang hoạt động' : 'Đã tắt'}
                </p>
                {organization.trackingUrlTemplate ? (
                  <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600">
                    <ExternalLink className="h-3.5 w-3.5" /> Có template
                    tracking
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-600">
                    Chưa có template tracking ngoài.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditForm(organization)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Sửa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => toggleOrganizationMutation.mutate(organization)}
                    disabled={toggleOrganizationMutation.isPending}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {organization.isActive ?? true ? 'Tắt' : 'Bật'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
