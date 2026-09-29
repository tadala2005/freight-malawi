import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { VehicleStatusBadge } from '../UI/Badge';

const MALAWI_CENTER = [-14.5, 34.5];
const MALAWI_DEFAULT_ZOOM = 7;

const STATUS_COLOR = {
  MOVING: '#00D4AA',
  IDLE: '#F59E0B',
  STOPPED: '#94A3B8',
  OFFLINE: '#64748B',
};

function truckIconSvg(color, heading, selected, offline) {
  return `
    <div style="transform:rotate(${heading || 0}deg);transform-origin:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))">
      <svg width="34" height="34" viewBox="0 0 34 34">
        <circle cx="17" cy="17" r="${selected ? 15 : 13}" fill="#07111F" stroke="${color}" stroke-width="${selected ? 4 : 3}" ${offline ? 'stroke-dasharray="3 2"' : ''}/>
        <path d="M11 21V12h8l4 4v5H11Zm1.5-2h7.7" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="14" cy="22" r="1.8" fill="${color}"/>
        <circle cx="21" cy="22" r="1.8" fill="${color}"/>
      </svg>
    </div>`;
}

function vehicleIcon(vehicle, selected) {
  const color = STATUS_COLOR[vehicle.current_status] || '#94A3B8';
  return L.divIcon({
    html: truckIconSvg(color, vehicle.latest_telemetry?.heading || 0, selected, vehicle.current_status === 'OFFLINE'),
    className: 'fm-vehicle-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function ResizeHandler() {
  const map = useMap();
  const ref = useRef(null);

  useEffect(() => {
    const container = map.getContainer();
    ref.current = new ResizeObserver(() => map.invalidateSize());
    ref.current.observe(container);
    const invalidate = () => map.invalidateSize();
    const timers = [150, 500, 1000].map((ms) => setTimeout(invalidate, ms));
    window.addEventListener('resize', invalidate);
    return () => {
      ref.current?.disconnect();
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', invalidate);
    };
  }, [map]);
  return null;
}

function FocusHandler({ vehicle }) {
  const map = useMap();
  useEffect(() => {
    const t = vehicle?.latest_telemetry;
    if (!t || t.latitude == null || t.longitude == null) return;
    map.flyTo([Number(t.latitude), Number(t.longitude)], 10, { duration: 0.6 });
  }, [vehicle, map]);
  return null;
}

export default function LiveMap({ vehicles = [], selectedVehicleId, onSelectVehicle, height = '100%' }) {
  const positioned = useMemo(() => vehicles.filter((v) => {
    const t = v.latest_telemetry;
    return t && Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude));
  }), [vehicles]);
  const selected = positioned.find((v) => String(v.id) === String(selectedVehicleId));

  return (
    <div className="map-container" style={{ height }}>
      <MapContainer center={MALAWI_CENTER} zoom={MALAWI_DEFAULT_ZOOM} scrollWheelZoom style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ResizeHandler />
        <FocusHandler vehicle={selected} />
        {positioned.map((v) => {
          const t = v.latest_telemetry;
          const offline = v.current_status === 'OFFLINE';
          return (
            <Marker
              key={v.id}
              position={[Number(t.latitude), Number(t.longitude)]}
              icon={vehicleIcon(v, String(v.id) === String(selectedVehicleId))}
              eventHandlers={{ click: () => onSelectVehicle?.(v.id) }}
            >
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <strong>{v.name}</strong>
                    <VehicleStatusBadge status={v.current_status} />
                  </div>
                  <div style={{ color: 'var(--fm-text-secondary)', lineHeight: 1.75 }}>
                    Registration: <strong style={{ color: 'var(--fm-text)' }}>{v.license_plate}</strong><br />
                    Driver: <strong style={{ color: 'var(--fm-text)' }}>{v.driver_name || 'Unassigned'}</strong><br />
                    Speed: <strong style={{ color: 'var(--fm-text)' }}>{Number(t.speed || 0).toFixed(0)} km/h</strong><br />
                    Fuel: <strong style={{ color: 'var(--fm-text)' }}>{Number(t.fuel_percent || 0).toFixed(0)}%</strong><br />
                    GPS: <strong style={{ color: offline ? 'var(--fm-warning)' : 'var(--fm-primary)' }}>{offline ? 'LAST KNOWN' : 'LIVE'}</strong><br />
                    Last telemetry: <strong style={{ color: 'var(--fm-text)' }}>{t.recorded_at ? new Date(t.recorded_at).toLocaleString() : 'Unknown'}</strong>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 500, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="fm-badge fm-badge-teal">LIVE</span>
        <span className="fm-badge fm-badge-muted">LAST KNOWN</span>
      </div>
    </div>
  );
}
