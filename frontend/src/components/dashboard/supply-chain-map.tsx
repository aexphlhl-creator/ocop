'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { escapeHtml } from '@/utils/escape-html';
import 'leaflet/dist/leaflet.css';

const STAGE_ICON_MAP: Record<string, string> = {
  HARVEST: '🌾',
  RECEIVED: '📦',
  QUALITY_INSPECTION: '🔬',
  PROCESSING: '🏭',
  PACKAGING: '📫',
  WAREHOUSE: '🏬',
  HANDOVER_TO_CARRIER: '🤝',
  SHIPPING: '🚚',
  DISTRIBUTOR: '🏪',
  RETAIL: '🛒',
  CUSTOMER: '🙌',
};

interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  location: string;
  actorName: string;
  note?: string;
  createdAt: string;
  stage?: { name: string; displayName: string };
}

interface SupplyChainMapProps {
  points: MapPoint[];
}

function createEmojiIcon(emoji: string, index: number, isLast: boolean) {
  return L.divIcon({
    html: `
      <div style="
        display:flex;align-items:center;justify-content:center;width:40px;height:40px;
        border-radius:50%;background:${isLast ? '#10B981' : '#fff'};
        border:2.5px solid ${isLast ? '#059669' : '#94A3B8'};
        box-shadow:0 2px 8px rgba(0,0,0,.18);font-size:18px;position:relative;
      ">
        ${emoji}
        <span style="
          position:absolute;top:-6px;right:-6px;background:#1E293B;color:#fff;
          border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:700;
          display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;
        ">${index + 1}</span>
      </div>
    `,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  });
}

export default function SupplyChainMap({ points }: SupplyChainMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const positions = points.map((point) => [point.latitude, point.longitude] as [number, number]);
    const center: [number, number] = positions[0] ?? [16.0474831, 108.2143113];
    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 7);
    mapRef.current = map;

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(map);

    if (positions.length > 1) {
      L.polyline(positions, {
        color: '#10B981',
        weight: 2.5,
        opacity: 0.65,
        dashArray: '6 4',
      }).addTo(map);
      map.fitBounds(positions, { padding: [40, 40] });
    } else if (positions.length === 1) {
      map.setView(positions[0], 11);
    }

    points.forEach((point, index) => {
      const isLast = index === points.length - 1;
      const emoji = STAGE_ICON_MAP[point.stage?.name ?? ''] ?? '📍';
      const popup = `
        <div style="font-family:sans-serif;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid #F1F5F9;padding-bottom:8px;margin-bottom:8px">
            <span style="font-size:22px">${emoji}</span>
            <div>
              <div style="font-weight:700;font-size:13px;color:#0F172A">${escapeHtml(point.stage?.displayName ?? 'Công đoạn')}</div>
              <div style="font-size:10px;color:#94A3B8">Bước ${index + 1}</div>
            </div>
          </div>
          <div style="font-size:12px;color:#475569;line-height:1.6">
            <div><strong>📍 Địa điểm:</strong> ${escapeHtml(point.location)}</div>
            <div><strong>👤 Người TH:</strong> ${escapeHtml(point.actorName)}</div>
            <div><strong>🕐 Thời gian:</strong> ${new Date(point.createdAt).toLocaleString('vi-VN')}</div>
            ${point.note ? `<div style="margin-top:4px;color:#64748B">${escapeHtml(point.note)}</div>` : ''}
          </div>
        </div>
      `;

      L.marker([point.latitude, point.longitude], {
        icon: createEmojiIcon(emoji, index, isLast),
      }).addTo(map).bindPopup(popup, { maxWidth: 260 });
    });

    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [points]);

  return <div ref={containerRef} className="h-full w-full z-0" />;
}
