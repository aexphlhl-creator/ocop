"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { api } from "../../../../services/api";
import { useCurrentUser } from "../../../../hooks/use-auth";
import { LoadingSpinner } from "../../../../components/ui/loading-spinner";
import {
  GitBranch,
  MapPin,
  Package,
  Clock,
  ShieldCheck,
  Plus,
  List,
  Eye,
  Sprout,
} from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { toast } from "sonner";
import { BatchLifecyclePanel, CreateProductionLotModal, QualityAccountsModal } from "../../../../components/supply-chain/ProductionLotWorkflow";

// Components
import { BatchAutocomplete } from "../../../../components/supply-chain/BatchAutocomplete";
import { BatchTable } from "../../../../components/supply-chain/BatchTable";
import { BatchStatistics } from "../../../../components/supply-chain/BatchStatistics";
import { BatchOverview } from "../../../../components/supply-chain/BatchOverview";
import { QRCodeModal } from "../../../../components/supply-chain/QRCodeModal";
import { EmptyState } from "../../../../components/supply-chain/EmptyState";
import { BatchFilters } from "../../../../components/supply-chain/BatchFilters";
import { BatchHistory } from "../../../../components/supply-chain/BatchHistory";
import {
  AddJourneyModal,
  JourneySubmission,
  SupplyChainStageOption,
} from "../../../../components/supply-chain/AddJourneyModal";
import { TraceabilityOriginModal } from "../../../../components/supply-chain/TraceabilityOriginModal";
import { TraceabilityPartyVerificationModal } from "../../../../components/supply-chain/TraceabilityPartyVerificationModal";
import {
  TraceabilityMatrix,
  TraceabilityVerification,
} from "../../../../components/supply-chain/TraceabilityMatrix";

// Lazy loaded components (Task 11 - Performance)
const BatchTimeline = dynamic(
  () =>
    import("../../../../components/supply-chain/BatchTimeline").then(
      (mod) => mod.BatchTimeline,
    ),
  {
    loading: () => (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    ),
  },
);
const BatchInteractiveMap = dynamic(
  () => import("../../../../components/supply-chain/BatchInteractiveMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center h-[500px] items-center">
        <LoadingSpinner />
      </div>
    ),
  },
);

type Tab =
  "overview" | "origin" | "timeline" | "map" | "blockchain" | "history";

const SHIPMENT_STAGE_LABEL: Record<string, string> = {
  HANDED_OVER: "Bàn giao vận chuyển",
  PICKED_UP: "Đã lấy hàng",
  ARRIVED_DISTRIBUTOR: "Đến nhà phân phối",
  ARRIVED_RETAIL: "Đến điểm bán lẻ",
  OUT_FOR_DELIVERY: "Đang giao chặng cuối",
  DELIVERED: "Đã giao hàng",
  DELIVERY_FAILED: "Giao hàng thất bại",
  DELIVERY_RETRIED: "Giao lại",
  RETURN_STARTED: "Bắt đầu hoàn hàng",
  RETURNED: "Đã hoàn hàng",
  CANCELLED: "Đã hủy chuyến",
};

export default function SupplyChainPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showQR, setShowQR] = useState(false);
  const [showCreateLot, setShowCreateLot] = useState(false);
  const [showQualityAccounts, setShowQualityAccounts] = useState(false);
  const [showAddJourney, setShowAddJourney] = useState(false);
  const [showTraceabilityOrigin, setShowTraceabilityOrigin] = useState(false);
  const [showPartyVerification, setShowPartyVerification] = useState(false);
  const [historyFilter, setHistoryFilter] = useState({
    stageId: "",
    actorName: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });

  // 1. Dashboard Stats (Task 6)
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["supply-chain-stats"],
    queryFn: async () => {
      const res = await api.get("/api/v1/supply-chain/dashboard/stats");
      return res.data.data;
    },
  });

  // 2. Global Batch List
  const { data: allBatches = [], isLoading: isLoadingBatches } = useQuery({
    queryKey: ["supply-chain-all-batches"],
    queryFn: async () => {
      const res = await api.get("/api/v1/supply-chain/batches");
      return res.data.data || [];
    },
  });

  // 3. Batch Details & Journeys (Fetched ONLY when a batch is selected)
  const { data: batchDetail, isLoading: isLoadingBatchDetail } = useQuery({
    queryKey: ["supply-chain-batch", selectedBatchId],
    queryFn: async () => {
      const res = await api.get(
        `/api/v1/supply-chain/batch/${selectedBatchId}`,
      );
      return res.data.data;
    },
    enabled: !!selectedBatchId,
  });

  const { data: traceabilityProfile } = useQuery({
    queryKey: ["traceability-batch-profile", selectedBatchId],
    queryFn: async () => {
      const res = await api.get(
        `/api/v1/traceability/batch/${selectedBatchId}`,
      );
      return res.data.data;
    },
    enabled: !!selectedBatchId,
  });

  // 4. Stages for Filters
  const { data: stages = [] } = useQuery({
    queryKey: ["supply-chain-stages"],
    queryFn: async () => {
      const res = await api.get("/api/v1/supply-chain/stages");
      return res.data.data;
    },
  });

  const isAdmin = user?.role === "ADMIN";
  const canRecordJourney = user?.role === 'SELLER';

  const addJourneyMutation = useMutation({
    mutationFn: async (submission: JourneySubmission) => {
      const oversizedFile = submission.files.find(
        (file) => file.size > 10 * 1024 * 1024,
      );
      if (oversizedFile) {
        throw new Error(`Tệp ${oversizedFile.name} vượt quá giới hạn 10 MB.`);
      }

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
            "/api/v1/media/upload?folder=supply-chain",
            body,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          const result = response.data?.data ?? response.data;
          return {
            url: result.url as string,
            isImage: file.type.startsWith("image/"),
          };
        }),
      );
      uploaded.forEach((file) => {
        if (file.isImage) imageUrls.push(file.url);
        else attachmentUrls.push(file.url);
      });

      const payload = {
        stageId: submission.stageId,
        location: submission.location,
        latitude: submission.latitude,
        longitude: submission.longitude,
        actorName: submission.actorName,
        note: submission.note,
        eventTime: submission.eventTime,
        qualityStatus: submission.qualityStatus,
      };
      return api.post(`/api/v1/supply-chain/batch/${selectedBatchId}/journey`, {
        ...payload,
        imageUrls,
        attachmentUrls,
      });
    },
    onSuccess: () => {
      toast.success("Đã ghi nhận công đoạn và cập nhật dữ liệu truy xuất.");
      queryClient.invalidateQueries({ queryKey: ["supply-chain-stats"] });
      queryClient.invalidateQueries({ queryKey: ["supply-chain-all-batches"] });
      queryClient.invalidateQueries({
        queryKey: ["supply-chain-batch", selectedBatchId],
      });
      queryClient.invalidateQueries({ queryKey: ["supply-chain-history"] });
      setShowAddJourney(false);
      setActiveTab("timeline");
    },
    onError: (error: unknown) => {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response !== null &&
        "data" in error.response &&
        typeof error.response.data === "object" &&
        error.response.data !== null &&
        "message" in error.response.data &&
        typeof error.response.data.message === "string"
          ? error.response.data.message
          : error instanceof Error
            ? error.message
            : "Không thể ghi nhận công đoạn.";
      toast.error(message);
    },
  });

  // 5. Global History
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["supply-chain-history", historyFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyFilter.stageId)
        params.append("stageId", historyFilter.stageId);
      if (historyFilter.actorName)
        params.append("actorName", historyFilter.actorName);
      if (historyFilter.dateFrom)
        params.append("dateFrom", historyFilter.dateFrom);
      if (historyFilter.dateTo) params.append("dateTo", historyFilter.dateTo);
      params.append("page", String(historyFilter.page));
      params.append("limit", "20");
      const res = await api.get(
        `/api/v1/supply-chain/history?${params.toString()}`,
      );
      return res.data.data;
    },
  });

  const handleSelectBatch = (batchId: string, tab: Tab = "overview") => {
    setSelectedBatchId(batchId);
    setActiveTab(tab);
    if (batchId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const batchJourneys = batchDetail?.journeys || [];
  const shipmentJourneys = (batchDetail?.shipmentItems ?? []).flatMap(
    (item: {
      shipment: {
        trackingCode?: string | null;
        carrierOrganization?: { name?: string };
        events?: Array<{
          id: string;
          eventType: string;
          eventTime: string;
          createdAt: string;
          location?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          note?: string | null;
          imageUrls?: string[];
          attachmentUrls?: string[];
          recipientName?: string | null;
          actor?: { fullName?: string } | null;
        }>;
      };
    }) =>
      (item.shipment.events ?? []).map((event) => ({
        id: event.id,
        stage: {
          name: event.eventType,
          displayName: SHIPMENT_STAGE_LABEL[event.eventType] ?? event.eventType,
          icon: "Truck",
          color: "#2563eb",
          order: 100,
        },
        location: event.location ?? "Không có vị trí",
        latitude: event.latitude,
        longitude: event.longitude,
        actorName:
          event.actor?.fullName ??
          item.shipment.carrierOrganization?.name ??
          "Webhook nhà vận chuyển",
        note: event.note,
        imageUrls: event.imageUrls ?? [],
        attachmentUrls: event.attachmentUrls ?? [],
        eventTime: event.eventTime,
        createdAt: event.createdAt,
        referenceCode: item.shipment.trackingCode,
        carrierName: item.shipment.carrierOrganization?.name,
        recipientName: event.recipientName,
        blockchainRecord: null,
      })),
  );
  const journeys = [...batchJourneys, ...shipmentJourneys].sort(
    (left, right) =>
      new Date(left.eventTime ?? left.createdAt).getTime() -
      new Date(right.eventTime ?? right.createdAt).getTime(),
  );
  const explorerUrl = journeys.find(
    (journey: { blockchainRecord?: { explorerUrl?: string | null } | null }) =>
      journey.blockchainRecord?.explorerUrl,
  )?.blockchainRecord?.explorerUrl as string | undefined;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "overview",
      label: "Tổng quan",
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: "origin",
      label: "Ma trận nguồn gốc",
      icon: <Sprout className="w-4 h-4" />,
    },
    {
      id: "timeline",
      label: "Hành trình",
      icon: <GitBranch className="w-4 h-4" />,
    },
    { id: "map", label: "Bản đồ", icon: <MapPin className="w-4 h-4" /> },
    {
      id: "blockchain",
      label: "Blockchain",
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    { id: "history", label: "Lịch sử", icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            🔗 Chuỗi Cung Ứng & Truy Xuất
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Quản lý hành trình hàng hóa từ thu hoạch đến tay người tiêu dùng
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.role === 'SELLER' && <Button type="button" onClick={() => setShowCreateLot(true)}><Plus className="h-4 w-4" /> Tạo lô sản xuất</Button>}
          {isAdmin && <Button type="button" variant="outline" onClick={() => setShowQualityAccounts(true)}>Tài khoản QA/QC</Button>}
          {isAdmin && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPartyVerification(true)}
              >
                <ShieldCheck className="h-4 w-4" /> Xác minh nguồn gốc
              </Button>
            </>
          )}
          {canRecordJourney && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTraceabilityOrigin(true)}
                disabled={!selectedBatchId || !batchDetail || !['DRAFT', 'QUARANTINED'].includes(batchDetail.lifecycleStatus)}
                title={
                  selectedBatchId
                    ? "Khai báo nguồn gốc cho lô đang chọn"
                    : "Hãy chọn một lô hàng"
                }
              >
                <Sprout className="h-4 w-4" /> Hồ sơ nguồn gốc
              </Button>
              <Button
                type="button"
                onClick={() => setShowAddJourney(true)}
                disabled={!selectedBatchId || !batchDetail || batchDetail.lifecycleStatus !== 'DRAFT'}
                title={
                  selectedBatchId
                    ? "Thêm công đoạn cho lô đang chọn"
                    : "Hãy chọn một lô hàng"
                }
              >
                <Plus className="h-4 w-4" /> Ghi nhận công đoạn
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isAdmin ? (
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        ) : (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        )}
        <div>
          <p className="font-bold text-slate-800 dark:text-white">
            {isAdmin
              ? "Chế độ giám sát — Admin không được ghi nhận công đoạn"
              : user?.role === "WAREHOUSE_MANAGER"
                ? "Bạn tiếp nhận, xếp kho và bàn giao chuyến; QA độc lập kiểm định và phát hành lô"
                : user?.role === "QUALITY_ASSURANCE"
                  ? "Bạn kiểm định chất lượng độc lập và phát hành lô hàng; không tự khai báo lô hoặc nhập kho"
                  : "Mỗi công đoạn được xác nhận bởi đúng người chịu trách nhiệm"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Hành trình sản xuất thuộc lô; vận chuyển được tách sang shipment và
            nhận trạng thái từ hãng vận chuyển.
          </p>
        </div>
      </div>

      {/* Task 6: Rich Statistics */}
      <BatchStatistics stats={stats} isLoading={isLoadingStats} />

      {/* Task 1: Smart Search */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap hidden sm:block">
          Tra cứu nhanh:
        </div>
        <BatchAutocomplete
          batches={allBatches}
          selectedBatchId={selectedBatchId}
          onSelect={handleSelectBatch}
        />
      </div>

      {/* Main View Area */}
      {batchDetail && <BatchLifecyclePanel key={batchDetail.id} batch={batchDetail} role={user?.role ?? ''} />}
      {showCreateLot && <CreateProductionLotModal onClose={() => setShowCreateLot(false)} onCreated={handleSelectBatch} />}
      {showQualityAccounts && <QualityAccountsModal onClose={() => setShowQualityAccounts(false)} />}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Left Column: Batch Detail / Timeline / Map */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {!selectedBatchId ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-4">
              {/* Task 13: Batch Overview (Top Banner + Tabs) */}
              {isLoadingBatchDetail ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl h-64 border border-slate-100 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  {/* The Banner is always visible if overview is selected, wait, let's keep banner at top */}
                  <BatchOverview
                    batch={batchDetail}
                    onShowQR={() => setShowQR(true)}
                  />

                  {/* Tabs Navigation */}
                  <div className="border-b border-slate-200 dark:border-slate-800 mt-2">
                    <nav
                      className="flex overflow-x-auto gap-1 scrollbar-hide"
                      role="tablist"
                    >
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          role="tab"
                          aria-selected={activeTab === tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-all duration-150 whitespace-nowrap
                            ${
                              activeTab === tab.id
                                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            }`}
                        >
                          {tab.icon}
                          {tab.label}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {/* Tab Content */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="min-h-[400px]"
                    >
                      {activeTab === "overview" && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center border border-slate-100 text-slate-500">
                          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                          <p>Thông tin tổng quan đã được hiển thị phía trên.</p>
                          <p className="text-sm mt-1">
                            Chuyển sang Hành trình hoặc Bản đồ để xem chi tiết
                            luân chuyển.
                          </p>
                        </div>
                      )}

                      {activeTab === "origin" && (
                        <div className="space-y-4">
                          <TraceabilityMatrix
                            verification={
                              traceabilityProfile?.summary
                                ?.traceabilityVerification as
                                TraceabilityVerification | undefined
                            }
                          />
                          {batchDetail?.originDeclarations?.[0] ? (
                            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2">
                              <div>
                                <p className="text-xs font-bold uppercase text-slate-400">
                                  Chủ thể nguồn
                                </p>
                                <p className="mt-1 font-black">
                                  {batchDetail.originDeclarations[0].party.name}
                                </p>
                                <p className="font-mono text-xs text-slate-500">
                                  {batchDetail.originDeclarations[0].party
                                    .gln ??
                                    batchDetail.originDeclarations[0].party
                                      .code}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase text-slate-400">
                                  Địa điểm nguồn
                                </p>
                                <p className="mt-1 font-black">
                                  {
                                    batchDetail.originDeclarations[0].location
                                      .name
                                  }
                                </p>
                                <p className="text-xs text-slate-500">
                                  {
                                    batchDetail.originDeclarations[0].location
                                      .address
                                  }
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase text-slate-400">
                                  Mã lô tại nguồn
                                </p>
                                <p className="mt-1 font-mono font-black">
                                  {
                                    batchDetail.originDeclarations[0]
                                      .sourceLotCode
                                  }
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase text-slate-400">
                                  Revision audit
                                </p>
                                <p className="mt-1 font-black">
                                  {batchDetail.originDeclarations[0].revision}/
                                  {batchDetail.originDeclarations.length}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                              Lô chưa có bản khai nguồn gốc. Hãy dùng nút “Hồ sơ
                              nguồn gốc” để ghi chủ thể, địa điểm và mã lô tại
                              nguồn.
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === "timeline" && (
                        <BatchTimeline
                          journeys={journeys}
                          onViewOnMap={() => {
                            setActiveTab("map");
                            // setTimeout can be used here if needed to let map tab render,
                            // but BatchInteractiveMap relies on grouping so we'll just switch the tab.
                          }}
                        />
                      )}

                      {activeTab === "map" && (
                        <div className="w-full">
                          <BatchInteractiveMap
                            batchDetail={{ ...batchDetail, journeys }}
                            onOpenTimeline={() => setActiveTab("timeline")}
                          />
                        </div>
                      )}

                      {activeTab === "blockchain" && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
                          <ShieldCheck
                            className={`w-16 h-16 mx-auto mb-4 ${batchDetail?.blockchainSynced ? "text-emerald-500" : "text-amber-500"}`}
                          />
                          <h3 className="text-xl font-bold text-slate-800 mb-2">
                            {batchDetail?.blockchainSynced
                              ? "Toàn bộ hành trình đã được xác nhận"
                              : "Hành trình đang chờ xác nhận"}
                          </h3>
                          <p className="text-slate-500 mb-4 max-w-md mx-auto">
                            {batchDetail?.blockchainSynced
                              ? "Mọi công đoạn hiện có của lô đã có bản ghi blockchain CONFIRMED."
                              : `${batchDetail?.blockchainConfirmedCount ?? 0}/${journeys.length} công đoạn đã được xác nhận. Hệ thống không hiển thị Verified cho dữ liệu còn QUEUED hoặc FAILED.`}
                          </p>
                          <Button
                            variant="outline"
                            className="gap-2"
                            disabled={!explorerUrl}
                            onClick={() =>
                              explorerUrl &&
                              window.open(
                                explorerUrl,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            Xem Smart Contract trên PolygonScan
                          </Button>
                        </div>
                      )}

                      {activeTab === "history" && (
                        <div>
                          <BatchFilters
                            filter={historyFilter}
                            setFilter={setHistoryFilter}
                            stages={stages}
                          />
                          <BatchHistory
                            historyData={historyData}
                            isLoading={isLoadingHistory}
                            filter={historyFilter}
                            setFilter={setHistoryFilter}
                            onSelectBatch={handleSelectBatch}
                          />
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task 2: Batch Table (Full Width Below) */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <List className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Danh sách Lô hàng
          </h2>
        </div>
        {isLoadingBatches ? (
          <div className="flex justify-center rounded-2xl bg-white py-16 dark:bg-slate-900">
            <LoadingSpinner />
          </div>
        ) : (
          <BatchTable
            batches={allBatches}
            onSelect={handleSelectBatch}
            onShowQR={(batch) => {
              setSelectedBatchId(batch.id);
              setShowQR(true);
            }}
          />
        )}
      </div>

      {/* Modals */}
      {showQR && (
        <QRCodeModal
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          batchId={selectedBatchId}
          batchNumber={batchDetail?.batchNumber}
          productName={batchDetail?.inventory?.product?.name}
        />
      )}
      {showAddJourney && batchDetail && (
        <AddJourneyModal
          key={`${selectedBatchId}-${batchDetail.journeys?.length ?? 0}`}
          batch={batchDetail}
          stages={stages as SupplyChainStageOption[]}
          actorName={user?.fullName || user?.email || ""}
          role={user?.role ?? ""}
          isPending={addJourneyMutation.isPending}
          onClose={() => {
            if (!addJourneyMutation.isPending) setShowAddJourney(false);
          }}
          onSubmit={(submission) => addJourneyMutation.mutate(submission)}
        />
      )}
      {showTraceabilityOrigin && batchDetail && canRecordJourney && (
        <TraceabilityOriginModal
          batchId={selectedBatchId}
          batchNumber={batchDetail.batchNumber}
          batches={allBatches}
          currentRevision={batchDetail.originDeclarations?.length ?? 0}
          onClose={() => setShowTraceabilityOrigin(false)}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["supply-chain-batch", selectedBatchId],
            });
            queryClient.invalidateQueries({
              queryKey: ["supply-chain-all-batches"],
            });
            queryClient.invalidateQueries({
              queryKey: ["traceability-batch-profile", selectedBatchId],
            });
            setActiveTab("origin");
          }}
        />
      )}
      {showPartyVerification && isAdmin && (
        <TraceabilityPartyVerificationModal
          onClose={() => setShowPartyVerification(false)}
        />
      )}
    </div>
  );
}
