"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, MapPin, Plus, Sprout, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../services/api";
import { Button } from "../ui/button";

type TraceabilityLocation = {
  id: string;
  code: string;
  name: string;
  address: string;
  type: string;
  isVerified: boolean;
};

type TraceabilityParty = {
  id: string;
  code: string;
  name: string;
  type: string;
  isVerified: boolean;
  locations: TraceabilityLocation[];
};

type BatchOption = {
  id: string;
  batchNumber: string;
  initialQuantity: number;
  inventory?: { product?: { name?: string }; productId?: string };
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950";

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null
  ) {
    const data = error.response.data as {
      message?: string;
      error?: { message?: string };
    };
    return data.error?.message ?? data.message ?? "Không thể lưu dữ liệu";
  }
  return error instanceof Error ? error.message : "Không thể lưu dữ liệu";
}

export function TraceabilityOriginModal({
  batchId,
  batchNumber,
  batches,
  currentRevision,
  onClose,
  onSaved,
}: {
  batchId: string;
  batchNumber: string;
  batches: BatchOption[];
  currentRevision: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [partyId, setPartyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sourceLotCode, setSourceLotCode] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [productionMethod, setProductionMethod] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState("");
  const [changeReason, setChangeReason] = useState("");

  const [partyForm, setPartyForm] = useState({
    code: "",
    name: "",
    type: "FARMER",
    gln: "",
    taxCode: "",
  });
  const [locationForm, setLocationForm] = useState({
    code: "",
    name: "",
    type: "FARM",
    address: "",
    ward: "",
    province: "",
    latitude: "",
    longitude: "",
  });
  const [materialForm, setMaterialForm] = useState({
    inputBatchId: "",
    quantity: "",
    unit: "",
    processReference: "",
    evidenceUrls: "",
  });

  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["traceability-parties"],
    queryFn: async () => {
      const response = await api.get(
        "/api/v1/supply-chain/traceability/parties",
      );
      return (response.data.data ?? []) as TraceabilityParty[];
    },
  });
  const selectedParty = parties.find((party) => party.id === partyId);
  const materialBatches = useMemo(
    () => batches.filter((batch) => batch.id !== batchId),
    [batchId, batches],
  );

  const createParty = useMutation({
    mutationFn: () =>
      api.post("/api/v1/supply-chain/traceability/parties", {
        ...partyForm,
        gln: partyForm.gln || undefined,
        taxCode: partyForm.taxCode || undefined,
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ["traceability-parties"],
      });
      setPartyId(response.data.data.id as string);
      setLocationId("");
      toast.success("Đã tạo chủ thể nguồn gốc; đang chờ Admin xác minh.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const createLocation = useMutation({
    mutationFn: () =>
      api.post(
        `/api/v1/supply-chain/traceability/parties/${partyId}/locations`,
        {
          ...locationForm,
          countryCode: "VN",
          latitude: locationForm.latitude
            ? Number(locationForm.latitude)
            : undefined,
          longitude: locationForm.longitude
            ? Number(locationForm.longitude)
            : undefined,
        },
      ),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ["traceability-parties"],
      });
      setLocationId(response.data.data.id as string);
      toast.success("Đã tạo địa điểm nguồn gốc.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const declareOrigin = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/supply-chain/batch/${batchId}/origin`, {
        partyId,
        locationId,
        sourceLotCode,
        countryCode: "VN",
        harvestDate: harvestDate
          ? new Date(`${harvestDate}T00:00:00+07:00`).toISOString()
          : undefined,
        manufactureDate: manufactureDate
          ? new Date(`${manufactureDate}T00:00:00+07:00`).toISOString()
          : undefined,
        productionMethod: productionMethod || undefined,
        evidenceUrls: evidenceUrls
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        changeReason: changeReason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Đã ghi bản khai nguồn gốc bất biến cho lô hàng.");
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const linkMaterial = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/supply-chain/batch/${batchId}/material-links`, {
        inputBatchId: materialForm.inputBatchId,
        quantity: Number(materialForm.quantity),
        unit: materialForm.unit,
        processReference: materialForm.processReference,
        evidenceUrls: materialForm.evidenceUrls
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Đã liên kết lô nguyên liệu đầu vào.");
      setMaterialForm({
        inputBatchId: "",
        quantity: "",
        unit: "",
        processReference: "",
        evidenceUrls: "",
      });
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submitOrigin = (event: FormEvent) => {
    event.preventDefault();
    declareOrigin.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2 className="text-lg font-black">Hồ sơ nguồn gốc theo lô</h2>
            <p className="font-mono text-xs text-slate-500">{batchNumber}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-2">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Sprout className="h-5 w-5 text-emerald-600" />
              <h3 className="font-black">1. Chủ thể và địa điểm nguồn</h3>
            </div>

            <label className="block text-sm font-semibold">
              Chủ thể nguồn gốc
              <select
                className={`${inputClass} mt-1`}
                value={partyId}
                onChange={(event) => {
                  setPartyId(event.target.value);
                  setLocationId("");
                }}
                disabled={isLoading}
              >
                <option value="">Chọn chủ thể...</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name} · {party.code}
                    {party.isVerified ? " · Đã xác minh" : " · Chờ xác minh"}
                  </option>
                ))}
              </select>
            </label>

            <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <summary className="cursor-pointer text-sm font-bold text-emerald-700">
                <Plus className="mr-1 inline h-4 w-4" /> Tạo chủ thể mới
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className={inputClass}
                  placeholder="Mã chủ thể *"
                  value={partyForm.code}
                  onChange={(event) =>
                    setPartyForm((value) => ({
                      ...value,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Tên chủ thể *"
                  value={partyForm.name}
                  onChange={(event) =>
                    setPartyForm((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                />
                <select
                  className={inputClass}
                  value={partyForm.type}
                  onChange={(event) =>
                    setPartyForm((value) => ({
                      ...value,
                      type: event.target.value,
                    }))
                  }
                >
                  <option value="FARMER">Nông hộ</option>
                  <option value="PRODUCER">Nhà sản xuất</option>
                  <option value="SUPPLIER">Nhà cung cấp</option>
                  <option value="PROCESSOR">Đơn vị chế biến</option>
                  <option value="OTHER">Khác</option>
                </select>
                <input
                  className={inputClass}
                  placeholder="GLN 13 số (nếu có)"
                  value={partyForm.gln}
                  onChange={(event) =>
                    setPartyForm((value) => ({
                      ...value,
                      gln: event.target.value,
                    }))
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Mã số thuế"
                  value={partyForm.taxCode}
                  onChange={(event) =>
                    setPartyForm((value) => ({
                      ...value,
                      taxCode: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  disabled={
                    !partyForm.code || !partyForm.name || createParty.isPending
                  }
                  onClick={() => createParty.mutate()}
                >
                  Tạo chủ thể
                </Button>
              </div>
            </details>

            <label className="block text-sm font-semibold">
              Địa điểm nguồn gốc
              <select
                className={`${inputClass} mt-1`}
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                disabled={!selectedParty}
              >
                <option value="">Chọn địa điểm...</option>
                {selectedParty?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} · {location.code}
                  </option>
                ))}
              </select>
            </label>

            <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <summary className="cursor-pointer text-sm font-bold text-emerald-700">
                <MapPin className="mr-1 inline h-4 w-4" /> Thêm địa điểm cho chủ
                thể đã chọn
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className={inputClass}
                  placeholder="Mã địa điểm *"
                  value={locationForm.code}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Tên địa điểm *"
                  value={locationForm.name}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                />
                <select
                  className={inputClass}
                  value={locationForm.type}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      type: event.target.value,
                    }))
                  }
                >
                  <option value="FARM">Trang trại</option>
                  <option value="FIELD">Vùng trồng</option>
                  <option value="COLLECTION_POINT">Điểm thu gom</option>
                  <option value="PROCESSING_FACILITY">Cơ sở chế biến</option>
                  <option value="PACKHOUSE">Cơ sở đóng gói</option>
                  <option value="OTHER">Khác</option>
                </select>
                <input
                  className={inputClass}
                  placeholder="Địa chỉ *"
                  value={locationForm.address}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      address: event.target.value,
                    }))
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Xã/phường"
                  value={locationForm.ward}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      ward: event.target.value,
                    }))
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Tỉnh/thành"
                  value={locationForm.province}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      province: event.target.value,
                    }))
                  }
                />
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  placeholder="Vĩ độ"
                  value={locationForm.latitude}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      latitude: event.target.value,
                    }))
                  }
                />
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  placeholder="Kinh độ"
                  value={locationForm.longitude}
                  onChange={(event) =>
                    setLocationForm((value) => ({
                      ...value,
                      longitude: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  disabled={
                    !partyId ||
                    !locationForm.code ||
                    !locationForm.name ||
                    !locationForm.address ||
                    createLocation.isPending
                  }
                  onClick={() => createLocation.mutate()}
                >
                  Tạo địa điểm
                </Button>
              </div>
            </details>

            <form
              className="space-y-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/20"
              onSubmit={submitOrigin}
            >
              <h4 className="font-black">2. Bản khai nguồn gốc</h4>
              <input
                className={inputClass}
                required
                placeholder="Mã lô tại nguồn *"
                value={sourceLotCode}
                onChange={(event) => setSourceLotCode(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Ngày thu hoạch
                  <input
                    className={`${inputClass} mt-1`}
                    type="date"
                    value={harvestDate}
                    onChange={(event) => setHarvestDate(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Ngày sản xuất/chế biến
                  <input
                    className={`${inputClass} mt-1`}
                    type="date"
                    value={manufactureDate}
                    onChange={(event) => setManufactureDate(event.target.value)}
                  />
                </label>
              </div>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="Phương thức canh tác/sản xuất"
                value={productionMethod}
                onChange={(event) => setProductionMethod(event.target.value)}
              />
              <textarea
                className={inputClass}
                rows={2}
                placeholder="URL minh chứng, mỗi dòng một URL"
                value={evidenceUrls}
                onChange={(event) => setEvidenceUrls(event.target.value)}
              />
              {(
                <textarea
                  className={inputClass}
                  required
                  rows={2}
                  placeholder="Lý do bổ sung/hiệu chỉnh (bắt buộc khi lô cách ly hoặc đã có bản khai)"
                  value={changeReason}
                  onChange={(event) => setChangeReason(event.target.value)}
                />
              )}
              <Button
                type="submit"
                disabled={
                  !partyId ||
                  !locationId ||
                  !sourceLotCode ||
                  (!harvestDate && !manufactureDate) ||
                  declareOrigin.isPending
                }
              >
                {currentRevision > 0
                  ? "Lưu revision mới"
                  : "Ghi nhận nguồn gốc"}
              </Button>
            </form>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-blue-600" />
              <h3 className="font-black">3. Phả hệ lô đầu vào–đầu ra</h3>
            </div>
            <p className="text-sm text-slate-500">
              Bắt buộc khi lô này được tạo từ công đoạn chế biến hoặc đóng gói.
            </p>
            <form
              className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
              onSubmit={(event) => {
                event.preventDefault();
                linkMaterial.mutate();
              }}
            >
              <select
                className={inputClass}
                required
                value={materialForm.inputBatchId}
                onChange={(event) =>
                  setMaterialForm((value) => ({
                    ...value,
                    inputBatchId: event.target.value,
                  }))
                }
              >
                <option value="">Chọn lô nguyên liệu đầu vào...</option>
                {materialBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.inventory?.product?.name ?? "Sản phẩm"} ·{" "}
                    {batch.batchNumber}
                  </option>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={inputClass}
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="Số lượng sử dụng"
                  value={materialForm.quantity}
                  onChange={(event) =>
                    setMaterialForm((value) => ({
                      ...value,
                      quantity: event.target.value,
                    }))
                  }
                />
                <input
                  className={inputClass}
                  required
                  placeholder="Đơn vị (kg, lít...)"
                  value={materialForm.unit}
                  onChange={(event) =>
                    setMaterialForm((value) => ({
                      ...value,
                      unit: event.target.value,
                    }))
                  }
                />
              </div>
              <input
                className={inputClass}
                required
                placeholder="Mã mẻ/mã công đoạn chế biến *"
                value={materialForm.processReference}
                onChange={(event) =>
                  setMaterialForm((value) => ({
                    ...value,
                    processReference: event.target.value,
                  }))
                }
              />
              <textarea
                className={inputClass}
                rows={2}
                placeholder="URL biên bản chế biến, mỗi dòng một URL"
                value={materialForm.evidenceUrls}
                onChange={(event) =>
                  setMaterialForm((value) => ({
                    ...value,
                    evidenceUrls: event.target.value,
                  }))
                }
              />
              <Button
                type="submit"
                variant="outline"
                disabled={
                  !materialForm.inputBatchId ||
                  !materialForm.quantity ||
                  !materialForm.unit ||
                  !materialForm.processReference ||
                  linkMaterial.isPending
                }
              >
                Liên kết lô nguyên liệu
              </Button>
            </form>

            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
              <strong>Quy tắc audit:</strong> bản khai nguồn gốc và quan hệ
              nguyên liệu là append-only. Khi hiệu chỉnh, hệ thống tạo revision
              mới và giữ nguyên lịch sử cũ; không sửa hoặc xóa dấu vết đã ghi.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
