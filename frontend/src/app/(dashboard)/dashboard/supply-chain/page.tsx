'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { api } from '../../../../services/api';
import { useCurrentUser } from '../../../../hooks/use-auth';
import { LoadingSpinner } from '../../../../components/ui/loading-spinner';
import { GitBranch, MapPin, Package, Clock, ShieldCheck, Plus, List } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

// Components
import { BatchAutocomplete } from '../../../../components/supply-chain/BatchAutocomplete';
import { BatchTable } from '../../../../components/supply-chain/BatchTable';
import { BatchStatistics } from '../../../../components/supply-chain/BatchStatistics';
import { BatchOverview } from '../../../../components/supply-chain/BatchOverview';
import { QRCodeModal } from '../../../../components/supply-chain/QRCodeModal';
import { EmptyState } from '../../../../components/supply-chain/EmptyState';
import { BatchFilters } from '../../../../components/supply-chain/BatchFilters';
import { BatchHistory } from '../../../../components/supply-chain/BatchHistory';

// Lazy loaded components (Task 11 - Performance)
const BatchTimeline = dynamic(() => import('../../../../components/supply-chain/BatchTimeline').then(mod => mod.BatchTimeline), { 
  loading: () => <div className="flex justify-center py-20"><LoadingSpinner /></div> 
});
const BatchInteractiveMap = dynamic(() => import('../../../../components/supply-chain/BatchInteractiveMap'), {
  ssr: false,
  loading: () => <div className="flex justify-center h-[500px] items-center"><LoadingSpinner /></div>
});

type Tab = 'overview' | 'timeline' | 'map' | 'blockchain' | 'history';

export default function SupplyChainPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showQR, setShowQR] = useState(false);
  const [historyFilter, setHistoryFilter] = useState({ stageId: '', actorName: '', dateFrom: '', dateTo: '', page: 1 });

  // 1. Dashboard Stats (Task 6)
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['supply-chain-stats'],
    queryFn: async () => {
      const res = await api.get('/api/v1/supply-chain/dashboard/stats');
      return res.data.data;
    },
  });

  // 2. Global Batch List (Fetched using expiring endpoint with 10 years ahead to get ALL active batches)
  const { data: allBatches = [], isLoading: isLoadingBatches } = useQuery({
    queryKey: ['supply-chain-all-batches'],
    queryFn: async () => {
      const res = await api.get('/api/v1/inventory/expiring?days=3650');
      // Sort by newest first
      const sorted = (res.data.data || []).sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return sorted;
    },
  });

  // 3. Batch Details & Journeys (Fetched ONLY when a batch is selected)
  const { data: batchDetail, isLoading: isLoadingBatchDetail } = useQuery({
    queryKey: ['supply-chain-batch', selectedBatchId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/supply-chain/batch/${selectedBatchId}`);
      return res.data.data;
    },
    enabled: !!selectedBatchId,
  });

  // 4. Stages for Filters
  const { data: stages = [] } = useQuery({
    queryKey: ['supply-chain-stages'],
    queryFn: async () => {
      const res = await api.get('/api/v1/supply-chain/stages');
      return res.data.data;
    },
  });

  // 5. Global History
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['supply-chain-history', historyFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyFilter.stageId) params.append('stageId', historyFilter.stageId);
      if (historyFilter.actorName) params.append('actorName', historyFilter.actorName);
      if (historyFilter.dateFrom) params.append('dateFrom', historyFilter.dateFrom);
      if (historyFilter.dateTo) params.append('dateTo', historyFilter.dateTo);
      params.append('page', String(historyFilter.page));
      params.append('limit', '20');
      const res = await api.get(`/api/v1/supply-chain/history?${params.toString()}`);
      return res.data.data;
    },
  });

  const handleSelectBatch = (batchId: string, tab: Tab = 'overview') => {
    setSelectedBatchId(batchId);
    setActiveTab(tab);
    if (batchId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const journeys = batchDetail?.journeys || [];
  const mapPoints = useMemo(
    () => journeys.filter((j: any) => j.latitude != null && j.longitude != null),
    [journeys]
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <Package className="w-4 h-4" /> },
    { id: 'timeline', label: 'Hành trình', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'map', label: 'Bản đồ', icon: <MapPin className="w-4 h-4" /> },
    { id: 'blockchain', label: 'Blockchain', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'history', label: 'Lịch sử', icon: <Clock className="w-4 h-4" /> },
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
                  <BatchOverview batch={batchDetail} onShowQR={() => setShowQR(true)} />
                  
                  {/* Tabs Navigation */}
                  <div className="border-b border-slate-200 dark:border-slate-800 mt-2">
                    <nav className="flex overflow-x-auto gap-1 scrollbar-hide" role="tablist">
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          role="tab"
                          aria-selected={activeTab === tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-all duration-150 whitespace-nowrap
                            ${activeTab === tab.id
                              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
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
                      {activeTab === 'overview' && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center border border-slate-100 text-slate-500">
                          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                          <p>Thông tin tổng quan đã được hiển thị phía trên.</p>
                          <p className="text-sm mt-1">Chuyển sang Hành trình hoặc Bản đồ để xem chi tiết luân chuyển.</p>
                        </div>
                      )}
                      
                      {activeTab === 'timeline' && (
                        <BatchTimeline 
                          journeys={journeys} 
                          isBlockchainSynced={batchDetail?.blockchainSynced}
                          onViewOnMap={(stageId) => {
                            setActiveTab('map');
                            // setTimeout can be used here if needed to let map tab render, 
                            // but BatchInteractiveMap relies on grouping so we'll just switch the tab.
                          }}
                        />
                      )}

                      {activeTab === 'map' && (
                        <div className="w-full">
                          <BatchInteractiveMap 
                            batchDetail={batchDetail} 
                            onOpenTimeline={() => setActiveTab('timeline')} 
                          />
                        </div>
                      )}

                      {activeTab === 'blockchain' && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
                          <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-emerald-500" />
                          <h3 className="text-xl font-bold text-slate-800 mb-2">Blockchain Verified</h3>
                          <p className="text-slate-500 mb-4 max-w-md mx-auto">
                            Tất cả các hành trình của lô hàng này đã được lưu vĩnh viễn trên mạng lưới Polygon Network. Không ai có thể giả mạo hoặc thay đổi dữ liệu này.
                          </p>
                          <Button variant="outline" className="gap-2">
                            Xem Smart Contract trên PolygonScan
                          </Button>
                        </div>
                      )}

                      {activeTab === 'history' && (
                        <div>
                          <BatchFilters filter={historyFilter} setFilter={setHistoryFilter} stages={stages} />
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
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Danh sách Lô hàng</h2>
        </div>
        <BatchTable 
          batches={allBatches} 
          onSelect={handleSelectBatch} 
          onShowQR={(batch) => {
            setSelectedBatchId(batch.id);
            setShowQR(true);
          }} 
        />
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

    </div>
  );
}
