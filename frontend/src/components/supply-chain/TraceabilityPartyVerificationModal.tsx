"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPin, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../services/api";
import { Button } from "../ui/button";

type Party = {
  id: string;
  code: string;
  name: string;
  type: string;
  gln?: string | null;
  taxCode?: string | null;
  isVerified: boolean;
  locations: Array<{
    id: string;
    code: string;
    name: string;
    address: string;
    isVerified: boolean;
  }>;
};

export function TraceabilityPartyVerificationModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["traceability-parties"],
    queryFn: async () => {
      const response = await api.get(
        "/api/v1/supply-chain/traceability/parties",
      );
      return (response.data.data ?? []) as Party[];
    },
  });
  const verify = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.post(`/api/v1/supply-chain/traceability/parties/${id}/verification`, {
        verified,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["traceability-parties"],
      });
      toast.success("Đã cập nhật trạng thái xác minh chủ thể và địa điểm.");
    },
    onError: () => toast.error("Không thể cập nhật trạng thái xác minh."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Xác minh chủ
              thể nguồn gốc
            </h2>
            <p className="text-xs text-slate-500">
              Admin kiểm tra hồ sơ pháp lý trước khi cấp trạng thái Verified.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-6">
          {isLoading && <p className="text-sm text-slate-500">Đang tải...</p>}
          {!isLoading && parties.length === 0 && (
            <p className="text-sm text-slate-500">Chưa có chủ thể nguồn gốc.</p>
          )}
          {parties.map((party) => {
            const profileVerified =
              party.isVerified &&
              party.locations.length > 0 &&
              party.locations.every((location) => location.isVerified);

            return (
              <article
                key={party.id}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black">{party.name}</h3>
                      {profileVerified && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </div>
                    <p className="font-mono text-xs text-slate-500">
                      {party.gln ?? party.code} · {party.type}
                    </p>
                    {party.taxCode && (
                      <p className="text-xs text-slate-500">
                        MST: {party.taxCode}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={profileVerified ? "outline" : "primary"}
                    disabled={verify.isPending || party.locations.length === 0}
                    onClick={() =>
                      verify.mutate({
                        id: party.id,
                        verified: !profileVerified,
                      })
                    }
                  >
                    {profileVerified ? "Thu hồi xác minh" : "Xác minh hồ sơ"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {party.locations.map((location) => (
                    <div
                      key={location.id}
                      className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="font-bold">
                          {location.name} · {location.code}
                        </p>
                        <p className="text-slate-500">{location.address}</p>
                      </div>
                    </div>
                  ))}
                  {party.locations.length === 0 && (
                    <p className="text-xs text-amber-600">
                      Chưa có địa điểm nên chưa thể xác minh.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
