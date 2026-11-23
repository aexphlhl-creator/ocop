'use client';

import { FileUp, Handshake, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { LocationPicker } from '../ui/location-picker';
import { ShipmentRecord } from './types';

export type ShipmentActionKind = 'handover' | 'cancel';

export interface ShipmentActionSubmission {
  kind: ShipmentActionKind;
  payload: Record<string, unknown>;
  proofUrls: string[];
  files: File[];
}

interface ShipmentActionModalProps {
  kind: ShipmentActionKind;
  shipment: ShipmentRecord;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (submission: ShipmentActionSubmission) => void;
}

function defaultLocalDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const titles: Record<ShipmentActionKind, string> = {
  handover: 'Bàn giao cho hãng vận chuyển',
  cancel: 'Hủy vận đơn',
};

export function ShipmentActionModal({
  kind,
  shipment,
  isPending,
  onClose,
  onSubmit,
}: ShipmentActionModalProps) {
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [eventTime, setEventTime] = useState(defaultLocalDateTime);
  const [note, setNote] = useState('');
  const [proofUrlsText, setProofUrlsText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const proofUrls = proofUrlsText
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  const evidenceCount = proofUrls.length + files.length;

  const valid =
    (kind === 'handover' && Boolean(location.trim() && evidenceCount > 0)) ||
    (kind === 'cancel' && Boolean(reason.trim()));

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
  const labelClass =
    'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500';

  const submit = () => {
    const base = {
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    };
    if (kind === 'cancel') {
      onSubmit({
        kind,
        payload: { ...base, reason: reason.trim() },
        proofUrls: [],
        files: [],
      });
      return;
    }

    onSubmit({
      kind,
      payload: {
        ...base,
        location: location.trim(),
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        eventTime: new Date(eventTime).toISOString(),
        note: note.trim() || undefined,
      },
      proofUrls,
      files,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${titles[kind]} · ${shipment.shipmentNumber}`}
      className="max-w-2xl"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !isPending) submit();
        }}
      >
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
          Hãng vận chuyển: <strong>{shipment.carrierOrganization.name}</strong>
          {' · '}Mã vận đơn: <strong>{shipment.trackingCode}</strong>
        </div>

        {kind === 'cancel' && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
            <div className="mb-3 flex items-center gap-2 font-bold text-red-700">
              <XCircle className="h-4 w-4" /> Chỉ hủy trước khi bàn giao cho
              hãng
            </div>
            <label className={labelClass}>Lý do hủy *</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`${inputClass} min-h-24`}
              required
            />
          </div>
        )}

        {kind === 'handover' && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <LocationPicker
                  label="Địa điểm bàn giao"
                  required
                  value={location}
                  latitude={latitude}
                  longitude={longitude}
                  onChange={({ location: loc, latitude: lat, longitude: lng }) => {
                    setLocation(loc);
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  placeholder="Nhập kho/bưu cục bàn giao hoặc chọn trên bản đồ..."
                />
              </div>
              <div>
                <label className={labelClass}>Thời điểm bàn giao *</label>
                <input
                  type="datetime-local"
                  value={eventTime}
                  max={defaultLocalDateTime()}
                  onChange={(event) => setEventTime(event.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Ghi chú</label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={`${inputClass} min-h-20`}
                  placeholder="VD: đã bàn giao cho bưu cục/hãng, số kiện, biên bản..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Tệp minh chứng bàn giao *</label>
                <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800/30">
                  <FileUp className="mb-2 h-6 w-6 text-emerald-500" />
                  <span className="text-xs font-semibold">
                    {files.length
                      ? `${files.length} tệp đã chọn`
                      : 'Chọn ảnh hoặc tài liệu'}
                  </span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                    onChange={(event) =>
                      setFiles(Array.from(event.target.files ?? []))
                    }
                  />
                </label>
              </div>
              <div>
                <label className={labelClass}>Hoặc URL minh chứng</label>
                <textarea
                  value={proofUrlsText}
                  onChange={(event) => setProofUrlsText(event.target.value)}
                  className={`${inputClass} min-h-28 font-mono text-xs`}
                  placeholder={
                    'https://.../handover-proof.jpg\nhttps://.../document.pdf'
                  }
                />
              </div>
            </div>
            {evidenceCount === 0 && (
              <p className="text-xs font-semibold text-amber-600">
                Cần ít nhất một minh chứng bàn giao cho hãng.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Đóng
          </Button>
          <Button
            type="submit"
            disabled={!valid || isPending}
            isLoading={isPending}
            variant={kind === 'cancel' ? 'destructive' : 'primary'}
          >
            {kind === 'handover' ? (
              <Handshake className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Xác nhận
          </Button>
        </div>
      </form>
    </Modal>
  );
}
