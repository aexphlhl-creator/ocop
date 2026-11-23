"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

export type TraceabilityRequirement = {
  code: string;
  label: string;
  applicable?: boolean;
  complete: boolean;
};

export type TraceabilityVerification = {
  status: string;
  score: number;
  dataComplete: boolean;
  masterDataVerified: boolean;
  fullyVerified: boolean;
  requirements: TraceabilityRequirement[];
  missing: string[];
};

export function TraceabilityMatrix({
  verification,
}: {
  verification?: TraceabilityVerification | null;
}) {
  if (!verification) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8" />
        Chưa có dữ liệu để đánh giá ma trận truy xuất.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="font-black text-slate-900 dark:text-white">
              Ma trận GS1 CTE/KDE
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Who · What · Where · When · Why và chuỗi lô đầu vào–đầu ra
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-emerald-600">
            {verification.score}%
          </p>
          <p className="text-xs font-semibold text-slate-500">
            {verification.fullyVerified
              ? "Đã xác minh đầy đủ"
              : verification.status === "RECORDED_UNVERIFIED"
                ? "Đủ dữ liệu, chờ xác minh chủ thể"
                : "Hồ sơ chưa đầy đủ"}
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${verification.score}%` }}
        />
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {verification.requirements.map((item) => (
          <div
            key={item.code}
            className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
              item.applicable === false
                ? "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                : item.complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
            }`}
          >
            {item.applicable === false ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center font-black">
                —
              </span>
            ) : item.complete ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span className="font-semibold">{item.label}</span>
            <span className="ml-auto text-[10px] font-black uppercase tracking-wide">
              {item.applicable === false
                ? "Không áp dụng"
                : item.complete
                  ? "Đủ"
                  : "Thiếu"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
