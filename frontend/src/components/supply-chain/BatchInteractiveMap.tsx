'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { escapeHtml } from '@/utils/escape-html';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';
import { MapPin, Navigation2, CheckCircle2, ShieldCheck, FileCheck2, Clock, Map } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

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

// Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

interface MapJourney {
  id: string; createdAt: string; latitude?: number | null; longitude?: number | null;
  location?: string; actorName?: string; note?: string;
  stage?: { name: string; displayName: string };
}
type LocatedJourney = MapJourney & { latitude: number; longitude: number };
const EMPTY_JOURNEYS: MapJourney[] = [];
interface BatchInteractiveMapProps {
  batchDetail?: { journeys?: MapJourney[]; blockchainSynced?: boolean; status?: string };
  onOpenTimeline?: () => void;
}

export default function BatchInteractiveMap({ batchDetail, onOpenTimeline }: BatchInteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  
  const journeys = batchDetail?.journeys || EMPTY_JOURNEYS;
  const points = useMemo(() => journeys.filter((j): j is LocatedJourney => j.latitude != null && j.longitude != null && Number.isFinite(j.latitude) && Number.isFinite(j.longitude)), [journeys]);
  
  // Group points by coordinates
  const groupedPoints = useMemo(() => {
    const groups: Record<string, LocatedJourney[]> = {};
    points.forEach((p) => {
      const key = `${p.latitude.toFixed(5)}_${p.longitude.toFixed(5)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.values(groups);
  }, [points]);

  // Calculate distance
  const totalDistance = useMemo(() => {
    let dist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      dist += calculateDistance(points[i].latitude, points[i].longitude, points[i+1].latitude, points[i+1].longitude);
    }
    return dist;
  }, [points]);

  const currentStage = points.length > 0 ? points[points.length - 1] : null;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || groupedPoints.length === 0) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, { zoomControl: false });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileUrl = mapStyle === 'satellite'
      ? 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      : 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(map);

    const positions = groupedPoints.map(group => [group[0].latitude, group[0].longitude] as [number, number]);
    
    // Draw Polyline
    if (positions.length > 1) {
      L.polyline(positions, {
        color: '#10B981',
        weight: 3,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    }

    // Auto Zoom
    if (positions.length === 1) {
      map.setView(positions[0], 15);
    } else if (positions.length > 0) {
      map.fitBounds(positions, { padding: [50, 50], maxZoom: 15 });
    }

    // Add Markers
    groupedPoints.forEach((group, groupIndex) => {
      const isLastGroup = groupIndex === groupedPoints.length - 1;
      const primaryEvent = group[group.length - 1]; // The latest event in the group
      const emoji = STAGE_ICON_MAP[primaryEvent.stage?.name ?? ''] ?? '📍';
      
      const borderColor = isLastGroup ? '#EAB308' : '#10B981'; // Yellow for current, Green for completed
      const bgColor = isLastGroup ? '#FEF08A' : '#D1FAE5';
      const textColor = isLastGroup ? '#854D0E' : '#065F46';
      
      const pulseClass = isLastGroup ? 'pulse-marker' : '';

      const iconHtml = `
        <div class="${pulseClass}" style="
          display:flex;align-items:center;justify-content:center;
          width:36px;height:36px;border-radius:50%;
          background:${bgColor};border:2px solid ${borderColor};
          box-shadow:0 3px 6px rgba(0,0,0,0.15);
          font-size:18px;position:relative;cursor:pointer;
        ">
          ${emoji}
          ${group.length > 1 ? `
          <span style="
            position:absolute;top:-6px;right:-6px;background:#1E293B;color:#fff;
            border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
          ">${group.length}</span>
          ` : ''}
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-leaflet-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([group[0].latitude, group[0].longitude], { icon }).addTo(map);

      // Popup Content
      const popupDiv = document.createElement('div');
      popupDiv.className = 'custom-popup-content';
      
      let eventsHtml = '';
      group.forEach(evt => {
        const evtEmoji = STAGE_ICON_MAP[evt.stage?.name ?? ''] ?? '📍';
        eventsHtml += `
          <div style="border-left: 2px solid #E2E8F0; padding-left: 10px; margin-bottom: 12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 4px;">
              <strong style="font-size:14px; color:#1E293B;">${evtEmoji} ${escapeHtml(evt.stage?.displayName)}</strong>
              <span style="font-size:10px; color:#64748B; background:#F1F5F9; padding:2px 6px; border-radius:4px;">
                ${new Date(evt.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </span>
            </div>
            <div style="font-size:12px; color:#475569; margin-bottom: 2px;">📍 ${escapeHtml(evt.location)}</div>
            <div style="font-size:12px; color:#475569; margin-bottom: 2px;">👤 ${escapeHtml(evt.actorName)}</div>
            ${evt.note ? `<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">"${escapeHtml(evt.note)}"</div>` : ''}
          </div>
        `;
      });

      popupDiv.innerHTML = `
        <div style="min-width: 220px; font-family: inherit;">
          <div style="margin-bottom: 12px; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">
            <div style="font-weight:700; color:#0F172A; margin-bottom:4px;">
              ${group.length > 1 ? `${group.length} Hoạt động tại địa điểm này` : escapeHtml(primaryEvent.location)}
            </div>
            ${batchDetail?.blockchainSynced ? `
              <div style="display:flex; align-items:center; gap:4px; font-size:11px; color:#059669; font-weight:600; background:#D1FAE5; padding:4px 6px; border-radius:4px; width:fit-content;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></svg>
                Blockchain Verified
              </div>
            ` : ''}
          </div>
          <div style="max-height: 200px; overflow-y: auto; padding-right: 4px;">
            ${eventsHtml}
          </div>
          <button id="btn-open-timeline-${groupIndex}" style="width:100%; padding:6px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; font-size:12px; font-weight:600; color:#475569; cursor:pointer; margin-top:8px;">
            Xem chi tiết Timeline
          </button>
        </div>
      `;

      const popup = L.popup().setContent(popupDiv);
      marker.bindPopup(popup);

      // Add event listener to dynamically created button
      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-open-timeline-${groupIndex}`);
        if (btn && onOpenTimeline) {
          btn.addEventListener('click', onOpenTimeline);
        }
        setSelectedStageId(primaryEvent.id);
        document.getElementById(`sidebar-item-${primaryEvent.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      // Store marker reference in DOM element for two-way interaction
      const listItem = document.getElementById(`sidebar-item-${primaryEvent.id}`);
      if (listItem) {
        listItem.onclick = () => {
          setSelectedStageId(primaryEvent.id);
          map.flyTo([group[0].latitude, group[0].longitude], 15, { duration: 0.5 });
          marker.openPopup();
        };
      }
    });

    // Need to trigger a resize to ensure map fits container
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [groupedPoints, batchDetail, onOpenTimeline, mapStyle]);

  // Sync map tiles with selected map style
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }
    const tileUrl = mapStyle === 'satellite'
      ? 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      : 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(mapRef.current);
  }, [mapStyle]);

  if (points.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-8 flex flex-col items-center justify-center text-center h-[500px]">
        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-full mb-4">
          <Map className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Chưa có dữ liệu Bản đồ</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Lô hàng này chưa phát sinh bất kỳ vị trí GPS nào. Sau khi có hành trình đầu tiên, bản đồ sẽ tự động hiển thị.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[600px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
      
      {/* Left Sidebar */}
      <div className="w-full md:w-80 lg:w-96 border-r border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Navigation2 className="w-4 h-4 text-emerald-600" /> Route Statistics
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Distance</div>
              <div className="font-bold text-slate-800 dark:text-slate-200">{totalDistance.toFixed(1)} km</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Visited Stages</div>
              <div className="font-bold text-slate-800 dark:text-slate-200">{points.length}</div>
            </div>
          </div>
          
          <div className="text-xs flex justify-between text-slate-500 mb-1 font-medium">
            <span>Mốc có tọa độ đã ghi nhận</span>
            <span className="text-emerald-600">
              {points.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {points.map((point, index) => {
            const isLast = index === points.length - 1;
            const isSelected = selectedStageId === point.id;
            const emoji = STAGE_ICON_MAP[point.stage?.name ?? ''] ?? '📍';
            
            return (
              <div
                key={point.id}
                id={`sidebar-item-${point.id}`}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    border: `1px solid ${isSelected ? ("#34D399" ) : ("#E5E7EB")}`,
                    background: isSelected ? '#ECFDF5' : '#FFFFFF',
                    color: isSelected ? '#065F46' : '#1F2937',
                    ...(isSelected && { boxShadow: '0 0 0 2px #10B981' })
                  }}
              >
                <div className="flex gap-3">
                  <div className="mt-0.5 relative flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${isLast ? 'bg-yellow-100 border-2 border-yellow-400 animate-pulse' : 'bg-emerald-100 border-2 border-emerald-500 text-emerald-700'}`}>
                      {isLast ? '📍' : '✓'}
                    </div>
                    {!isLast && <div className="w-0.5 h-full bg-emerald-200 dark:bg-emerald-800 absolute top-6 -bottom-4 z-0"></div>}
                  </div>
                  <div className="flex-1 min-w-0 z-10">
                    <div className="flex justify-between items-start">
                      <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{emoji} {point.stage?.displayName}</div>
                      <div className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {new Date(point.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" /> {point.location}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Map */}
      <div className="flex-1 relative z-0">
        <div ref={mapContainerRef} className="w-full h-full" />
        
        {/* Map Style Switcher */}
        <div className="absolute top-4 right-4 z-[400] bg-white/95 backdrop-blur-md dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 p-1 rounded-xl shadow-lg flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setMapStyle('standard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mapStyle === 'standard'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🗺️ Bản đồ
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('satellite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mapStyle === 'satellite'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🛰️ Vệ tinh
          </button>
        </div>

        {/* Route Summary Overlay */}
        <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-md dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl shadow-lg w-64 pointer-events-auto">
          <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-3 text-sm">Route Summary</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Current Stage</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{currentStage?.stage?.displayName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Distance</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{totalDistance.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Update</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {currentStage ? new Date(currentStage.createdAt).toLocaleDateString('vi-VN') : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="text-slate-500">Blockchain</span>
              {batchDetail?.blockchainSynced ? (
                <span className="flex items-center gap-1 text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="text-slate-400">N/A</span>
              )}
            </div>
          </div>
        </div>

        {/* Legend Overlay */}
        <div className="absolute bottom-6 left-4 z-[400] bg-white/90 backdrop-blur-md dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-3 rounded-xl shadow-lg pointer-events-auto text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1"><div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ECFDF5', border: '2px solid #34D399' }}></div> Completed</div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-yellow-100 border border-yellow-500"></div> Current</div>
            <div className="flex items-center gap-1">
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F1F5F9', border: '2px solid #D1D5DB' }}></div> Future
              </div>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          .pulse-marker {
            animation: pulse-border 2s infinite;
          }
          @keyframes pulse-border {
            0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(234, 179, 8, 0); }
            100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
          }
          .custom-popup-content .leaflet-popup-content-wrapper {
            border-radius: 12px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          }
          .custom-popup-content .leaflet-popup-content {
            margin: 16px;
          }
        `}} />
      </div>
    </div>
  );
}
