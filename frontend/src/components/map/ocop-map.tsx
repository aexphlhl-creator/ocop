'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
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
  business: { name: string; phone?: string; address: string };
  description?: string;
  images?: { imageUrl: string; isPrimary: boolean }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const selectCls =
  'flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer appearance-none';

// ─── Component ────────────────────────────────────────────────────────────────

export default function OcopMap() {
  const { theme } = useThemeStore();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const markerGroupRef = useRef<L.FeatureGroup | null>(null);

  // ── Data states ──────────────────────────────────────────────────────────
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // ── Filter states ────────────────────────────────────────────────────────
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedWardId, setSelectedWardId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStars, setSelectedStars] = useState<number[]>([]);
  const [currentZoom, setCurrentZoom] = useState(6);

  // ── UI states ────────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoadingGeoJson, setIsLoadingGeoJson] = useState(false);
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
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ─── Tile layer sync with theme ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) tileLayerRef.current.remove();

    const url =
      theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    tileLayerRef.current = L.tileLayer(url, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(mapRef.current);
  }, [theme]);

  // ─── API calls ────────────────────────────────────────────────────────────

  const fetchProvinces = async () => {
    try {
      const res = await api.get('/api/v1/provinces');
      setProvinces(res.data.data || []);
    } catch (err) {
      console.error('Lỗi tải tỉnh thành:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/api/v1/products?limit=500&status=APPROVED');
      setProducts(res.data.data || []);
    } catch (err) {
      console.error('Lỗi tải sản phẩm:', err);
    }
  };

  const fetchWards = useCallback(async (provinceId: string) => {
    if (!provinceId) { setWards([]); return; }
    setIsLoadingWards(true);
    try {
      const res = await api.get(`/api/v1/wards?provinceId=${provinceId}&limit=200`);
      setWards(res.data.data || []);
    } catch (err) {
      console.error('Lỗi tải xã phường:', err);
    } finally {
      setIsLoadingWards(false);
    }
  }, []);

  // ─── GeoJSON boundary ─────────────────────────────────────────────────────

  const drawProvinceBoundary = async (code: string) => {
    if (!mapRef.current) return;
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
      geoJsonLayerRef.current = null;
    }
    if (!code) return;

    setIsLoadingGeoJson(true);
    try {
      const res = await api.get(`/api/v1/provinces/${code}/geojson`);
      const geojson = res.data.data;
      if (!mapRef.current) return;

      const geoLayer = L.geoJSON(geojson, {
        style: {
          color: '#10b981',
          weight: 2,
          opacity: 0.8,
          fillColor: '#10b981',
          fillOpacity: theme === 'dark' ? 0.08 : 0.04,
        },
        onEachFeature: (_, layer) => {
          layer.on({
            mouseover: (e) => e.target.setStyle({ fillOpacity: theme === 'dark' ? 0.15 : 0.08, weight: 3 }),
            mouseout:  (e) => e.target.setStyle({ fillOpacity: theme === 'dark' ? 0.08 : 0.04, weight: 2 }),
          });
        },
      }).addTo(mapRef.current);

      geoJsonLayerRef.current = geoLayer;
      mapRef.current.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
    } catch (err) {
      console.error('Không tìm thấy GeoJSON tỉnh:', err);
    } finally {
      setIsLoadingGeoJson(false);
    }
  };

  // ─── Marker icon ──────────────────────────────────────────────────────────

  const createMarkerIcon = (stars: number) => {
    const cls =
      stars === 5 ? 'bg-emerald-500 ring-emerald-300'
      : stars === 4 ? 'bg-amber-500 ring-amber-300'
      : 'bg-blue-500 ring-blue-300';

    return L.divIcon({
      html: `<div class="flex items-center justify-center w-7 h-7 rounded-full ${cls} text-white font-extrabold text-[10px] ring-4 shadow-md">${stars}★</div>`,
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
      p.business?.name?.toLowerCase().includes(q);

    // Lọc theo tỉnh (so sánh provinceId nếu có, fallback address)
    const matchProvince = !selectedProvinceId
      ? true
      : p.provinceId
        ? p.provinceId === selectedProvinceId
        : p.business?.address
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

      provinceGroups.forEach((group) => {
        const marker = L.marker([group.province.latitude, group.province.longitude], {
          icon: L.divIcon({
            html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 ring-4 ring-emerald-300 text-white font-extrabold text-xs shadow-lg transform transition-transform hover:scale-110"><div class="flex flex-col items-center leading-none"><span>${group.count}</span><span class="text-[7px] font-bold mt-0.5">Sản phẩm</span></div></div>`,
            className: 'custom-cluster-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          }),
        });
        marker.bindTooltip(`<b>${group.province.name}</b><br/>${group.count} sản phẩm`, { direction: 'top', offset: [0, -20] });
        marker.on('click', () => {
          handleProvinceChange(group.province.id);
        });
        markerGroupRef.current?.addLayer(marker);
      });
    } else if (mode === 2) {
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
              wardName: p.business?.address || 'Khu vực',
            });
          }
        }
      });

      wardGroups.forEach((group, key) => {
        const marker = L.marker([group.lat, group.lng], {
          icon: L.divIcon({
            html: `<div class="flex items-center justify-center w-8 h-8 rounded-full ${group.count > 0 ? 'bg-amber-500 ring-amber-300' : 'bg-slate-400 ring-slate-200'} ring-4 text-white font-extrabold text-[10px] shadow-lg transform transition-transform hover:scale-110">${group.count}</div>`,
            className: 'custom-cluster-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        });
        marker.bindTooltip(`<b>${group.wardName}</b><br/>${group.count} sản phẩm`, { direction: 'top', offset: [0, -16] });
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
      // Cấp độ 3: Từng sản phẩm
      filteredProducts.forEach((product) => {
        if (!product.latitude || !product.longitude) return;

        const marker = L.marker([product.latitude, product.longitude], {
          icon: createMarkerIcon(product.ocopLevel?.level ?? 3),
        });

        marker.bindPopup(`
          <div class="p-2 flex flex-col gap-1.5 font-sans min-w-[200px]">
            <h4 class="font-bold text-sm text-slate-800">${product.name}</h4>
            <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 w-fit rounded-full">${product.category?.name}</span>
            <div class="text-xs text-slate-500 font-semibold mt-1">Đơn giá: <span class="text-red-500">${product.price.toLocaleString('vi-VN')}đ / ${product.unit}</span></div>
            <div class="text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 mt-1.5 flex flex-col gap-0.5">
              <div class="font-bold text-slate-600">${product.business?.name}</div>
              <div>${product.business?.address}</div>
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

  const handleProvinceChange = (id: string) => {
    const province = provinces.find((p) => p.id === id);
    setSelectedProvinceId(id);
    setSelectedProvinceCode(province?.code || '');
    setSelectedWardId('');
    setSelectedProduct(null);
    setWards([]);

    if (id) {
      fetchWards(id);
      drawProvinceBoundary(province?.code || '');
    } else {
      if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.remove();
        geoJsonLayerRef.current = null;
      }
      mapRef.current?.setView([16.0, 108.0], 6);
    }
  };

  const handleWardChange = (wardId: string) => {
    setSelectedWardId(wardId);
    setSelectedProduct(null);

    if (wardId) {
      // Zoom vào xã đó nếu có sản phẩm match
      const wardProducts = products.filter((p) => p.wardId === wardId);
      if (wardProducts.length > 0 && mapRef.current) {
        const latlngs = wardProducts
          .filter((p) => p.latitude && p.longitude)
          .map((p) => [p.latitude, p.longitude] as [number, number]);
        if (latlngs.length > 0) {
          mapRef.current.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 14 });
        }
      } else if (selectedProvinceId && mapRef.current && geoJsonLayerRef.current) {
        // Zoom về bounds tỉnh nếu xã không có sản phẩm
        mapRef.current.fitBounds(geoJsonLayerRef.current.getBounds(), { padding: [20, 20] });
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
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
      geoJsonLayerRef.current = null;
    }
    mapRef.current?.setView([16.0, 108.0], 6);
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
          placeholder="Tìm sản phẩm, doanh nghiệp..."
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

          {/* Xã / Phường – chỉ hiện khi đã chọn tỉnh */}
          {selectedProvinceId && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[9px] font-black">2</span>
                Xã / Phường / Thị trấn
                {isLoadingWards && <LoadingSpinner size="sm" className="ml-1" />}
              </label>
              <div className="relative">
                <select
                  value={selectedWardId}
                  onChange={(e) => handleWardChange(e.target.value)}
                  disabled={isLoadingWards || wards.length === 0}
                  className={selectCls}
                >
                  <option value="">
                    {isLoadingWards ? 'Đang tải...' : wards.length === 0 ? 'Không có dữ liệu' : `Tất cả xã phường (${wards.length})`}
                  </option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>{ward.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
          )}
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
                  <img 
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
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{selectedProduct.business?.name}</span>
                  </div>
                  {selectedProduct.business?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                      <span className="leading-snug">{selectedProduct.business.address}</span>
                    </div>
                  )}
                  {selectedProduct.business?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{selectedProduct.business.phone}</span>
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

        {/* Loading overlay */}
        {isLoadingGeoJson && (
          <div className="absolute inset-0 bg-slate-900/10 dark:bg-slate-950/20 backdrop-blur-[1px] z-20 flex items-center justify-center">
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-full shadow-lg border border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-bold text-emerald-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              Đang vẽ ranh giới địa giới hành chính...
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-5 left-5 z-10 bg-white/95 dark:bg-slate-900/95 border border-slate-100 dark:border-slate-800 p-3 rounded-xl shadow-lg flex flex-col gap-2 text-[10px] text-slate-500">
          <span className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[8px]">Phân loại bản đồ số</span>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" /><span>OCOP 5 Sao (Đặc sản Quốc tế)</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" /><span>OCOP 4 Sao (Đặc sản Quốc gia)</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" /><span>OCOP 3 Sao (Đặc sản Địa phương)</span></div>
          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span className="w-4 h-0.5 bg-emerald-500 shrink-0" /><span>Ranh giới hành chính tỉnh</span>
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
