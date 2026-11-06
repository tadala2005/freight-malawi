
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Route as RouteIcon,
  Fuel,
  Gauge,
  Bell,
  AlertTriangle
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { vehicleApi, reportApi, alertApi } from '../api/endpoints';

import KPICard from '../components/Dashboard/KPICard';
import LiveMap from '../components/Dashboard/LiveMap';
import { VehicleStatusBadge } from '../components/UI/Badge';
import { SkeletonRows } from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';
import AlertCard from '../components/Alerts/AlertCard';
import IgnitionSwitch from '../components/Dashboard/IgnitionSwitch';

const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function isReporting(vehicle) {
  if (vehicle.current_status === 'OFFLINE') {
    return false;
  }

  if (!vehicle.last_seen_at) {
    return true;
  }

  const lastSeen = new Date(vehicle.last_seen_at).getTime();

  return (
    !Number.isFinite(lastSeen) ||
    Date.now() - lastSeen < 90000
  );
}

export default function Dashboard() {
  const { getSocket } = useAuth();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [vehicleFilterId, setVehicleFilterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());

  const loadAll = useCallback(async () => {
    try {
      const params = vehicleFilterId
        ? { vehicleId: vehicleFilterId }
        : undefined;

      const [
        vehicleList,
        fleetSummary,
        alerts
      ] = await Promise.all([
        vehicleApi.list(),
        reportApi.fleet(params),
        alertApi.list({
          scope: 'active',
          acknowledged: false,
          limit: 30,
          ...(params || {})
        })
      ]);

      setVehicles(
        Array.isArray(vehicleList) ? vehicleList : []
      );

      setSummary(fleetSummary);

      setRecentAlerts(
        Array.isArray(alerts) ? alerts : []
      );

      setError('');
    } catch (err) {
      setError(
        'Unable to refresh the dashboard. Check your backend connection.'
      );

      console.error('Dashboard refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [vehicleFilterId]);

  // Initial loading and periodic reconciliation.
  useEffect(() => {
    setSummary(null);

    loadAll();

    const refresh = setInterval(loadAll, 20000);

    const clockTick = setInterval(
      () => setClock(Date.now()),
      10000
    );

    return () => {
      clearInterval(refresh);
      clearInterval(clockTick);
    };
  }, [loadAll]);

  // Real-time telemetry and alert updates.
  useEffect(() => {
    const socket = getSocket();

    if (!socket) {
      return undefined;
    }

    const onVehicleUpdate = (vehicle) => {
      setVehicles(prev =>
        prev.map(v =>
          String(v.id) === String(vehicle.id)
            ? { ...v, ...vehicle }
            : v
        )
      );
    };

    const onTelemetryUpdate = ({
      vehicle_id,
      reading
    }) => {
      setVehicles(prev =>
        prev.map(v =>
          String(v.id) === String(vehicle_id)
            ? {
                ...v,
                latest_telemetry: reading
              }
            : v
        )
      );
    };

    const onAlertNew = (alert) => {
      if (
        vehicleFilterId &&
        String(alert.vehicle_id) !== vehicleFilterId
      ) {
        return;
      }

      setRecentAlerts(prev =>
        prev.some(a => a.id === alert.id)
          ? prev
          : [alert, ...prev].slice(0, 30)
      );

      setSummary(prev =>
        prev
          ? {
              ...prev,
              open_alerts:
                asNumber(prev.open_alerts) + 1
            }
          : prev
      );
    };

    const onTripUpdate = (trip) => {
      setVehicles(prev =>
        prev.map(v =>
          String(v.id) === String(trip.vehicle_id)
            ? {
                ...v,
                active_trip:
                  ['COMPLETED', 'CANCELLED'].includes(trip.status)
                    ? null
                    : trip
              }
            : v
        )
      );
    };

    const onDeviceStatus = ({
      vehicle_id,
      status
    }) => {
      setVehicles(prev =>
        prev.map(v =>
          String(v.id) === String(vehicle_id)
            ? {
                ...v,
                current_status: status
              }
            : v
        )
      );
    };

    const events = [
      ['vehicle:update', onVehicleUpdate],
      ['telemetry:update', onTelemetryUpdate],
      ['alert:new', onAlertNew],
      ['trip:started', onTripUpdate],
      ['trip:updated', onTripUpdate],
      ['trip:completed', onTripUpdate],
      ['device:status', onDeviceStatus]
    ];

    for (const [name, handler] of events) {
      socket.on(name, handler);
    }

    return () => {
      for (const [name, handler] of events) {
        socket.off(name, handler);
      }
    };
  }, [getSocket, vehicleFilterId]);

  // Selected vehicle controls every dashboard section.
  const visibleVehicles = useMemo(() => {
    if (!vehicleFilterId) {
      return vehicles;
    }

    return vehicles.filter(
      v => String(v.id) === vehicleFilterId
    );
  }, [vehicles, vehicleFilterId]);

  // Calculate KPIs directly from the most recent telemetry.
  const live = useMemo(() => {
    const reporting = visibleVehicles.filter(isReporting);

    const readings = reporting
      .filter(v => v.latest_telemetry)
      .map(v => v.latest_telemetry);

    const currentFuel = readings.reduce(
      (sum, reading) =>
        sum + asNumber(reading.fuel_level_litres),
      0
    );

    const moving = reporting.filter(
      v =>
        v.latest_telemetry &&
        asNumber(v.latest_telemetry.speed) > 2
    );

    const avgSpeed = moving.length
      ? moving.reduce(
          (sum, v) =>
            sum + asNumber(v.latest_telemetry.speed),
          0
        ) / moving.length
      : 0;

    const activeTrips = visibleVehicles.filter(
      v => v.active_trip?.status === 'ACTIVE'
    ).length;

    const fuelCapacity = visibleVehicles.reduce(
      (sum, v) =>
        sum + asNumber(v.fuel_tank_capacity),
      0
    );

    return {
      total: visibleVehicles.length,
      reporting: reporting.length,
      activeTrips,
      fuelLitres: currentFuel,
      fuelCapacity,
      hasReading: readings.length > 0,
      avgSpeed,
      movingCount: moving.length
    };
  }, [visibleVehicles, clock]);

  const selectedVehicle = vehicleFilterId
    ? visibleVehicles[0]
    : null;

  const newestTheftAlert = recentAlerts.find(
    a =>
      a.type === 'THEFT_SUSPECTED' &&
      String(a.severity).toUpperCase() === 'CRITICAL'
  );

  function selectVehicle(id) {
    setVehicleFilterId(
      id == null || id === ''
        ? ''
        : String(id)
    );
  }

  async function handleAcknowledge(id) {
    try {
      await alertApi.acknowledge(id);

      setRecentAlerts(
        prev => prev.filter(a => a.id !== id)
      );

      setSummary(prev =>
        prev
          ? {
              ...prev,
              open_alerts: Math.max(
                0,
                asNumber(prev.open_alerts) - 1
              )
            }
          : prev
      );
    } catch {
      setError(
        'Could not acknowledge the alert. Please try again.'
      );
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Dashboard</h1>
        <SkeletonRows rows={5} height={80} gap={14} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }}>
      <div className="fm-page-head">
        <div>
          <h1>Fleet Dashboard</h1>

          <p style={{ color: 'var(--fm-muted)' }}>
            Live data from authenticated device telemetry
            {' · '}
            {selectedVehicle
              ? selectedVehicle.license_plate
              : 'All vehicles'}
          </p>
        </div>

        <label className="fm-field-inline">
          <span>Vehicle view</span>

          <select
            value={vehicleFilterId}
            onChange={e => selectVehicle(e.target.value)}
          >
            <option value="">All vehicles</option>

            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.license_plate}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          className="fm-card fm-card-pad"
          style={{ border: '1px solid #F59E0B' }}
        >
          {error}

          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-sm"
            onClick={loadAll}
          >
            Retry
          </button>
        </div>
      )}

      {/* Critical theft notification */}
      {newestTheftAlert && (
        <div
          role="alert"
          className="fm-card fm-card-pad"
          style={{
            border: '2px solid #EF4444',
            background: 'rgba(239,68,68,.10)',
            display: 'flex',
            gap: 12,
            alignItems: 'center'
          }}
        >
          <AlertTriangle
            color="#EF4444"
            size={30}
          />

          <div style={{ flex: 1 }}>
            <strong style={{ color: '#EF4444' }}>
              CRITICAL — POSSIBLE FUEL THEFT
            </strong>

            <div>
              {newestTheftAlert.vehicle_name}
              {' ('}
              {newestTheftAlert.license_plate}
              {'): '}
              {newestTheftAlert.message}
            </div>

            <div style={{
              fontSize: 12,
              color: 'var(--fm-muted)'
            }}>
              Rule-based stationary fuel loss · Investigate immediately
            </div>
          </div>

          <button
            type="button"
            className="fm-btn fm-btn-secondary fm-btn-sm"
            onClick={() => navigate('/alerts')}
          >
            Review alert
          </button>
        </div>
      )}

      {/* Live KPI cards */}
      <div className="kpi-grid">
        <KPICard
          icon={Truck}
          label="Reporting vehicles"
          value={`${live.reporting}/${live.total}`}
          sub={
            vehicleFilterId
              ? 'Selected vehicle · live status'
              : 'Currently reporting'
          }
        />

        <KPICard
          icon={RouteIcon}
          label="Active trips"
          value={live.activeTrips}
          sub="From current Logbook trip status"
          onClick={() => navigate('/logbook?status=ACTIVE')}
        />

        <KPICard
          icon={Fuel}
          label="Current tank fuel"
          value={
            live.hasReading
              ? `${live.fuelLitres.toLocaleString(
                  undefined,
                  { maximumFractionDigits: 1 }
                )} L`
              : '—'
          }
          sub={
            live.fuelCapacity
              ? `Configured tank capacity: ${live.fuelCapacity.toLocaleString()} L · latest reading`
              : 'Awaiting live telemetry'
          }
        />

        <KPICard
          icon={Gauge}
          label="Live speed"
          value={`${live.avgSpeed.toFixed(1)} km/h`}
          sub={
            vehicleFilterId
              ? 'Current selected vehicle speed'
              : `Average moving speed · ${live.movingCount} moving`
          }
        />

        <KPICard
          icon={Bell}
          label="Open alerts"
          value={
            summary
              ? asNumber(summary.open_alerts)
              : '…'
          }
          tone="red"
          sub="Unacknowledged active incidents"
          onClick={() => navigate('/alerts')}
        />
      </div>

      {/* Map and vehicle list */}
      <div className="dashboard-grid">
        <div
          className="fm-card"
          style={{
            height: 460,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{
            padding: '14px 16px 0',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <h3 style={{ margin: 0 }}>
              Live Fleet Map
            </h3>

            {vehicleFilterId && (
              <button
                type="button"
                className="fm-btn fm-btn-ghost fm-btn-sm"
                onClick={() => selectVehicle('')}
              >
                Show all
              </button>
            )}
          </div>

          <div style={{
            flex: 1,
            padding: 12
          }}>
            <LiveMap
              vehicles={visibleVehicles}
              selectedVehicleId={
                vehicleFilterId
                  ? Number(vehicleFilterId)
                  : null
              }
              onSelectVehicle={selectVehicle}
            />
          </div>
        </div>

        <div
          className="fm-card fm-card-pad"
          style={{
            height: 460,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <h3>
            Vehicles
            {vehicleFilterId ? ' · Filtered' : ''}
          </h3>

          {visibleVehicles.length === 0 ? (
            <EmptyState
              title="No vehicles"
              description="Choose a vehicle or add a truck."
            />
          ) : (
            <div style={{
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {visibleVehicles.map(v => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background:
                      vehicleFilterId === String(v.id)
                        ? 'var(--fm-navy-tint)'
                        : 'transparent'
                  }}
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => selectVehicle(v.id)}
                      style={{
                        display: 'block',
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        color: 'inherit',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      {v.name}
                    </button>

                    <div style={{
                      fontSize: 12,
                      color: 'var(--fm-muted)'
                    }}>
                      {v.license_plate}
                      {' · '}
                      {v.driver_name || 'Unassigned'}
                    </div>

                    {v.active_trip && (
                      <div style={{
                        fontSize: 11,
                        marginTop: 4,
                        color: 'var(--fm-muted)'
                      }}>
                        Trip: {v.active_trip.status}
                      </div>
                    )}

                    <button
                      type="button"
                      className="fm-btn fm-btn-ghost fm-btn-sm"
                      onClick={() =>
                        navigate(`/vehicles/${v.id}`)
                      }
                    >
                      Details
                    </button>
                  </div>

                  <div style={{
                    textAlign: 'right',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 6
                  }}>
                    <VehicleStatusBadge
                      status={v.current_status}
                    />

                    <IgnitionSwitch
                      vehicle={v}
                      compact
                    />

                    {v.latest_telemetry && (
                      <div style={{
                        fontSize: 12,
                        color: 'var(--fm-muted)'
                      }}>
                        {asNumber(
                          v.latest_telemetry.fuel_percent
                        ).toFixed(1)}% fuel
                        {' · '}
                        {asNumber(
                          v.latest_telemetry.speed
                        ).toFixed(1)} km/h
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vehicle-filtered alerts */}
      <div className="fm-card fm-card-pad">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10
        }}>
          <h3 style={{ margin: 0 }}>
            Recent Active Alerts
            {selectedVehicle
              ? ` · ${selectedVehicle.license_plate}`
              : ''}
          </h3>

          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-sm"
            onClick={() => navigate('/alerts')}
          >
            View all
          </button>
        </div>

        {recentAlerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No active alerts"
            description="There are no unacknowledged active incidents for this selection."
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {recentAlerts.slice(0, 10).map(a => (
              <AlertCard
                key={a.id}
                alert={a}
                onAcknowledge={handleAcknowledge}
                onOpenVehicle={id =>
                  navigate(`/vehicles/${id}`)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
