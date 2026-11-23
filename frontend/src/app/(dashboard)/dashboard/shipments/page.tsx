"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  PackagePlus,
  RotateCcw,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  CreateShipmentModal,
  CreateShipmentPayload,
} from "../../../../components/shipments/CreateShipmentModal";
import {
  ShipmentActionKind,
  ShipmentActionModal,
  ShipmentActionSubmission,
} from "../../../../components/shipments/ShipmentActionModal";
import { ShipmentCard } from "../../../../components/shipments/ShipmentCard";
import { statusLabels } from "../../../../components/shipments/shipment-workflow";
import {
  LogisticsOrganization,
  FulfillmentOrderOption,
  ShipmentBatchOption,
  ShipmentRecord,
  ShipmentStatus,
} from "../../../../components/shipments/types";
import { Button } from "../../../../components/ui/button";
import { LoadingSpinner } from "../../../../components/ui/loading-spinner";
import { useCurrentUser } from "../../../../hooks/use-auth";
import { api } from "../../../../services/api";

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data
  ) {
    const value = error.response.data.message;
    return Array.isArray(value) ? value.join(", ") : String(value);
  }
  return error instanceof Error
    ? error.message
    : "Không thể xử lý chuyến hàng.";
}

async function uploadEvidence(submission: ShipmentActionSubmission) {
  const oversized = submission.files.find(
    (file) => file.size > 10 * 1024 * 1024,
  );
  if (oversized)
    throw new Error(`Tệp ${oversized.name} vượt quá giới hạn 10 MB.`);

  const imageUrls: string[] = [];
  const attachmentUrls: string[] = [];
  submission.proofUrls.forEach((url) => {
    if (/\.(jpe?g|png|webp)(?:\?|$)/i.test(url)) imageUrls.push(url);
    else attachmentUrls.push(url);
  });
  const uploaded = await Promise.all(
    submission.files.map(async (file) => {
      const body = new FormData();
      body.append("file", file);
      const response = await api.post(
        "/api/v1/media/upload?folder=shipments",
        body,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      const result = response.data?.data ?? response.data;
      return {
        url: result.url as string,
        image: file.type.startsWith("image/"),
      };
    }),
  );
  uploaded.forEach((file) =>
    file.image ? imageUrls.push(file.url) : attachmentUrls.push(file.url),
  );
  return { imageUrls, attachmentUrls };
}

export default function ShipmentsPage() {
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [action, setAction] = useState<{
    kind: ShipmentActionKind;
    shipment: ShipmentRecord;
  } | null>(null);

  const supportedRole = ["ADMIN", "SELLER", "WAREHOUSE_MANAGER"].includes(
    user?.role ?? "",
  );
  const { data: shipments = [], isLoading: isLoadingShipments } = useQuery({
    queryKey: ["shipments", status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (status) params.set("status", status);
      const response = await api.get(`/api/v1/shipments?${params.toString()}`);
      return (response.data.data?.data ?? []) as ShipmentRecord[];
    },
    enabled: supportedRole,
  });
  const { data: organizations = [] } = useQuery({
    queryKey: ["logistics-organizations"],
    queryFn: async () => {
      const response = await api.get("/api/v1/shipments/organizations");
      return (response.data.data ?? []) as LogisticsOrganization[];
    },
    enabled: ["ADMIN", "WAREHOUSE_MANAGER"].includes(user?.role ?? ""),
  });
  const { data: batches = [] } = useQuery({
    queryKey: ["supply-chain-all-batches"],
    queryFn: async () => {
      const response = await api.get("/api/v1/supply-chain/batches");
      return (response.data.data ?? []) as ShipmentBatchOption[];
    },
    enabled: user?.role === "WAREHOUSE_MANAGER",
  });
  const { data: fulfillmentOrders = [] } = useQuery({
    queryKey: ["shipment-fulfillment-orders"],
    queryFn: async () => {
      const response = await api.get("/api/v1/shipments/fulfillment-orders");
      return (response.data.data ?? []) as FulfillmentOrderOption[];
    },
    enabled: user?.role === "WAREHOUSE_MANAGER",
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    queryClient.invalidateQueries({ queryKey: ["supply-chain-all-batches"] });
    queryClient.invalidateQueries({
      queryKey: ["shipment-fulfillment-orders"],
    });
  };
  const createMutation = useMutation({
    mutationFn: (payload: CreateShipmentPayload) =>
      api.post("/api/v1/shipments", payload),
    onSuccess: () => {
      toast.success("Đã tạo chuyến và khóa phân bổ lô hàng.");
      setShowCreate(false);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: async ({
      shipment,
      submission,
    }: {
      shipment: ShipmentRecord;
      submission: ShipmentActionSubmission;
    }) => {
      let payload = submission.payload;
      if (submission.kind === "handover") {
        payload = { ...payload, ...(await uploadEvidence(submission)) };
      }
      const endpoint =
        submission.kind === "handover" ? "handover" : "cancel";
      return api.post(`/api/v1/shipments/${shipment.id}/${endpoint}`, payload);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật chuyến hàng và ghi audit event.");
      setAction(null);
      refresh();
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
  if (!supportedRole) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-red-100 bg-white p-10 text-center shadow-sm dark:border-red-900 dark:bg-slate-900">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h1 className="mt-4 text-xl font-black">
          Bạn không có quyền truy cập chuyến hàng
        </h1>
      </div>
    );
  }

  const counts = {
    active: shipments.filter((shipment) =>
      [
        "HANDED_OVER",
        "IN_TRANSIT",
        "AT_DISTRIBUTOR",
        "AT_RETAIL",
        "OUT_FOR_DELIVERY",
      ].includes(shipment.status),
    ).length,
    failed: shipments.filter(
      (shipment) => shipment.status === "DELIVERY_FAILED",
    ).length,
    delivered: shipments.filter((shipment) => shipment.status === "DELIVERED")
      .length,
    returns: shipments.filter(
      (shipment) =>
        shipment.status === "RETURNING" || shipment.status === "RETURNED",
    ).length,
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-slate-900 dark:text-white">
            <Truck className="h-7 w-7 text-blue-600" /> Quản lý chuyến hàng
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Phân bổ lô, tạo vận đơn, bàn giao cho hãng và theo dõi trạng thái
            từ carrier.
          </p>
        </div>
        {user?.role === "WAREHOUSE_MANAGER" && (
          <Button type="button" onClick={() => setShowCreate(true)}>
            <PackagePlus className="h-4 w-4" /> Tạo chuyến
          </Button>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {user?.role === "ADMIN" ? (
          <Eye className="h-5 w-5 shrink-0 text-violet-600" />
        ) : (
          <Truck className="h-5 w-5 shrink-0 text-emerald-600" />
        )}
        <div>
          <p className="font-bold text-slate-800 dark:text-white">
            {user?.role === "ADMIN"
              ? "Admin chỉ giám sát hãng vận chuyển, vận đơn và tracking."
              : user?.role === "WAREHOUSE_MANAGER"
                ? "Bạn tạo vận đơn với hãng, bàn giao hàng và hủy trước bàn giao khi cần."
                : "Bạn có quyền xem chuyến chứa lô hàng thuộc gian hàng của mình."}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Sau khi bàn giao, trạng thái giao hàng chỉ cập nhật qua webhook/API
            của hãng vận chuyển.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Đang vận chuyển",
            value: counts.active,
            icon: Clock3,
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: "Đã giao",
            value: counts.delivered,
            icon: CheckCircle2,
            color: "text-emerald-600 bg-emerald-50",
          },
          {
            label: "Giao thất bại",
            value: counts.failed,
            icon: AlertTriangle,
            color: "text-red-600 bg-red-50",
          },
          {
            label: "Hoàn hàng",
            value: counts.returns,
            icon: RotateCcw,
            color: "text-violet-600 bg-violet-50",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className={`rounded-xl p-2.5 ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">
                {value}
              </p>
              <p className="text-[10px] font-bold uppercase text-slate-400">
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setStatus("")}
          className={`rounded-full px-3 py-2 text-xs font-bold ${status === "" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
        >
          Tất cả
        </button>
        {(Object.keys(statusLabels) as ShipmentStatus[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-full px-3 py-2 text-xs font-bold ${status === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {statusLabels[value]}
          </button>
        ))}
      </div>

      {isLoadingShipments ? (
        <div className="flex min-h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : shipments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-20 text-center dark:border-slate-700 dark:bg-slate-900">
          <Truck className="mx-auto h-14 w-14 text-slate-300" />
          <h2 className="mt-4 text-lg font-black text-slate-800 dark:text-white">
            Chưa có chuyến hàng phù hợp
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Warehouse Manager tạo chuyến từ các lô đã đạt kiểm định.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {shipments.map((shipment) => (
            <ShipmentCard
              key={shipment.id}
              shipment={shipment}
              role={user?.role ?? ""}
              onAction={(kind, selected) =>
                setAction({ kind, shipment: selected })
              }
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateShipmentModal
          batches={batches}
          organizations={organizations}
          fulfillmentOrders={fulfillmentOrders}
          isPending={createMutation.isPending}
          onClose={() => !createMutation.isPending && setShowCreate(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      )}
      {action && (
        <ShipmentActionModal
          kind={action.kind}
          shipment={action.shipment}
          isPending={actionMutation.isPending}
          onClose={() => !actionMutation.isPending && setAction(null)}
          onSubmit={(submission) =>
            actionMutation.mutate({ shipment: action.shipment, submission })
          }
        />
      )}
    </div>
  );
}
