import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Route as RouteIcon, Fuel, Gauge, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { vehicleApi, reportApi, alertApi } from '../api/endpoints';
import KPICard from '../components/Dashboard/KPICard';
import LiveMap from '../components/Dashboard/LiveMap';
import { VehicleStatusBadge } from '../components/UI/Badge';
import { SkeletonRows } from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';
import AlertCard from '../components/Alerts/AlertCard';
import IgnitionSwitch from '../components/Dashboard/IgnitionSwitch';

export default function Dashboard() {
  const { getSocket } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [vehicleFilterId, setVehicleFilterId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [vehicleList, fleetSummary, alerts] = await Promise.all([
      vehicleApi.list(),
      reportApi.fleet(vehicleFilterId ? { vehicleId: vehicleFilterId } : undefined),
      alertApi.list({ scope: 'active', limit: 6, ...(vehicleFilterId ? { vehicleId: vehicleFilterId } : {}) }),
    ]);
    setVehicles(vehicleList);
    setSummary(fleetSummary);
    setRecentAlerts(alerts);
    setLoading(false);
  }, [vehicleFilterId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const onVehicleUpdate = (vehicle) => {
      setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? { ...v, ...vehicle } : v)));
    };
    const onTelemetryUpdate = ({ vehicle_id, reading }) => {
      setVehicles((prev) => prev.map((v) => (v.id === vehicle_id ? { ...v, latest_telemetry: reading } : v)));
    };
    const onAlertNew = (alert) => {
      const matchesVehicleFilter = !vehicleFilterId || String(alert.vehicle_id) === String(vehicleFilterId);
      if (!matchesVehicleFilter) return;
      setRecentAlerts((prev) => [alert, ...prev].slice(0, 6));
      setSummary((prev) => (prev ? { ...prev, open_alerts: prev.open_alerts + 1 } : prev));
    };
    const onTripUpdate = (trip) => {
      setVehicles((prev) => prev.map((v) => (
        v.id === trip.vehicle_id
          ? { ...v, active_trip: ['COMPLETED', 'CANCELLED'].includes(trip.status) ? null : trip }
          : v
      )));
    };
    const onDeviceStatus = ({ vehicle_id, status }) => {
      setVehicles((prev) => prev.map((v) => (v.id === vehicle_id ? { ...v, current_status: status } : v)));
    };

    socket.on('vehicle:update', onVehicleUpdate);
    socket.on('telemetry:update', onTelemetryUpdate);
    socket.on('alert:new', onAlertNew);
    socket.on('trip:started', onTripUpdate);
    socket.on('trip:updated', onTripUpdate);
    socket.on('trip:completed', onTripUpdate);
    socket.on('device:status', onDeviceStatus);

    return () => {
      socket.off('vehicle:update', onVehicleUpdate);
      socket.off('telemetry:update', onTelemetryUpdate);
      socket.off('alert:new', onAlertNew);
      socket.off('trip:started', onTripUpdate);
      socket.off('trip:updated', onTripUpdate);
      socket.off('trip:completed', onTripUpdate);
      socket.off('device:status', onDeviceStatus);
    };
  }, [getSocket, vehicleFilterId]);

  const visibleVehicles = vehicleFilterId
    ? vehicles.filter((vehicle) => String(vehicle.id) === String(vehicleFilterId))
    : vehicles;

  async function handleAcknowledge(id) {
    await alertApi.acknowledge(id);
    setRecentAlerts((prev) => prev.filter((a) => a.id !== id));
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fm-page-head">
        <div>
          <h1>Fleet Dashboard</h1>
          <p style={{ color: 'var(--fm-muted)' }}>Live overview of your vehicles, fuel and trip activity.</p>
        </div>
        <label className="fm-field-inline">
          <span>Vehicle view</span>
          <select
            value={vehicleFilterId}
            onChange={(event) => {
              const value = event.target.value;
              setVehicleFilterId(value);
              setSelectedVehicleId(value ? Number(value) : null);
            }}
          >
            <option value="">All vehicles</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name} · {vehicle.license_plate}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="kpi-grid">
        <KPICard icon={Truck} label="Active vehicles" value={`${summary.active_vehicles}/${summary.total_vehicles}`} sub={vehicleFilterId ? 'Selected vehicle' : 'Reporting now'} />
        <KPICard icon={RouteIcon} label="Active trips" value={summary.active_trips} sub="In progress" onClick={() => navigate('/logbook?status=ACTIVE')} />
        <KPICard icon={Fuel} label="Fuel monitored" value={`${summary.total_fuel_litres.toLocaleString()} L`} sub="Tracked across trips" />
        <KPICard icon={Gauge} label="Avg. consumption" value={summary.average_consumption_km_per_l ? `${summary.average_consumption_km_per_l} km/L` : '—'} sub={vehicleFilterId ? 'Selected vehicle' : 'Fleet average'} />
        <KPICard icon={Bell} label="Open alerts" value={summary.open_alerts} tone="red" sub="Needs attention" onClick={() => navigate('/alerts')} />
      </div>

      <div className="dashboard-grid">
        <div className="fm-card" style={{ height: 460, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 0' }}>
            <h3 style={{ margin: 0 }}>Live Fleet Map</h3>
          </div>
          <div style={{ flex: 1, padding: 12 }}>
            <LiveMap vehicles={visibleVehicles} selectedVehicleId={selectedVehicleId} onSelectVehicle={setSelectedVehicleId} />
          </div>
        </div>

        <div className="fm-card fm-card-pad" style={{ height: 460, display: 'flex', flexDirection: 'column' }}>
          <h3>Vehicles</h3>
          {visibleVehicles.length === 0 ? (
            <EmptyState title="No vehicles yet" description="Add your first truck to start tracking it." action={
              <button type="button" className="fm-btn fm-btn-primary" onClick={() => navigate('/vehicles')}>Add a vehicle</button>
            }
            />
          ) : (
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleVehicles.map((v) => (
                <div
                  key={v.id}
                  onClick={() => { setSelectedVehicleId(v.id); navigate(`/vehicles/${v.id}`); }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    background: selectedVehicleId === v.id ? 'var(--fm-navy-tint)' : 'transparent',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{v.license_plate} · {v.driver_name || 'Unassigned'}</div>
                    {v.active_trip && <div style={{ fontSize: 11, color: 'var(--fm-muted)', marginTop: 3 }}>{v.active_trip.status === 'PENDING_DETAILS' ? 'Trip ready · ' : 'Trip · '}{v.active_trip.route_name || `${v.active_trip.origin || 'Origin'} → ${v.active_trip.destination || 'Destination'}`}</div>}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <VehicleStatusBadge status={v.current_status} />
                    <IgnitionSwitch vehicle={v} compact />
                    {v.latest_telemetry && (
                      <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{Number(v.latest_telemetry.fuel_percent).toFixed(0)}% fuel · GPS {v.current_status === 'OFFLINE' ? 'last known' : 'live'}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fm-card fm-card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Recent Active Alerts</h3>
          <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => navigate('/alerts')}>View all</button>
        </div>
        {recentAlerts.length === 0 ? (
          <EmptyState icon={Bell} title="No active alerts" description="Your fleet is currently clear." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentAlerts.map((a) => (
              <AlertCard key={a.id} alert={a} onAcknowledge={handleAcknowledge} onOpenVehicle={(id) => navigate(`/vehicles/${id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
