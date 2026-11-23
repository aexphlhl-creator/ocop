'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, Loader2, LocateFixed, Map as MapIcon, ChevronDown, ChevronUp, Check } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../services/api';

export interface LocationSuggestion {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'WAREHOUSE' | 'ORIGIN' | 'WARD' | 'GEOCODE' | string;
}

export interface LocationPickerProps {
  value: string;
  latitude?: number | null;
  longitude?: number | null;
  onChange: (data: { location: string; latitude: number | null; longitude: number | null }) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  helperText?: string;
}

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  WAREHOUSE: { label: 'Kho hàng', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  warehouse: { label: 'Kho hàng', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  ORIGIN: { label: 'Vùng trồng/SX', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  origin: { label: 'Vùng trồng/SX', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  WARD: { label: 'Xã/Phường', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  ward: { label: 'Xã/Phường', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  GEOCODE: { label: 'Địa điểm', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  external: { label: 'Địa điểm', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

function createPinIcon() {
  return L.divIcon({
    className: 'custom-location-pin',
    html: `
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:32px;height:32px;border-radius:50%;
        background:#10B981;border:2.5px solid #ffffff;
        box-shadow:0 3px 8px rgba(0,0,0,0.3);
        color:#ffffff;font-size:16px;cursor:grab;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export function LocationPicker({
  value,
  latitude,
  longitude,
  onChange,
  placeholder = 'Nhập địa điểm thực hiện hoặc chọn gợi ý...',
  required = false,
  disabled = false,
  className = '',
  label,
  helperText,
}: LocationPickerProps) {
  const text = value || '';
  const [suggestionResult, setSuggestionResult] = useState<{ query: string; items: LocationSuggestion[] }>({ query: '', items: [] });
  const [loadingQuery, setLoadingQuery] = useState<string | null>(null);
  const query = text.trim();
  const suggestions = query.length >= 2 && suggestionResult.query === query ? suggestionResult.items : [];
  const isLoadingSuggestions = query.length >= 2 && loadingQuery === query;
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);


  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch suggestions with debouncing
  useEffect(() => {
    if (!text || text.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingQuery(text.trim());
      try {
        const res = await api.get('/api/v1/supply-chain/locations/suggest', {
          params: { q: text.trim() },
          signal: controller.signal,
        });
        const items = res.data?.data || [];
        if (!controller.signal.aborted) setSuggestionResult({ query: text.trim(), items });
      } catch (err) {
        if (!controller.signal.aborted) console.error('Lỗi tìm kiếm gợi ý địa điểm:', err);
      } finally {
        if (!controller.signal.aborted) setLoadingQuery(null);
      }
    }, 300);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [text]);

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const feat = data?.features?.[0]?.properties;
        if (feat) {
          const parts = [
            feat.name,
            feat.street,
            feat.district || feat.county,
            feat.city || feat.state,
            feat.country,
          ].filter(Boolean);
          if (parts.length > 0) return parts.join(', ');
        }
      }
    } catch {
      // Ignore reverse geocode failures
    }
    return null;
  };

  const updateCoordinates = useCallback(function updateCoordinates(lat: number, lng: number, newLocationName?: string) {
    const nextName = newLocationName !== undefined ? newLocationName : text;
    onChange({
      location: nextName,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    });

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 15);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], {
          icon: createPinIcon(),
          draggable: true,
        }).addTo(mapInstanceRef.current);

        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          updateCoordinates(pos.lat, pos.lng);
          const resolved = await reverseGeocode(pos.lat, pos.lng);
          if (resolved) {
            updateCoordinates(pos.lat, pos.lng, resolved);
          }
        });

        markerRef.current = marker;
      }
    }
  }, [onChange, text]);

  // Initialize and update Leaflet map when opened
  useEffect(() => {
    if (!isMapOpen || !mapContainerRef.current) return;

    const defaultLat = latitude ?? 21.028511; // Default: Hanoi
    const defaultLng = longitude ?? 105.854444;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      }).setView([defaultLat, defaultLng], latitude != null && longitude != null ? 15 : 12);

      L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 20,
      }).addTo(map);

      if (latitude != null && longitude != null) {
        const marker = L.marker([latitude, longitude], {
          icon: createPinIcon(),
          draggable: true,
        }).addTo(map);

        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          updateCoordinates(pos.lat, pos.lng);
          const resolved = await reverseGeocode(pos.lat, pos.lng);
          if (resolved) {
            updateCoordinates(pos.lat, pos.lng, resolved);
          }
        });

        markerRef.current = marker;
      }

      map.on('click', async (e: L.LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        updateCoordinates(lat, lng);
        const resolved = await reverseGeocode(lat, lng);
        if (resolved) {
          updateCoordinates(lat, lng, resolved);
        }
      });

      mapInstanceRef.current = map;
    } else {
      if (latitude != null && longitude != null) {
        mapInstanceRef.current.setView([latitude, longitude], 15);
        if (markerRef.current) {
          markerRef.current.setLatLng([latitude, longitude]);
        } else {
          const marker = L.marker([latitude, longitude], {
            icon: createPinIcon(),
            draggable: true,
          }).addTo(mapInstanceRef.current);

          marker.on('dragend', async () => {
            const pos = marker.getLatLng();
            updateCoordinates(pos.lat, pos.lng);
            const resolved = await reverseGeocode(pos.lat, pos.lng);
            if (resolved) {
              updateCoordinates(pos.lat, pos.lng, resolved);
            }
          });
          markerRef.current = marker;
        }
      }
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 200);
    }

    return () => {
      // Keep map intact or cleanup if unmounting container
    };
  }, [isMapOpen, latitude, longitude, updateCoordinates]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  const handleSelectSuggestion = (item: LocationSuggestion) => {
    const chosenName = item.address || item.label;
    setShowDropdown(false);
    updateCoordinates(item.latitude, item.longitude, chosenName);
  };

  const handleCurrentGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    setGpsError(null);
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        updateCoordinates(lat, lng, text || `Tọa độ GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        setIsMapOpen(true);
      },
      (err) => {
        setIsLocating(false);
        setGpsError('Không thể truy cập vị trí hiện tại. Vui lòng cho phép quyền định vị.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className={`space-y-1.5 ${className}`} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>{label} {required && <span className="text-red-500">*</span>}</span>
          {latitude != null && longitude != null && (
            <span className="font-mono text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
              ✓ [{latitude.toFixed(4)}, {longitude.toFixed(4)}]
            </span>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MapPin className="h-4 w-4 text-slate-400" />
        </div>

        <input
          type="text"
          value={text}
          disabled={disabled}
          required={required}
          onChange={(e) => {
            setShowDropdown(true);
            onChange({
              location: e.target.value,
              latitude: latitude ?? null,
              longitude: longitude ?? null,
            });
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-24 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50"
        />

        {/* Action icons inside input */}
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
          {isLoadingSuggestions && (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          )}

          <button
            type="button"
            title="Lấy vị trí GPS hiện tại"
            onClick={handleCurrentGps}
            disabled={disabled || isLocating}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {isLocating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            ) : (
              <LocateFixed className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            title={isMapOpen ? 'Thu gọn bản đồ' : 'Chọn vị trí trên bản đồ'}
            onClick={() => {
              setIsMapOpen(!isMapOpen);
              setTimeout(() => {
                mapInstanceRef.current?.invalidateSize();
              }, 150);
            }}
            disabled={disabled}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
              isMapOpen
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <MapIcon className="h-3 w-3" />
            <span>{isMapOpen ? 'Ẩn' : 'Bản đồ'}</span>
          </button>
        </div>

        {/* Dropdown suggestions */}
        {showDropdown && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {(text.trim().length >= 2 ? suggestions : []).map((item) => {
              const badge = TYPE_BADGES[item.type] || TYPE_BADGES.GEOCODE;
              return (
                <li
                  key={item.id}
                  onClick={() => handleSelectSuggestion(item)}
                  className="flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-slate-800 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-start gap-2 overflow-hidden">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <div className="truncate">
                      <div className="font-medium text-xs">{item.label}</div>
                      {item.address && item.address !== item.label && (
                        <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {item.address}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {gpsError && (
        <p className="text-[11px] text-red-500">{gpsError}</p>
      )}

      {/* Map display */}
      <div hidden={!isMapOpen} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-emerald-600" />
              Bấm vào bản đồ hoặc kéo ghim để chọn tọa độ chính xác
            </span>
            {latitude != null && longitude != null && (
              <span className="font-mono text-emerald-700 dark:text-emerald-400">
                {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </span>
            )}
          </div>
          <div
            ref={mapContainerRef}
            className="h-48 w-full bg-slate-100 dark:bg-slate-900"
            style={{ zIndex: 0 }}
          />
        </div>

      {helperText && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{helperText}</p>
      )}
    </div>
  );
}

export default LocationPicker;
