'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const TILE_PROVIDERS = [
  {
    name: 'Google Maps',
    attribution: '&copy; Google Maps',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  },
  {
    name: 'Google Terrain',
    attribution: '&copy; Google Maps',
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
  },
  {
    name: 'Esri World Topo',
    attribution: 'Tiles &copy; Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  },
] as const;

const DefaultIcon = L.divIcon({
  className: '',
  iconSize: [34, 46],
  iconAnchor: [17, 42],
  popupAnchor: [0, -42],
  html: `
    <div style="
      position: relative;
      width: 34px;
      height: 46px;
      filter: drop-shadow(0 8px 10px rgba(15, 23, 42, 0.3));
    ">
      <div style="
        position: absolute;
        left: 3px;
        top: 0;
        width: 28px;
        height: 28px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: linear-gradient(135deg, #10b981, #0284c7);
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
      "></div>
      <div style="
        position: absolute;
        left: 12px;
        top: 9px;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: white;
      "></div>
    </div>
  `,
});

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 15, { animate: true, duration: 1.5 });
  }, [center, map]);
  return null;
}

interface MapPickerProps {
  center: [number, number];
  markerPosition: [number, number];
  onMarkerDragEnd: (lat: number, lng: number) => void;
}

export default function MapPicker({ center, markerPosition, onMarkerDragEnd }: MapPickerProps) {
  const [currentTileProviderIndex, setCurrentTileProviderIndex] = useState(0);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const tileErrorHandledRef = useRef<number | null>(null);
  const currentTileProvider = TILE_PROVIDERS[currentTileProviderIndex];

  const markerEventHandlers = useMemo(
    () => ({
      dragend(e: L.LeafletEvent) {
        const marker = e.target as L.Marker;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onMarkerDragEnd(latLng.lat, latLng.lng);
        }
      },
    }),
    [onMarkerDragEnd]
  );

  const tileEventHandlers = useMemo(
    () => ({
      tileload() {
        setTilesUnavailable(false);
      },
      tileerror() {
        if (tileErrorHandledRef.current === currentTileProviderIndex) return;
        tileErrorHandledRef.current = currentTileProviderIndex;

        if (currentTileProviderIndex < TILE_PROVIDERS.length - 1) {
          setCurrentTileProviderIndex((index) => index + 1);
          return;
        }

        setTilesUnavailable(true);
      },
    }),
    [currentTileProviderIndex],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
      <MapContainer center={center} zoom={13} scrollWheelZoom={true} className="h-full w-full z-0">
        <TileLayer
          key={currentTileProvider.name}
          attribution={currentTileProvider.attribution}
          url={currentTileProvider.url}
          eventHandlers={tileEventHandlers}
        />
        <Marker
          position={markerPosition}
          icon={DefaultIcon}
          draggable={true}
          eventHandlers={markerEventHandlers}
        />
        <MapController center={center} />
      </MapContainer>

      {tilesUnavailable && (
        <div className="pointer-events-none absolute inset-0 z-[400] bg-[linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),radial-gradient(circle_at_center,rgba(16,185,129,0.13),rgba(226,232,240,0.85))] bg-[size:48px_48px,48px_48px,100%_100%]">
          <div className="absolute left-3 top-3 max-w-[calc(100%-24px)] rounded-xl border border-amber-200 bg-white/90 px-3 py-2 text-xs font-semibold text-amber-700 shadow-sm backdrop-blur dark:border-amber-900 dark:bg-slate-900/90 dark:text-amber-300">
            Không tải được nền bản đồ bên ngoài. Marker vẫn dùng được — hãy search địa chỉ, dùng vị trí hiện tại hoặc kéo marker để lưu GPS.
          </div>
          <div className="absolute bottom-3 right-3 rounded-lg bg-white/85 px-2 py-1 font-mono text-[10px] text-slate-500 shadow-sm dark:bg-slate-900/85 dark:text-slate-400">
            GPS {markerPosition[0].toFixed(5)}, {markerPosition[1].toFixed(5)}
          </div>
        </div>
      )}
    </div>
  );
}
