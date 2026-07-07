'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../services/api';
import { useThemeStore } from '../../stores/theme.store';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { SearchBox } from '../ui/search-box';
import { MapPin, Star, Award, Store, Phone, Search, SlidersHorizontal } from 'lucide-react';

interface Province {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  bounds: any;
}

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  latitude: number;
  longitude: number;
  ocopLevel: {
    level: number;
    title: string;
  };
  category: {
    name: string;
  };
  business: {
    name: string;
    phone?: string;
    address: string;
  };
}

export default function OcopMap() {
  const { theme } = useThemeStore();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const markerGroupRef = useRef<L.FeatureGroup | null>(null);

  // States
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStars, setSelectedStars] = useState<number[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoadingGeoJson, setIsLoadingGeoJson] = useState(false);

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Khởi tạo bản đồ hướng về tâm Việt Nam
    const map = L.map(mapContainerRef.current, {
      center: [16.0, 108.0],
      zoom: 6,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    markerGroupRef.current = L.featureGroup().addTo(map);

    // Load danh sách tỉnh & sản phẩm từ API
    fetchProvinces();
    fetchProducts();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Đồng bộ Base Map Layer theo chế độ Sáng/Tối
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const lightUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const tileUrl = theme === 'dark' ? darkUrl : lightUrl;

    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(mapRef.current);

    tileLayerRef.current = tileLayer;
  }, [theme]);

  // Load danh sách tỉnh
  const fetchProvinces = async () => {
    try {
      const res = await api.get('/api/v1/provinces');
      setProvinces(res.data.data || []);
    } catch (err) {
      console.error('Lỗi khi tải tỉnh thành:', err);
    }
  };

  // Load danh sách sản phẩm OCOP
  const fetchProducts = async () => {
    try {
      // Gọi danh sách sản phẩm đã được kiểm duyệt APPROVED
      const res = await api.get('/api/v1/products?limit=100&status=APPROVED');
      const items = res.data.data?.items || [];
      setProducts(items);

      // Lấy danh sách ngành hàng duy nhất phục vụ lọc
      const cats: string[] = Array.from(new Set(items.map((p: any) => p.category?.name))).filter(Boolean) as string[];
      setCategories(cats);
    } catch (err) {
      console.error('Lỗi khi tải sản phẩm map:', err);
    }
  };

  // Vẽ ranh giới GeoJSON của Tỉnh/Thành phố khi người dùng click
  const drawProvinceBoundary = async (code: string) => {
    if (!mapRef.current) return;

    // Xóa layer ranh giới cũ nếu có
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
      geoJsonLayerRef.current = null;
    }

    if (!code) return;

    setIsLoadingGeoJson(true);
    try {
      const res = await api.get(`/api/v1/provinces/${code}/geojson`);
      const geojson = res.data.data;

      if (mapRef.current) {
        const geoLayer = L.geoJSON(geojson, {
          style: {
            color: '#10b981', // Màu ranh giới OCOP Emerald
            weight: 2,
            opacity: 0.8,
            fillColor: '#10b981',
            fillOpacity: theme === 'dark' ? 0.08 : 0.04,
          },
          onEachFeature: (feature, layer) => {
            layer.on({
              mouseover: (e) => {
                const target = e.target;
                target.setStyle({
                  fillOpacity: theme === 'dark' ? 0.15 : 0.08,
                  weight: 3,
                });
              },
              mouseout: (e) => {
                const target = e.target;
                target.setStyle({
                  fillOpacity: theme === 'dark' ? 0.08 : 0.04,
                  weight: 2,
                });
              },
            });
          },
        }).addTo(mapRef.current);

        geoJsonLayerRef.current = geoLayer;

        // Tự động zoom vừa vặn ranh giới địa giới tỉnh
        mapRef.current.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
      }
    } catch (err) {
      console.error('Không tìm thấy file GeoJSON ranh giới của tỉnh:', err);
    } finally {
      setIsLoadingGeoJson(false);
    }
  };

  // Tạo Custom Marker Icon thể hiện thứ hạng Sao OCOP
  const createMarkerIcon = (stars: number) => {
    const colorClass =
      stars === 5
        ? 'bg-emerald-500 ring-emerald-300 dark:ring-emerald-900/50'
        : stars === 4
        ? 'bg-amber-500 ring-amber-300 dark:ring-amber-900/50'
        : 'bg-blue-500 ring-blue-300 dark:ring-blue-900/50';

    return L.divIcon({
      html: `<div class="flex items-center justify-center w-7 h-7 rounded-full ${colorClass} text-white font-extrabold text-[10px] ring-4 shadow-md transition-all hover:scale-115">
               ${stars}★
             </div>`,
      className: 'custom-ocop-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  // Đồng bộ vẽ Markers lên bản đồ dựa trên bộ lọc
  const filteredProducts = products.filter((p) => {
    // 1. Lọc theo từ khóa tìm kiếm
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.business?.name.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Lọc theo mã tỉnh thành
    const matchesProvince = selectedProvinceCode
      ? provinces.find((prov) => prov.code === selectedProvinceCode)?.name === p.business?.address.split(',').pop()?.trim() ||
        p.business?.address.toLowerCase().includes((provinces.find((prov) => prov.code === selectedProvinceCode)?.name || '').toLowerCase())
      : true;

    // 3. Lọc theo số lượng sao
    const matchesStars = selectedStars.length > 0 ? selectedStars.includes(p.ocopLevel?.level) : true;

    return matchesSearch && matchesProvince && matchesStars;
  });

  useEffect(() => {
    if (!mapRef.current || !markerGroupRef.current) return;

    // Xóa toàn bộ markers cũ
    markerGroupRef.current.clearLayers();

    filteredProducts.forEach((product) => {
      if (!product.latitude || !product.longitude) return;

      const marker = L.marker([product.latitude, product.longitude], {
        icon: createMarkerIcon(product.ocopLevel?.level ?? 3),
      });

      // Tạo nội dung popup
      const popupContent = `
        <div class="p-2 flex flex-col gap-1.5 font-sans min-w-[200px]">
          <h4 class="font-bold text-sm text-slate-800">${product.name}</h4>
          <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 w-fit rounded-full">${product.category?.name}</span>
          <div class="text-xs text-slate-500 font-semibold mt-1">Đơn giá: <span class="text-red-500">${product.price.toLocaleString('vi-VN')}đ / ${product.unit}</span></div>
          <div class="text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 mt-1.5 flex flex-col gap-0.5">
            <div class="font-bold text-slate-600">${product.business?.name}</div>
            <div>${product.business?.address}</div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);

      // Bắt sự kiện click vào marker sản phẩm
      marker.on('click', () => {
        setSelectedProduct(product);
      });

      markerGroupRef.current?.addLayer(marker);
    });

    // Nếu không chọn tỉnh nào và có sản phẩm, zoom bao quát các sản phẩm
    if (!selectedProvinceCode && filteredProducts.length > 0 && mapRef.current) {
      const bounds = markerGroupRef.current.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [filteredProducts, selectedProvinceCode]);

  // Xử lý thay đổi tỉnh thành trên bộ lọc
  const handleProvinceChange = (code: string) => {
    setSelectedProvinceCode(code);
    setSelectedProduct(null);
    drawProvinceBoundary(code);

    if (!code && mapRef.current) {
      // Reset về trung tâm Việt Nam
      mapRef.current.setView([16.0, 108.0], 6);
      if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.remove();
        geoJsonLayerRef.current = null;
      }
    }
  };

  const handleStarToggle = (star: number) => {
    setSelectedStars((prev) =>
      prev.includes(star) ? prev.filter((s) => s !== star) : [...prev, star]
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-100px)] relative overflow-hidden dark:text-slate-100">
      {/* Left panel: Filter and list info */}
      <div className="w-full lg:w-96 flex flex-col gap-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm z-10 overflow-y-auto shrink-0">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-md font-black tracking-tight text-slate-800 dark:text-slate-100">Bộ lọc Bản đồ số</h2>
          <p className="text-[11px] text-slate-400">Tìm kiếm vùng phân bố và ranh giới hành chính</p>
        </div>

        {/* Filters block */}
        <div className="flex flex-col gap-4">
          <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Tìm sản phẩm, doanh nghiệp..." className="max-w-none" />

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Tỉnh thành phố</label>
            <select
              value={selectedProvinceCode}
              onChange={(e) => handleProvinceChange(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="">Tất cả tỉnh thành (Việt Nam)</option>
              {provinces.map((prov) => (
                <option key={prov.id} value={prov.code}>
                  {prov.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Xếp hạng OCOP</span>
            <div className="flex gap-2">
              {[3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStarToggle(star)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    selectedStars.includes(star)
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${selectedStars.includes(star) ? 'fill-current' : ''}`} />
                  {star}★
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Product highlight details */}
        {selectedProduct ? (
          <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800 pt-5 mt-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thông tin sản phẩm đã chọn</span>
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-white leading-tight">{selectedProduct.name}</h3>
                <span className="inline-flex items-center gap-0.5 mt-1 px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 text-amber-600 dark:text-amber-400 font-extrabold rounded-full text-[10px]">
                  {selectedProduct.ocopLevel?.level} Sao OCOP
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                <div className="flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>Ngành hàng: <span className="font-bold text-slate-600 dark:text-slate-300">{selectedProduct.category?.name}</span></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Chủ thể: <span className="font-bold text-slate-600 dark:text-slate-300">{selectedProduct.business?.name}</span></span>
                </div>
                {selectedProduct.business?.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>Hotline: <span className="text-slate-600 dark:text-slate-300">{selectedProduct.business.phone}</span></span>
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>Địa chỉ: <span className="text-slate-500 dark:text-slate-300">{selectedProduct.business?.address}</span></span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/10 mt-auto text-slate-400 text-xs">
            <MapPin className="h-5 w-5 mb-2 text-slate-300 animate-bounce" />
            Vui lòng chọn hoặc click vào một marker trên bản đồ để xem chi tiết
          </div>
        )}
      </div>

      {/* Map container */}
      <div className="flex-grow rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-inner">
        <div ref={mapContainerRef} className="h-full w-full z-0" />

        {/* Loading overlay for GeoJSON */}
        {isLoadingGeoJson && (
          <div className="absolute inset-0 bg-slate-900/10 dark:bg-slate-950/20 backdrop-blur-[1px] z-20 flex items-center justify-center">
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-full shadow-lg border border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-bold text-emerald-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              Đang vẽ ranh giới GeoJSON...
            </div>
          </div>
        )}

        {/* Legend Overlay */}
        <div className="absolute bottom-5 left-5 z-10 bg-white/95 dark:bg-slate-900/95 border border-slate-100 dark:border-slate-800 p-3 rounded-xl shadow-lg flex flex-col gap-2 font-sans text-[10px] text-slate-500">
          <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[8px]">Phân loại bản đồ số</span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Sản phẩm OCOP 5 Sao (Đặc sản Quốc tế)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Sản phẩm OCOP 4 Sao (Đặc sản Quốc gia)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Sản phẩm OCOP 3 Sao (Đặc sản Địa phương)</span>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-0.5">
            <span className="w-4 h-0.5 bg-emerald-500 border border-emerald-500" />
            <span>Ranh giới địa giới hành chính tỉnh</span>
          </div>
        </div>
      </div>
    </div>
  );
}
