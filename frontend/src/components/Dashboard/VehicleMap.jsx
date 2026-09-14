import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

const MALAWI_CENTER = [-13.9626, 33.7741];
const MALAWI_ZOOM = 7;

function truckIcon(heading = 0, color = '#12877F') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34" style="transform: rotate(${heading}deg)">
      <circle cx="17" cy="17" r="15" fill="${color}" fill-opacity="0.18"/>
      <path d="M17 5 L25 24 L17 19.5 L9 24 Z" fill="${color}" stroke="#FFFFFF" stroke-width="1.5"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'fm-vehicle-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function fuelColor(percent) {
  if (percent > 50) return '#12877F';
  if (percent >= 25) return '#9C6B12';
  return '#CE1126';
}

function FitBounds({ vehicles }) {
  const map = useMap();
  React.useEffect(() => {
    const withFix = vehicles.filter((v) => v.latest_latitude != null && v.latest_longitude != null);
    if (withFix.length === 0) return;
    if (withFix.length === 1) {
      map.setView([withFix[0].latest_latitude, withFix[0].latest_longitude], 12);
    } else {
      const bounds = L.latLngBounds(withFix.map((v) => [v.latest_latitude, v.latest_longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);
  return null;
}

export default function VehicleMap({ vehicles, selectedVehicleId, onSelectVehicle }) {
  const withFix = useMemo(
    () => vehicles.filter((v) => v.latest_latitude != null && v.latest_longitude != null),
    [vehicles]
  );

  return (
    <MapContainer center={MALAWI_CENTER} zoom={MALAWI_ZOOM} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds vehicles={withFix} />
      {withFix.map((v) => (
        <Marker
          key={v.id}
          position={[v.latest_latitude, v.latest_longitude]}
          icon={truckIcon(v.latest_heading || 0, fuelColor(v.latest_fuel_percent ?? 100))}
          eventHandlers={{ click: () => onSelectVehicle && onSelectVehicle(v.id) }}
        >
          <Popup>
            <strong>{v.name}</strong> ({v.license_plate})<br />
            Driver: {v.driver_name}<br />
            Fuel: {Number(v.latest_fuel_percent ?? 0).toFixed(1)}%<br />
            Speed: {Number(v.latest_speed ?? 0).toFixed(0)} km/h<br />
            Updated: {v.latest_recorded_at ? new Date(v.latest_recorded_at).toLocaleTimeString() : '—'}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
