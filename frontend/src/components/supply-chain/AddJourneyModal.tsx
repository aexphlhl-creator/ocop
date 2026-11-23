'use client';

import React, { useMemo, useState } from 'react';
import { ClipboardCheck, FileUp } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { LocationPicker } from '../ui/location-picker';

export interface SupplyChainStageOption {
  id: string;
  name: string;
  displayName: string;
  order: number;
  description?: string | null;
}

interface BatchJourneySummary {
  stage?: SupplyChainStageOption;
}

interface JourneyBatchSummary {
  batchNumber?: string;
  qualityStatus?: string;
  journeys?: BatchJourneySummary[];
}

export interface JourneySubmission {
  stageId: string;
  location: string;
  latitude?: number;
  longitude?: number;
  actorName: string;
  note?: string;
  eventTime: string;
  qualityStatus?: string;
  proofUrls: string[];
  files: File[];
}

interface AddJourneyModalProps {
  batch: JourneyBatchSummary;
  stages: SupplyChainStageOption[];
  actorName: string;
  role: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (submission: JourneySubmission) => void;
}

function defaultLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AddJourneyModal({
  batch,
  stages,
  actorName,
  role,
  isPending,
  onClose,
  onSubmit,
}: AddJourneyModalProps) {
  const latestStage = batch.journeys?.[batch.journeys.length - 1]?.stage;
  const availableStages = useMemo(() => {
    if (role !== 'SELLER') return [];
    const sequence = ['HARVEST', 'PROCESSING', 'PACKAGING'];
    const recorded = batch.journeys?.filter((journey) =>
      sequence.includes(journey.stage?.name ?? ''),
    ).length ?? 0;
    return stages.filter((stage) => stage.name === sequence[recorded]);
  }, [batch.journeys, role, stages]);

  const [stageId, setStageId] = useState(availableStages[0]?.id ?? '');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number>();
  const [longitude, setLongitude] = useState<number>();
  const [eventTime, setEventTime] = useState(defaultLocalDateTime);
  const [note, setNote] = useState('');
  const [qualityStatus, setQualityStatus] = useState('');
  const [proofUrlsText, setProofUrlsText] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const selectedStage = stages.find((stage) => stage.id === stageId);
  const proofUrls = proofUrlsText
    .split('\n')
    .map((url) => url.trim())
    .filter(Boolean);
  const evidenceCount = proofUrls.length + files.length;
  const isQualityInspection = selectedStage?.name === 'QUALITY_INSPECTION';

  const isValid =
    Boolean(stageId && location.trim() && actorName.trim() && eventTime) &&
    (!isQualityInspection ||
      Boolean(qualityStatus && note.trim() && evidenceCount > 0));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || isPending) return;

    onSubmit({
      stageId,
      location: location.trim(),
      latitude,
      longitude,
      actorName: actorName.trim(),
      note: note.trim() || undefined,
      eventTime: new Date(eventTime).toISOString(),
      qualityStatus: isQualityInspection ? qualityStatus : undefined,
      proofUrls,
      files,
    });
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
  const labelClass =
    'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Ghi nhận hành trình · ${batch.batchNumber ?? ''}`}
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-bold">
            <ClipboardCheck className="h-4 w-4" />
            Công đoạn hiện tại: {latestStage?.displayName ?? 'Chưa có hành trình'}
          </div>
          <p className="mt-1">
            Dữ liệu được ghi append-only. Danh tính người ghi nhận lấy trực tiếp từ tài khoản đăng nhập.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Công đoạn tiếp theo *</label>
            <select
              value={stageId}
              onChange={(event) => setStageId(event.target.value)}
              className={inputClass}
              required
            >
              {availableStages.length === 0 && (
                <option value="">Hành trình đã hoàn tất</option>
              )}
              {availableStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.order}. {stage.displayName}
                </option>
              ))}
            </select>
            {selectedStage?.description && (
              <p className="mt-1 text-xs text-slate-400">{selectedStage.description}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Thời điểm thực tế *</label>
            <input
              type="datetime-local"
              value={eventTime}
              max={defaultLocalDateTime()}
              onChange={(event) => setEventTime(event.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Người ghi nhận *</label>
            <input
              value={actorName}
              className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500 dark:bg-slate-800`}
              readOnly
              aria-readonly="true"
            />
            <p className="mt-1 text-[11px] text-slate-400">Không thể sửa để bảo đảm audit trail.</p>
          </div>

          <div className="col-span-1 md:col-span-2">
            <LocationPicker
              label="Địa điểm thực hiện"
              required
              value={location}
              latitude={latitude}
              longitude={longitude}
              onChange={({ location: nextLoc, latitude: nextLat, longitude: nextLng }) => {
                setLocation(nextLoc);
                setLatitude(nextLat ?? undefined);
                setLongitude(nextLng ?? undefined);
              }}
              placeholder="Nhập địa điểm thực hiện hoặc chọn từ gợi ý/bản đồ..."
            />
          </div>
        </div>

        {isQualityInspection && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20">
            <label className={labelClass}>Kết quả kiểm định *</label>
            <select
              value={qualityStatus}
              onChange={(event) => setQualityStatus(event.target.value)}
              className={inputClass}
              required
            >
              <option value="">-- Chọn kết quả --</option>
              <option value="PASSED">Đạt chất lượng</option>
              <option value="FAILED">Không đạt</option>
              <option value="QUARANTINE">Cách ly chờ xử lý</option>
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>
            Ghi chú {isQualityInspection ? '*' : ''}
          </label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={`${inputClass} min-h-24 resize-y`}
            placeholder="Mô tả điều kiện, kết quả kiểm tra hoặc thông tin bàn giao..."
            required={isQualityInspection}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>
              Tệp minh chứng {isQualityInspection ? '*' : ''}
            </label>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 text-center transition hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-800/30">
              <FileUp className="mb-2 h-6 w-6 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Chọn ảnh, PDF hoặc tài liệu
              </span>
              <span className="mt-1 text-[11px] text-slate-400">
                {files.length > 0 ? `${files.length} tệp đã chọn` : 'Tối đa 10 MB/tệp'}
              </span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                className="hidden"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>
          <div>
            <label className={labelClass}>Hoặc URL minh chứng</label>
            <textarea
              value={proofUrlsText}
              onChange={(event) => setProofUrlsText(event.target.value)}
              className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
              placeholder={'https://.../minh-chung-1.jpg\nhttps://.../bien-ban.pdf'}
            />
            <p className="mt-1 text-[11px] text-slate-400">Mỗi URL trên một dòng.</p>
          </div>
        </div>

        {isQualityInspection && evidenceCount === 0 && (
          <p className="text-xs font-semibold text-amber-600">
            Cần ít nhất một tệp hoặc URL minh chứng để xác nhận công đoạn này.
          </p>
        )}

        <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
          <Button type="submit" disabled={!isValid || isPending} isLoading={isPending}>
            <ClipboardCheck className="h-4 w-4" />
            Ghi nhận công đoạn
          </Button>
        </div>
      </form>
    </Modal>
  );
}
