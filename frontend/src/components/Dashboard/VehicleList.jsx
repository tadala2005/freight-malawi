import React, { useMemo } from 'react';
import { Truck, SearchX } from 'lucide-react';
import EmptyState from '../UI/EmptyState.jsx';

function deriveStatus(vehicle) {
  if (!vehicle.latest_recorded_at) return 'Offline';

  const timestamp = new Date(vehicle.latest_recorded_at).getTime();

  if (Number.isNaN(timestamp)) return 'Offline';

  const ageMs = Date.now() - timestamp;

  if (ageMs > 5 * 60 * 1000) return 'Offline';

  return Number(vehicle.latest_speed || 0) > 2 ? 'Moving' : 'Idle';
}

function statusTone(status) {
  if (status === 'Moving') return 'badge-teal';
  if (status === 'Idle') return 'badge-warning';
  return 'badge-muted';
}

function fuelTone(percent) {
  if (percent > 50) return 'high';
  if (percent >= 25) return 'mid';
  return 'low';
}

function safeText(value) {
  return value == null ? '' : String(value);
}

export default function VehicleList({
  vehicles = [],
  selectedVehicleId,
  onSelectVehicle,
  searchValue = '',
}) {
  const filtered = useMemo(() => {
    const query = safeText(searchValue).trim().toLowerCase();

    if (!query) {
      return vehicles;
    }

    return vehicles.filter((vehicle) => {
      const searchableText = [
        vehicle.name,
        vehicle.license_plate,
        vehicle.driver_name,
        vehicle.device_id,
      ]
        .map(safeText)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [vehicles, searchValue]);

  if (vehicles.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="No vehicles yet"
        description="Add your first truck to start monitoring fuel and location."
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No matching vehicles"
        description={`No vehicles match "${safeText(searchValue)}". Try another search term.`}
      />
    );
  }

  return (
    <table className="fm-table">
      <thead>
        <tr>
          <th>Plate</th>
          <th>Driver</th>
          <th>Fuel %</th>
          <th>Status</th>
          <th>Last Update</th>
        </tr>
      </thead>

      <tbody>
        {filtered.map((vehicle) => {
          const percent = Number(vehicle.latest_fuel_percent ?? 0);
          const safePercent = Math.max(0, Math.min(100, percent));
          const status = deriveStatus(vehicle);

          return (
            <tr
              key={vehicle.id}
              className={`selectable${
                selectedVehicleId === vehicle.id ? ' selected' : ''
              }`}
              onClick={() => onSelectVehicle(vehicle.id)}
              tabIndex={0}
              role="button"
              aria-label={`Select ${safeText(vehicle.name)}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectVehicle(vehicle.id);
                }
              }}
            >
              <td>
                <div style={{ fontWeight: 600 }}>
                  {safeText(vehicle.license_plate) || '—'}
                </div>

                <div
                  style={{
                    fontSize: 'var(--fm-text-xs)',
                    color: 'var(--fm-muted)',
                  }}
                >
                  {safeText(vehicle.name) || 'Unnamed vehicle'}
                </div>
              </td>

              <td>
                {safeText(vehicle.driver_name) || 'Unassigned'}
              </td>

              <td>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div className="fuel-bar-track" aria-hidden="true">
                    <div
                      className={`fuel-bar-fill ${fuelTone(safePercent)}`}
                      style={{
                        width: `${safePercent}%`,
                      }}
                    />
                  </div>

                  <span className="mono">
                    {safePercent.toFixed(0)}%
                  </span>
                </div>
              </td>

              <td>
                <span className={`badge ${statusTone(status)}`}>
                  {status}
                </span>
              </td>

              <td className="mono">
                {vehicle.latest_recorded_at
                  ? new Date(
                      vehicle.latest_recorded_at
                    ).toLocaleTimeString()
                  : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

