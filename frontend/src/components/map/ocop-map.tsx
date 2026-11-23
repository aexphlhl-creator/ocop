'use client';

import { AssetImage } from '@/components/ui/asset-image';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { escapeHtml } from '@/utils/escape-html';
import 'leaflet/dist/leaflet.css';
import { api } from '../../services/api';
import { useThemeStore } from '../../stores/theme.store';
import { SearchBox } from '../ui/search-box';
import { LoadingSpinner } from '../ui/loading-spinner';
import { MapPin, Star, Award, Store, Phone, ChevronDown, X, ExternalLink, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Province {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Ward {
  id: string;
  name: string;
  provinceId: string;
  latitude: number;
  longitude: number;
  description?: string;
  bounds?: L.LatLngBoundsExpression;
  geojsonPath?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  latitude: number;
  longitude: number;
  provinceId?: string;
  wardId?: string;
  ocopLevel: { level: number; title: string };
  category: { name: string };
  seller: {
    id: string;
    fullName: string;
    phone?: string;
    sellerProfile?: { displayName: string; phone?: string; address?: string } | null;
  };
  description?: string;
  images?: { imageUrl: string; isPrimary: boolean }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const selectCls =
  'flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer appearance-none';

export type MapStyleType = 'standard' | 'terrain' | 'satellite';

interface MapStyleConfig {
  id: MapStyleType;
  name: string;
  icon: string;
  url: string;
  subdomains: string[];
  maxZoom: number;
  attribution: string;
}

const MAP_STYLES: Record<MapStyleType, MapStyleConfig> = {
  standard: {
    id: 'standard',
    name: 'Đường sá',
    icon: '🗺️',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '&copy; Google Maps',
  },
  terrain: {
    id: 'terrain',
    name: 'Địa hình',
    icon: '⛰️',
    url: 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '&copy; Google Maps',
  },
  satellite: {
    id: 'satellite',
    name: 'Vệ tinh',
    icon: '🛰️',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '&copy; Google Maps',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OcopMap() {
  const { theme } = useThemeStore();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const wardMarkerRef = useRef<L.Marker | null>(null);
  const markerGroupRef = useRef<L.FeatureGroup | null>(null);

  // ── Data states ──────────────────────────────────────────────────────────
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // ── Filter & Display states ──────────────────────────────────────────────
  const [mapStyle, setMapStyle] = useState<MapStyleType>('standard');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedWardId, setSelectedWardId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStars, setSelectedStars] = useState<number[]>([]);
  const [currentZoom, setCurrentZoom] = useState(6);

  // ── UI states ────────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoadingWards, setIsLoadingWards] = useState(false);

  // ─── Init Map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [16.0, 108.0],
      zoom: 6,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    markerGroupRef.current = L.featureGroup().addTo(map);

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });
    setCurrentZoom(map.getZoom());

    fetchProvinces();
    fetchProducts();

    return () => {
      if (wardMarkerRef.current) {
        wardMarkerRef.current.remove();
        wardMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ─── Tile layer sync with mapStyle and theme ──────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) tileLayerRef.current.remove();

    const config = MAP_STYLES[mapStyle] || MAP_STYLES.standard;
    const isDark = theme === 'dark' && mapStyle === 'standard';

    const layer = L.tileLayer(config.url, {
      attribution: config.attribution,
      subdomains: config.subdomains,
      maxZoom: config.maxZoom,
      className: isDark ? 'map-tiles-dark' : '',
    });

    tileLayerRef.current = layer.addTo(mapRef.current);
  }, [mapStyle, theme]);

  // ─── API calls ────────────────────────────────────────────────────────────

  async function fetchProvinces() {
    try {
      const res = await api.get('/api/v1/provinces');
      setProvinces(res.data.data || []);
    } catch (err) {
      console.error('Lỗi tải tỉnh thành:', err);
    }
  };

  async function fetchProducts() {
    try {
      const res = await api.get('/api/v1/products?limit=100&status=APPROVED');
      setProducts(res.data.data || []);
    } catch (err) {
      console.error('Lỗi tải sản phẩm:', err);
    }
  };

  const fetchWards = useCallback(async (provinceId: string) => {
    if (!provinceId) { setWards([]); return; }
    setIsLoadingWards(true);
    try {
      // Backend cho phép tải tới 500 xã phường mỗi tỉnh
      const res = await api.get(`/api/v1/wards?provinceId=${provinceId}&limit=500`);
      const items = Array.isArray(res.data?.data)
        ? res.data.data
        : (res.data?.data?.items || res.data?.items || []);
      setWards(items);
    } catch (err) {
      console.error('Lỗi tải xã phường với limit=500, thử lại limit=100:', err);
      try {
        const fallbackRes = await api.get(`/api/v1/wards?provinceId=${provinceId}&limit=100`);
        const items = Array.isArray(fallbackRes.data?.data)
          ? fallbackRes.data.data
          : (fallbackRes.data?.data?.items || fallbackRes.data?.items || []);
        setWards(items);
      } catch (e) {
        console.error('Lỗi fallback xã phường:', e);
        setWards([]);
      }
    } finally {
      setIsLoadingWards(false);
    }
  }, []);

  // ─── Marker helpers ───────────────────────────────────────────────────────

  const createMarkerIcon = (stars: number) => {
    // Màu cờ Việt Nam: Đỏ (Background) và Vàng (Ngôi sao)
    const bg = '#DA251D'; // Đỏ cờ Việt Nam
    const ring = '#FCD34D'; // Viền vàng nhạt
    const textColor = '#FFFF00'; // Vàng cờ Việt Nam

    return L.divIcon({
      html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background-color:${bg};box-shadow:0 0 0 3px ${ring}, 0 4px 6px -1px rgba(0,0,0,0.1);color:${textColor};font-weight:900;font-size:11px;text-shadow: 0px 1px 2px rgba(0,0,0,0.5);">${stars}★</div>`,
      className: 'custom-ocop-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  // ─── Filtered products ────────────────────────────────────────────────────

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.seller?.sellerProfile?.displayName ?? p.seller?.fullName ?? '').toLowerCase().includes(q);

    // Lọc theo tỉnh (so sánh provinceId nếu có, fallback address)
    const matchProvince = !selectedProvinceId
      ? true
      : p.provinceId
        ? p.provinceId === selectedProvinceId
        : p.seller?.sellerProfile?.address
            ?.toLowerCase()
            .includes(
              (provinces.find((pr) => pr.id === selectedProvinceId)?.name || '').toLowerCase()
            );

    // Lọc theo xã/phường
    const matchWard = !selectedWardId ? true : p.wardId === selectedWardId;

    // Lọc theo sao
    const matchStars = selectedStars.length === 0 || selectedStars.includes(p.ocopLevel?.level);

    return matchSearch && matchProvince && matchWard && matchStars;
  });

  // ─── Sync markers ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !markerGroupRef.current) return;
    console.log('[OcopMap] Sync markers running. Products:', filteredProducts.length, 'Provinces:', provinces.length);
    markerGroupRef.current.clearLayers();

    let mode = 1;
    if (selectedWardId) {
      mode = 3;
    } else if (selectedProvinceId) {
      mode = 2;
      if (currentZoom >= 13) mode = 3;
    } else {
      mode = 1;
      if (currentZoom >= 9 && currentZoom < 13) mode = 2;
      if (currentZoom >= 13) mode = 3;
    }

    if (mode === 1) {
      console.log('[OcopMap] Mode 1: Provinces');
      // Cấp độ 1: Tỉnh / Thành phố
      const provinceGroups = new Map<string, { count: number; province: Province }>();
      filteredProducts.forEach((p) => {
        if (!p.provinceId) return;
        if (!provinceGroups.has(p.provinceId)) {
          const prov = provinces.find((pr) => pr.id === p.provinceId);
          if (prov && prov.latitude && prov.longitude) {
            provinceGroups.set(p.provinceId, { count: 0, province: prov });
          }
        }
        if (provinceGroups.has(p.provinceId)) {
          provinceGroups.get(p.provinceId)!.count++;
        }
      });

      console.log('[OcopMap] Province groups found:', provinceGroups.size);
      provinceGroups.forEach((group) => {
        const marker = L.marker([group.province.latitude, group.province.longitude], {
          icon: L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background-color:#10B981;box-shadow:0 0 0 4px #6EE7B7, 0 10px 15px -3px rgba(0,0,0,0.1);color:white;font-weight:800;font-size:12px;cursor:pointer;"><div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><span>${group.count}</span><span style="font-size:7px;font-weight:bold;margin-top:2px;">Sản phẩm</span></div></div>`,
            className: 'custom-cluster-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          }),
        });
        marker.bindTooltip(`<b>${escapeHtml(group.province.name)}</b><br/>${group.count} sản phẩm`, { direction: 'top', offset: [0, -20] });
        marker.on('click', () => {
          handleProvinceChange(group.province.id);
        });
        markerGroupRef.current?.addLayer(marker);
      });
    } else if (mode === 2) {
      console.log('[OcopMap] Mode 2: Wards');
      // Cấp độ 2: Xã / Phường
      const wardGroups = new Map<string, { count: number; lat: number; lng: number; wardName: string }>();
      
      // Khởi tạo tất cả xã phường của tỉnh
      wards.forEach((w) => {
        if (w.latitude && w.longitude) {
          wardGroups.set(w.id, {
            count: 0,
            lat: w.latitude,
            lng: w.longitude,
            wardName: w.name,
          });
        }
      });

      // Đếm sản phẩm vào các xã
      filteredProducts.forEach((p) => {
        const key = p.wardId;
        if (key && wardGroups.has(key)) {
          wardGroups.get(key)!.count++;
        } else if (key && !wardGroups.has(key)) {
          if (p.latitude && p.longitude) {
            wardGroups.set(key, {
              count: 1,
              lat: p.latitude,
              lng: p.longitude,
              wardName: p.seller?.sellerProfile?.address || 'Khu vực',
            });
          }
        }
      });

      console.log('[OcopMap] Ward groups found:', wardGroups.size);
      wardGroups.forEach((group, key) => {
        const marker = L.marker([group.lat, group.lng], {
          icon: L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background-color:${group.count > 0 ? '#F59E0B' : '#94A3B8'};box-shadow:0 0 0 4px ${group.count > 0 ? '#FCD34D' : '#E2E8F0'}, 0 10px 15px -3px rgba(0,0,0,0.1);color:white;font-weight:800;font-size:10px;cursor:pointer;">${group.count}</div>`,
            className: 'custom-cluster-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        });
        marker.bindTooltip(`<b>${escapeHtml(group.wardName)}</b><br/>${group.count} sản phẩm`, { direction: 'top', offset: [0, -16] });
        marker.on('click', () => {
          if (key !== 'unknown') {
            handleWardChange(key);
          } else {
            mapRef.current?.setView([group.lat, group.lng], 14);
          }
        });
        markerGroupRef.current?.addLayer(marker);
      });
    } else {
      console.log('[OcopMap] Mode 3: Products');
      filteredProducts.forEach((product) => {
        if (!product.latitude || !product.longitude) return;

        const marker = L.marker([product.latitude, product.longitude], {
          icon: createMarkerIcon(product.ocopLevel?.level ?? 3),
        });

        marker.bindPopup(`
          <div class="p-2 flex flex-col gap-1.5 font-sans min-w-[200px]">
            <h4 class="font-bold text-sm text-slate-800">${escapeHtml(product.name)}</h4>
            <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 w-fit rounded-full">${escapeHtml(product.category?.name)}</span>
            <div class="text-xs text-slate-500 font-semibold mt-1">Đơn giá: <span class="text-red-500">${product.price.toLocaleString('vi-VN')}đ / ${escapeHtml(product.unit)}</span></div>
            <div class="text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 mt-1.5 flex flex-col gap-0.5">
              <div class="font-bold text-slate-600">${escapeHtml(product.seller?.sellerProfile?.displayName ?? product.seller?.fullName ?? '')}</div>
              <div>${escapeHtml(product.seller?.sellerProfile?.address ?? '')}</div>
            </div>
          </div>
        `);

        marker.on('click', () => setSelectedProduct(product));
        markerGroupRef.current?.addLayer(marker);
      });
    }

    // Nếu có xã được chọn và có sản phẩm, không cần thiết phải zoom fitbounds liên tục vì sẽ làm nhiễu thao tác zoom của người dùng.
    // Việc zoom được xử lý ở các hàm handle change.
  }, [filteredProducts, selectedWardId, selectedProvinceId, currentZoom, provinces, wards]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleProvinceChange(id: string) {
    const province = provinces.find((p) => p.id === id);
    setSelectedProvinceId(id);
    setSelectedProvinceCode(province?.code || '');
    setSelectedWardId('');
    setSelectedProduct(null);
    setWards([]);

    // Xóa marker tâm xã cũ nếu có
    if (wardMarkerRef.current) {
      wardMarkerRef.current.remove();
      wardMarkerRef.current = null;
    }

    if (id) {
      fetchWards(id);
      if (province && province.latitude && province.longitude && mapRef.current) {
        mapRef.current.flyTo([province.latitude, province.longitude], 9, {
          duration: 1.2,
        });
      }
    } else {
      mapRef.current?.flyTo([16.0, 108.0], 6, { duration: 1.0 });
    }
  };

  function handleWardChange(wardId: string) {
    setSelectedWardId(wardId);
    setSelectedProduct(null);

    // Xóa marker tâm xã cũ nếu có
    if (wardMarkerRef.current) {
      wardMarkerRef.current.remove();
      wardMarkerRef.current = null;
    }

    if (wardId) {
      const ward = wards.find((w) => w.id === wardId);
      if (ward && ward.latitude && ward.longitude && mapRef.current) {
        // 1. Zoom thẳng mượt mà vào đúng vị trí trung tâm hành chính của xã đó
        mapRef.current.flyTo([ward.latitude, ward.longitude], 14, {
          duration: 1.2,
          easeLinearity: 0.25,
        });

        // 2. Tạo Marker định vị nổi bật với huy hiệu định danh trung tâm hành chính xã
        const wardProductsCount = products.filter((p) => p.wardId === wardId).length;

        const wardPinIcon = L.divIcon({
          className: 'ward-pin-beacon',
          iconSize: [200, 56],
          iconAnchor: [100, 52],
          html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
              <!-- Badge Name Tag -->
              <div style="
                background: linear-gradient(135deg, #059669, #047857);
                color: white;
                padding: 5px 12px;
                border-radius: 9999px;
                font-size: 12px;
                font-weight: 800;
                box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 2px rgba(255,255,255,0.95);
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 4px;
                transform: translateZ(0);
              ">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#34d399;box-shadow:0 0 8px #34d399;"></span>
                <span>${escapeHtml(ward.name)}</span>
                ${wardProductsCount > 0 ? `<span style="background-color:rgba(255,255,255,0.25);padding:1px 6px;border-radius:8px;font-size:10px;">${wardProductsCount} OCOP</span>` : ''}
              </div>

              <!-- Pin Point & Beacon Ripple -->
              <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
                <!-- Animated Ripple -->
                <div style="
                  position: absolute;
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  background-color: rgba(16, 185, 129, 0.4);
                  animation: ward-beacon-pulse 1.8s infinite ease-out;
                "></div>
                <!-- Pin dot -->
                <div style="
                  width: 14px;
                  height: 14px;
                  border-radius: 50%;
                  background-color: #059669;
                  border: 3px solid white;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                "></div>
              </div>
            </div>
          `,
        });

        const marker = L.marker([ward.latitude, ward.longitude], {
          icon: wardPinIcon,
          zIndexOffset: 1000,
        }).addTo(mapRef.current);

        marker.bindPopup(`
          <div style="font-family:sans-serif;padding:6px 8px;min-width:200px;">
            <div style="font-size:10px;font-weight:bold;color:#059669;text-transform:uppercase;margin-bottom:2px;">Trung tâm hành chính</div>
            <div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:4px;">${escapeHtml(ward.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${escapeHtml(ward.description || 'Chưa có mô tả địa bàn')}</div>
            <div style="font-size:11px;font-weight:600;color:#059669;background-color:#ecfdf5;padding:4px 8px;border-radius:6px;display:inline-block;">
              ⭐ ${wardProductsCount} sản phẩm OCOP được chứng nhận
            </div>
          </div>
        `);

        wardMarkerRef.current = marker;
      }
    } else {
      // Khi chọn "Tất cả xã phường": zoom trở lại toàn cảnh tỉnh
      if (selectedProvinceId && mapRef.current) {
        const province = provinces.find((p) => p.id === selectedProvinceId);
        if (province && province.latitude && province.longitude) {
          mapRef.current.flyTo([province.latitude, province.longitude], 9, {
            duration: 1.0,
          });
        }
      }
    }
  };

  const handleStarToggle = (star: number) => {
    setSelectedStars((prev) =>
      prev.includes(star) ? prev.filter((s) => s !== star) : [...prev, star]
    );
  };

  const handleReset = () => {
    setSelectedProvinceId('');
    setSelectedProvinceCode('');
    setSelectedWardId('');
    setSelectedStars([]);
    setSearchQuery('');
    setSelectedProduct(null);
    setWards([]);
    if (wardMarkerRef.current) {
      wardMarkerRef.current.remove();
      wardMarkerRef.current = null;
    }
    mapRef.current?.flyTo([16.0, 108.0], 6, { duration: 1.0 });
  };

  const hasFilters = selectedProvinceId || selectedWardId || selectedStars.length > 0 || searchQuery;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-88px)] relative overflow-hidden">

      {/* ── Left filter panel ─────────────────────────────────────────────── */}
      <div className="w-full lg:w-[360px] flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm z-10 overflow-y-auto shrink-0">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">Bộ lọc Bản đồ số</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Tìm kiếm theo vùng hành chính</p>
          </div>
          {hasFilters && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              <X className="h-3 w-3" /> Xóa lọc
            </button>
          )}
        </div>

        {/* Search */}
        <SearchBox
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Tìm sản phẩm, người bán..."
          className="max-w-none"
        />

        {/* ── Phân cấp hành chính ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Phân cấp hành chính
          </span>

          {/* Tỉnh / Thành phố */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[9px] font-black">1</span>
              Tỉnh / Thành phố
            </label>
            <div className="relative">
              <select
                value={selectedProvinceId}
                onChange={(e) => handleProvinceChange(e.target.value)}
                className={selectCls}
              >
                <option value="">Tất cả tỉnh thành (Việt Nam)</option>
                {provinces.map((prov) => (
                  <option key={prov.id} value={prov.id}>{prov.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* Xã / Phường / Thị trấn */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-black">2</span>
                Xã / Phường / Thị trấn
                {isLoadingWards && <LoadingSpinner size="sm" className="ml-1" />}
              </label>
              {selectedProvinceId && wards.length > 0 && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  {wards.length} xã/phường
                </span>
              )}
            </div>
            <div className="relative">
              <select
                value={selectedWardId}
                onChange={(e) => handleWardChange(e.target.value)}
                disabled={!selectedProvinceId || isLoadingWards}
                className={`${selectCls} ${!selectedProvinceId ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-900' : ''}`}
              >
                {!selectedProvinceId ? (
                  <option value="">← Vui lòng chọn Tỉnh/Thành trước</option>
                ) : (
                  <>
                    <option value="">
                      {isLoadingWards ? 'Đang tải danh sách xã/phường...' : `Tất cả xã phường (${wards.length})`}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.id} value={ward.id}>{ward.name}</option>
                    ))}
                  </>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
        </div>

        {/* ── Xếp hạng sao ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Xếp hạng OCOP</span>
          <div className="flex gap-2">
            {[3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleStarToggle(star)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  selectedStars.includes(star)
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${selectedStars.includes(star) ? 'fill-current' : ''}`} />
                {star}★
              </button>
            ))}
          </div>
        </div>

        {/* ── Kết quả lọc count ───────────────────────────────────────── */}
        <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Hiển thị trên bản đồ</span>
          <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{filteredProducts.length}</span>
        </div>

        {/* ── Chi tiết sản phẩm đã click ──────────────────────────────── */}
        {selectedProduct ? (
          <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sản phẩm đã chọn</span>
              <button
                onClick={() => setSelectedProduct(null)}
                className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group">
              {/* Image Section */}
              <div className="relative h-40 w-full bg-slate-100 dark:bg-slate-800">
                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                  <AssetImage 
                    src={selectedProduct.images.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))[0].imageUrl} 
                    alt={selectedProduct.name} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <ImageIcon className="h-8 w-8 opacity-50" />
                    <span className="text-xs">Chưa có hình ảnh</span>
                  </div>
                )}
                
                {/* OCOP Badge */}
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-amber-600 dark:text-amber-400 font-extrabold rounded-full text-[10px] shadow-sm backdrop-blur-sm">
                    {selectedProduct.ocopLevel?.level} Sao OCOP
                  </span>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-4">
                {/* Title & Category */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">{selectedProduct.category?.name}</span>
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-snug">{selectedProduct.name}</h3>
                  <div className="mt-2 font-black text-emerald-600 dark:text-emerald-400 text-lg">
                    {selectedProduct.price.toLocaleString('vi-VN')}đ <span className="text-xs font-semibold text-slate-400">/ {selectedProduct.unit}</span>
                  </div>
                </div>

                {/* Info List */}
                <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{selectedProduct.seller?.sellerProfile?.displayName ?? selectedProduct.seller?.fullName}</span>
                  </div>
                  {selectedProduct.seller?.sellerProfile?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                      <span className="leading-snug">{selectedProduct.seller.sellerProfile?.address}</span>
                    </div>
                  )}
                  {(selectedProduct.seller?.sellerProfile?.phone ?? selectedProduct.seller?.phone) && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{selectedProduct.seller?.sellerProfile?.phone ?? selectedProduct.seller?.phone}</span>
                    </div>
                  )}
                </div>

                {/* Description Snippet */}
                {selectedProduct.description && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                    {selectedProduct.description}
                  </div>
                )}

                {/* Action */}
                <Link href={`/products/${selectedProduct.id}`} className="mt-2">
                  <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg">
                    Xem bài viết chi tiết <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs gap-3 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-slate-400 animate-bounce" />
            </div>
            <span>Click vào marker trên bản đồ<br/>để xem đặc sản địa phương</span>
          </div>
        )}
      </div>

      {/* ── Map container ─────────────────────────────────────────────────── */}
      <div className="flex-grow rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-inner">
        <div ref={mapContainerRef} className="h-full w-full z-0" />

        {/* Map Style Switcher (Đường sá | Địa hình | Vệ tinh) */}
        <div className="absolute top-3 right-3 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 p-1 rounded-2xl shadow-lg flex items-center gap-1">
          {(['standard', 'terrain', 'satellite'] as MapStyleType[]).map((styleKey) => {
            const item = MAP_STYLES[styleKey];
            const isActive = mapStyle === styleKey;
            return (
              <button
                key={styleKey}
                onClick={() => setMapStyle(styleKey)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                title={`Chuyển sang chế độ ${item.name}`}
              >
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="absolute bottom-5 left-5 z-10 bg-white/95 dark:bg-slate-900/95 border border-slate-100 dark:border-slate-800 p-3 rounded-xl shadow-lg flex flex-col gap-2 text-[10px] text-slate-500">
          <span className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[8px]">Phân loại bản đồ số</span>
          <div className="flex items-center gap-2"><div className="shrink-0" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#DA251D', border: '1px solid #FCD34D', color: '#FFFF00', fontSize: '6px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>5★</div><span>OCOP 5 Sao (Đặc sản Quốc tế)</span></div>
          <div className="flex items-center gap-2"><div className="shrink-0" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#DA251D', border: '1px solid #FCD34D', color: '#FFFF00', fontSize: '6px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>4★</div><span>OCOP 4 Sao (Đặc sản Quốc gia)</span></div>
          <div className="flex items-center gap-2"><div className="shrink-0" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#DA251D', border: '1px solid #FCD34D', color: '#FFFF00', fontSize: '6px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3★</div><span>OCOP 3 Sao (Đặc sản Địa phương)</span></div>
          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 ring-2 ring-emerald-200 dark:ring-emerald-800" />
            <span>Định vị trung tâm hành chính xã</span>
          </div>
        </div>

        {/* Breadcrumb zoom info */}
        {(selectedProvinceId || selectedWardId) && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-4 py-1.5 rounded-full shadow-md flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" />
            {provinces.find((p) => p.id === selectedProvinceId)?.name}
            {selectedWardId && (
              <>
                <ChevronDown className="h-3 w-3 -rotate-90 text-slate-300" />
                {wards.find((w) => w.id === selectedWardId)?.name}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
