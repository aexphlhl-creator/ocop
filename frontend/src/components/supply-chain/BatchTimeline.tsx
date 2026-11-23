import { AssetImage } from '@/components/ui/asset-image';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, User, Clock, ShieldCheck, ChevronDown, ChevronUp, Image as ImageIcon, FileText } from 'lucide-react';
import { Button } from '../ui/button';

const STAGE_ICON_MAP: Record<string, string> = {
  HARVEST: '🌱',
  RECEIVED: '📦',
  QUALITY_INSPECTION: '🔬',
  PROCESSING: '🏭',
  PACKAGING: '📫',
  WAREHOUSE: '🏬',
  HANDOVER_TO_CARRIER: '🤝',
  SHIPPING: '🚚',
  DISTRIBUTOR: '🏪',
  RETAIL: '🛒',
  CUSTOMER: '🏠',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function calculateDuration(start: string, end: string) {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (diffMs < 0) return null;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} ngày ${hours % 24} giờ`;
  if (hours > 0) return `${hours} giờ`;
  const mins = Math.floor(diffMs / (1000 * 60));
  return `${mins} phút`;
}

interface BatchTimelineProps {
  journeys: Array<{
    id: string;
    createdAt: string;
    eventTime?: string | null;
    stage?: { name?: string; displayName?: string };
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
    actorName?: string;
    note?: string | null;
    referenceCode?: string | null;
    carrierName?: string | null;
    recipientName?: string | null;
    imageUrls?: string[];
    attachmentUrls?: string[];
    blockchainPayload?: { qualityStatus?: string | null } | null;
    blockchainRecord?: {
      status?: string;
      transactionHash?: string | null;
    } | null;
  }>;
  onViewOnMap?: (stageId: string) => void;
}

export function BatchTimeline({ journeys, onViewOnMap }: BatchTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!journeys || journeys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Clock className="w-14 h-14 mb-3 opacity-20" />
        <p className="font-medium text-slate-500">Lô hàng này chưa có hành trình nào</p>
      </div>
    );
  }

  // Ensure chronological order
  const sortedJourneys = [...journeys].sort(
    (a, b) =>
      new Date(a.eventTime ?? a.createdAt).getTime() -
      new Date(b.eventTime ?? b.createdAt).getTime(),
  );

  // Progress Bar Header
  const renderProgressBar = () => {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 mb-8 shadow-sm overflow-x-auto scrollbar-hide">
        <div className="flex items-center min-w-max gap-2">
          {sortedJourneys.map((journey, idx) => {
            const isLast = idx === sortedJourneys.length - 1;
            return (
              <React.Fragment key={`progress-${journey.id}`}>
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2
                    ${isLast ? 'bg-yellow-100 border-yellow-500 text-yellow-700 animate-pulse' : 'bg-emerald-100 border-emerald-500 text-emerald-700'}
                  `}>
                    {isLast ? '📍' : '✓'}
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLast ? 'text-yellow-600' : 'text-emerald-600'}`}>
                    {journey.stage?.name}
                  </span>
                </div>
                {!isLast && <div className="w-12 h-1 bg-emerald-500 rounded-full mb-4"></div>}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto py-2">
      {renderProgressBar()}

      <div className="space-y-0">
        {sortedJourneys.map((journey, idx) => {
          const stageName = journey.stage?.name as string;
          const stageEmoji = STAGE_ICON_MAP[stageName] ?? '📍';
          const isCurrent = idx === sortedJourneys.length - 1;
          const isExpanded = expandedId === journey.id;
          const duration =
            idx > 0
              ? calculateDuration(
                  sortedJourneys[idx - 1].eventTime ?? sortedJourneys[idx - 1].createdAt,
                  journey.eventTime ?? journey.createdAt,
                )
              : null;
          
          let cardStyle = "bg-white dark:bg-slate-900 border-slate-200";
          let iconStyle = "bg-emerald-50 text-emerald-600";
          
          if (isCurrent) {
            cardStyle = "bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-300 dark:border-yellow-700 shadow-md ring-1 ring-yellow-200";
            iconStyle = "bg-yellow-100 text-yellow-700 border-2 border-yellow-400";
          } else {
            cardStyle = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-200";
            iconStyle = "bg-emerald-100 text-emerald-700 border-2 border-emerald-200";
          }

          return (
            <React.Fragment key={journey.id}>
              {/* Duration connecting line */}
              {idx > 0 && (
                <div className="flex flex-col items-center py-2 relative">
                  <div className="w-0.5 h-12 bg-slate-200 dark:bg-slate-700 z-0 absolute top-0 bottom-0"></div>
                  {duration && (
                    <div className="z-10 bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-500 flex items-center gap-1 shadow-sm">
                      <Clock className="w-3 h-3 text-slate-400" />
                      ⏱ {duration}
                    </div>
                  )}
                </div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`border rounded-2xl overflow-hidden transition-all ${cardStyle}`}
              >
                {/* Compact View */}
                <div 
                  className="p-5 cursor-pointer flex flex-col sm:flex-row gap-4 items-start sm:items-center relative"
                  onClick={() => setExpandedId(isExpanded ? null : journey.id)}
                >
                  {isCurrent && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-0.5 rounded-b-lg tracking-widest uppercase shadow-sm">
                      Current Stage
                    </div>
                  )}

                  <div className="flex items-center gap-4 w-full sm:w-auto min-w-[220px] mt-2 sm:mt-0">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm ${iconStyle}`}>
                      {stageEmoji}
                    </div>
                    <div>
                      <h4 className={`font-bold text-lg ${isCurrent ? 'text-yellow-800 dark:text-yellow-500' : 'text-slate-800 dark:text-slate-100'}`}>
                        {journey.stage?.displayName || stageName}
                      </h4>
                      <p className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(journey.eventTime ?? journey.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 w-full border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 pt-4 sm:pt-0 sm:pl-5 flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="font-medium">{journey.location}</span>
                      </div>
                      {journey.blockchainRecord?.status === 'CONFIRMED' && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100 w-fit px-2 py-0.5 rounded-md">
                          <ShieldCheck className="w-3 h-3" /> VERIFIED
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0 text-slate-400 hover:text-emerald-600">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20"
                    >
                      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <span className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Người thực hiện</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                              <User className="w-4 h-4 text-slate-400" /> {journey.actorName}
                            </div>
                          </div>
                          
                          {journey.latitude && journey.longitude && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Tọa độ GPS</span>
                              <div className="flex items-center gap-2 text-sm font-mono text-blue-600 bg-blue-50 w-fit px-2 py-1 rounded-md">
                                {journey.latitude.toFixed(4)}, {journey.longitude.toFixed(4)}
                              </div>
                            </div>
                          )}

                          {journey.blockchainRecord && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Blockchain</span>
                              <div className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md break-all max-w-xs">
                                {journey.blockchainRecord.status}
                                {journey.blockchainRecord.transactionHash
                                  ? ` · ${journey.blockchainRecord.transactionHash}`
                                  : ''}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          {(journey.referenceCode || journey.carrierName || journey.recipientName) && (
                            <div className="grid grid-cols-1 gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/20">
                              {journey.referenceCode && (
                                <p><span className="font-bold">Mã tham chiếu:</span> {journey.referenceCode}</p>
                              )}
                              {journey.carrierName && (
                                <p><span className="font-bold">Đơn vị vận chuyển:</span> {journey.carrierName}</p>
                              )}
                              {journey.recipientName && (
                                <p><span className="font-bold">Người nhận:</span> {journey.recipientName}</p>
                              )}
                            </div>
                          )}

                          {journey.blockchainPayload?.qualityStatus && (
                            <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-xs dark:border-violet-900 dark:bg-violet-950/20">
                              <span className="font-bold">Kết quả kiểm định:</span>{' '}
                              {journey.blockchainPayload.qualityStatus}
                            </div>
                          )}

                          {journey.note && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Ghi chú</span>
                              <div className="text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200">
                                <FileText className="w-4 h-4 text-slate-400 inline mr-2" />
                                &ldquo;{journey.note}&rdquo;
                              </div>
                            </div>
                          )}

                          {(journey.imageUrls?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-wider flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" /> Hình ảnh đính kèm
                              </span>
                              <div className="flex gap-2 flex-wrap">
                                {journey.imageUrls?.map((url: string, i: number) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    {/* URLs minh chứng đến từ nhiều kho lưu trữ ngoài không nằm trong Next image allowlist. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <AssetImage src={url} alt={`Ảnh ${i + 1}`} className="h-16 w-16 rounded-xl object-cover border border-slate-200 shadow-sm hover:scale-105 transition-transform" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {(journey.attachmentUrls?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-wider flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Tài liệu minh chứng
                              </span>
                              <div className="flex flex-col gap-1">
                                {journey.attachmentUrls?.map((url: string, index: number) => (
                                  <a
                                    key={`${url}-${index}`}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate text-xs font-medium text-blue-600 hover:underline"
                                  >
                                    Minh chứng {index + 1}: {url}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* View on map button */}
                      {onViewOnMap && journey.latitude && (
                        <div className="px-5 pb-5 flex justify-end">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2 bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewOnMap(journey.id);
                            }}
                          >
                            <MapPin className="w-4 h-4" /> Xem vị trí trên Bản đồ
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
