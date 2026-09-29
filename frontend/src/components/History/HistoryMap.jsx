import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const MALAWI_CENTER = [-14.5, 34.5];

function FitAndResize({ points }) {
  const map = useMap();
  const roRef = useRef(null);

  useEffect(() => {
    const container = map.getContainer();
    roRef.current = new ResizeObserver(() => map.invalidateSize());
    roRef.current.observe(container);
    const invalidate = () => map.invalidateSize();
    const timers = [150, 400, 800].map((ms) => setTimeout(invalidate, ms));
    window.addEventListener('resize', invalidate);
    return () => {
      roRef.current?.disconnect();
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', invalidate);
    };
  }, [map]);

  useEffect(() => {
    if (!points?.length) return;
    if (points.length > 1) {
      map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 14 });
    } else {
      map.setView([points[0].lat, points[0].lng], 12);
    }
  }, [points, map]);

  return null;
}

export default function HistoryMap({ points = [], height = '100%' }) {
  const validPoints = points.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  const latlngs = validPoints.map((p) => [p.lat, p.lng]);
  const hasPoints = validPoints.length > 0;

  return (
    <div className="map-container" style={{ height }}>
      <MapContainer center={MALAWI_CENTER} zoom={7} scrollWheelZoom style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitAndResize points={validPoints} />
        {hasPoints && <Polyline positions={latlngs} pathOptions={{ color: '#00D4AA', weight: 4, opacity: 0.9 }} />}
        {hasPoints && (
          <CircleMarker center={latlngs[0]} radius={7} pathOptions={{ color: '#22D3EE', fillColor: '#22D3EE', fillOpacity: 1, weight: 2 }}>
            <Tooltip permanent direction="top">Start</Tooltip>
          </CircleMarker>
        )}
        {hasPoints && (
          <CircleMarker center={latlngs[latlngs.length - 1]} radius={7} pathOptions={{ color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 1, weight: 2 }}>
            <Tooltip permanent direction="top">Latest device point</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
