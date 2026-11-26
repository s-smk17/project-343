import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { ROUTE_343E, RoutePoint } from '../data/route343e';

interface RouteMapProps {
  userPosition: { lat: number; lon: number } | null;
  followBus: boolean;
  onToggleFollowBus: () => void;
  onDisableFollowBus: () => void;
  triggerRadiusM: number;
  triggeredStops: Record<string, boolean>;
  currentStopName: string | null;
  yandexApiKey: string;
  onSelectStop?: (point: RoutePoint) => void;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  userPosition,
  followBus,
  onToggleFollowBus,
  onDisableFollowBus,
  triggerRadiusM,
  triggeredStops,
  currentStopName,
  yandexApiKey,
  onSelectStop,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const userRadiusRef = useRef<L.Circle | null>(null);

  const onDisableFollowRef = useRef(onDisableFollowBus);
  onDisableFollowRef.current = onDisableFollowBus;

  const onSelectStopRef = useRef(onSelectStop);
  onSelectStopRef.current = onSelectStop;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [59.882, 29.96],
      zoom: 11,
      maxZoom: 19,
      zoomControl: true,
      attributionControl: true,
    });
    map.attributionControl?.setPrefix(false);

    const routeCoords: L.LatLngExpression[] = ROUTE_343E.map((p) => [p.lat, p.lon]);
    L.polyline(routeCoords, {
      color: '#1d4ed8',
      weight: 4,
      opacity: 0.72,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    map.on('dragstart', () => {
      onDisableFollowRef.current();
    });

    mapRef.current = map;

    // Ensure proper tile sizing after flex/grid layout settles
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
      userMarkerRef.current = null;
      userRadiusRef.current = null;
    };
  }, []);

  // Update tile layer when Yandex API key changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const trimmedKey = yandexApiKey.trim();
    const layer = trimmedKey
      ? L.tileLayer(
          `https://tiles.api-maps.yandex.ru/v1/tiles/?x={x}&y={y}&z={z}&lang=ru_RU&l=map&projection=web_mercator&apikey=${encodeURIComponent(
            trimmedKey
          )}`,
          {
            maxZoom: 19,
            attribution: '© Яндекс Карты',
          }
        )
      : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        });

    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [yandexApiKey]);

  // Update stop markers when active/triggered stop state changes
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    ROUTE_343E.forEach((point) => {
      const hasAudio = Boolean(point.audio);
      const isPlaying = currentStopName === point.name;
      const isTriggered = Boolean(triggeredStops[point.name]);

      const marker = L.circleMarker([point.lat, point.lon], {
        radius: isPlaying ? 9 : hasAudio ? 7 : 4.5,
        color: '#ffffff',
        weight: hasAudio ? 2 : 1.5,
        fillColor: isPlaying
          ? '#059669'
          : isTriggered
          ? '#0284c7'
          : hasAudio
          ? '#1d4ed8'
          : '#64748b',
        fillOpacity: hasAudio ? 0.95 : 0.7,
      });

      marker.bindTooltip(point.name, {
        direction: 'top',
        offset: [0, -6],
      });

      marker.on('click', () => {
        onSelectStopRef.current?.(point);
      });

      marker.addTo(layer);
    });
  }, [currentStopName, triggeredStops]);

  // Update user GPS marker and follow-bus panning
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userPosition) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userRadiusRef.current) {
        map.removeLayer(userRadiusRef.current);
        userRadiusRef.current = null;
      }
      return;
    }

    const latLng: L.LatLngExpression = [userPosition.lat, userPosition.lon];

    if (!userRadiusRef.current) {
      userRadiusRef.current = L.circle(latLng, {
        radius: triggerRadiusM,
        color: '#2563eb',
        weight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.14,
      }).addTo(map);
    } else {
      userRadiusRef.current.setLatLng(latLng);
      userRadiusRef.current.setRadius(triggerRadiusM);
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker(latLng, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latLng);
    }

    if (followBus) {
      map.panTo(latLng, { animate: true });
    }
  }, [userPosition, followBus, triggerRadiusM]);

  return (
    <div className="relative w-full h-[360px] sm:h-[420px] lg:h-[520px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
      <div ref={containerRef} className="w-full h-full" />

      <button
        type="button"
        onClick={onToggleFollowBus}
        title={followBus ? 'Отключить слежение' : 'Включить слежение'}
        aria-label={followBus ? 'Отключить слежение' : 'Включить слежение'}
        className={`absolute right-3 bottom-3 z-[400] min-h-[44px] min-w-[44px] px-3 rounded-xl border shadow-md flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
          followBus
            ? 'bg-blue-700 border-blue-700 text-white'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
        }`}
      >
        <LocateFixed className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap">
          {followBus ? 'Слежение вкл.' : 'Следить'}
        </span>
      </button>
    </div>
  );
};
