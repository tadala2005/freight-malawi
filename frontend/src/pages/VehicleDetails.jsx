import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ArrowLeft, Gauge, MapPin, Clock } from 'lucide-react';
import { vehicleApi, alertApi, tripApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import FuelGauge from '../components/Dashboard/FuelGauge';
import { VehicleStatusBadge, TripStatusBadge } from '../components/UI/Badge';
import AlertCard from '../components/Alerts/AlertCard';
import { SkeletonRows } from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';
import IgnitionSwitch from '../components/Dashboard/IgnitionSwitch';
import { format } from 'date-fns';

export default function VehicleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getSocket } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [trips, setTrips] = useState([]);
  const [fuelTrend, setFuelTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [v, a, t, history] = await Promise.all([
      vehicleApi.get(id),
      alertApi.list({ vehicleId: id, limit: 8 }),
      tripApi.list({ vehicleId: id, limit: 10 }),
      vehicleApi.telemetry(id, { limit: 80 }),
    ]);
    setVehicle(v);
    setAlerts(a);
    setTrips(t);
    setFuelTrend(history.map((h) => ({
      time: format(new Date(h.recorded_at), 'HH:mm'),
      fuel_percent: Number(h.fuel_percent),
      speed: Number(h.speed),
    })));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onTelemetry = (payload) => {
      if (String(payload.vehicle_id) !== String(id)) return;
      setVehicle((prev) => (prev ? { ...prev, latest_telemetry: payload.reading } : prev));
      setFuelTrend((prev) => [...prev, { time: format(new Date(payload.reading.recorded_at), 'HH:mm'), fuel_percent: Number(payload.reading.fuel_percent), speed: Number(payload.reading.speed) }].slice(-80));
    };
    const onVehicleUpdate = (v) => {
      if (String(v.id) !== String(id)) return;
      setVehicle((prev) => (prev ? { ...prev, ...v } : prev));
    };
    const onAlertNew = (alert) => {
      if (String(alert.vehicle_id) !== String(id)) return;
      setAlerts((prev) => [alert, ...prev].slice(0, 8));
    };
    const onTripUpdate = (trip) => {
      setTrips((prev) => {
        const exists = prev.some((t) => t.id === trip.id);
        if (exists) return prev.map((t) => (t.id === trip.id ? { ...t, ...trip } : t));
        return [trip, ...prev];
      });
      if (String(trip.vehicle_id) === String(id)) {
        setVehicle((prev) => (prev ? { ...prev, active_trip: trip.status === 'COMPLETED' || trip.status === 'CANCELLED' ? null : trip } : prev));
      }
    };

    socket.on('telemetry:update', onTelemetry);
    socket.on('vehicle:update', onVehicleUpdate);
    socket.on('alert:new', onAlertNew);
    socket.on('trip:started', onTripUpdate);
    socket.on('trip:updated', onTripUpdate);
    socket.on('trip:completed', onTripUpdate);

    return () => {
      socket.off('telemetry:update', onTelemetry);
      socket.off('vehicle:update', onVehicleUpdate);
      socket.off('alert:new', onAlertNew);
      socket.off('trip:started', onTripUpdate);
      socket.off('trip:updated', onTripUpdate);
      socket.off('trip:completed', onTripUpdate);
    };
  }, [getSocket, id]);

  async function handleAcknowledge(alertId) {
    await alertApi.acknowledge(alertId);
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
  }

  if (loading || !vehicle) {
    return <SkeletonRows rows={6} height={60} />;
  }

  const latest = vehicle.latest_telemetry;
  const cargo = latest ? Number(latest.cargo_weight_kg) : 0;
  const overCapacity = cargo > Number(vehicle.payload_capacity_kg);

  return (
    <div>
      <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => navigate('/vehicles')} style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back to vehicles
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1>{vehicle.name} <span style={{ color: 'var(--fm-muted)', fontWeight: 400, fontSize: 18 }}>· {vehicle.license_plate}</span></h1>
          <p style={{ color: 'var(--fm-muted)' }}>Driver: {vehicle.driver_name || 'Unassigned'} · Device: <span className="mono">{vehicle.device_id || 'Not configured'}</span></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><VehicleStatusBadge status={vehicle.current_status} /><IgnitionSwitch vehicle={vehicle} /></div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="fm-card fm-card-pad" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <FuelGauge litres={latest?.fuel_level_litres} percent={latest?.fuel_percent} capacity={vehicle.fuel_tank_capacity} />
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Gauge size={16} style={{ color: 'var(--fm-muted)' }} /> Speed: <strong>{latest ? `${Number(latest.speed).toFixed(0)} km/h` : '—'}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={16} style={{ color: 'var(--fm-muted)' }} /> Location: <span className="mono" style={{ fontSize: 12 }}>{latest ? `${Number(latest.latitude).toFixed(4)}, ${Number(latest.longitude).toFixed(4)}` : '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} style={{ color: 'var(--fm-muted)' }} /> Last update: {vehicle.last_seen_at ? format(new Date(vehicle.last_seen_at), 'PPp') : 'Never'}</div>
            <div>Ignition: <strong>{latest?.ignition_on ? 'ON' : 'OFF'}</strong></div>
            <div>
              Cargo: <strong style={{ color: overCapacity ? 'var(--fm-red)' : 'inherit' }}>{cargo.toLocaleString()} kg</strong> of {Number(vehicle.payload_capacity_kg).toLocaleString()} kg capacity
              {overCapacity && <span className="fm-badge fm-badge-red" style={{ marginLeft: 8 }}>Over capacity</span>}
            </div>
          </div>
        </div>

        <div className="fm-card fm-card-pad">
          <h3>Active Trip</h3>
          {vehicle.active_trip ? (
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <TripStatusBadge status={vehicle.active_trip.status} />
                <span style={{ color: 'var(--fm-muted)', fontSize: 13 }}>Started {format(new Date(vehicle.active_trip.started_at), 'PPp')}</span>
              </div>
              <p>{vehicle.active_trip.origin || 'Origin pending'} → {vehicle.active_trip.destination || 'Destination pending'}</p>
              <button type="button" className="fm-btn fm-btn-secondary fm-btn-sm" onClick={() => navigate(`/logbook?trip=${vehicle.active_trip.id}`)}>
                Open in Logbook
              </button>
            </div>
          ) : (
            <p style={{ color: 'var(--fm-muted)' }}>No active trip. Prepare a trip in the Logbook, then use the ignition switch above to start the simulation.</p>
          )}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--fm-border)' }}>
            <div style={{ fontSize: 12, color: 'var(--fm-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Driver Behaviour Indicator</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--fm-navy)' }}>{vehicle.behaviour_indicator?.score ?? '—'}/100</div>
            <p style={{ fontSize: 12, color: 'var(--fm-muted)' }}>Simulated, rule-based indicator over the last 30 days — not a certified safety score.</p>
          </div>
        </div>
      </div>

      <div className="fm-card fm-card-pad" style={{ marginBottom: 16 }}>
        <h3>Fuel &amp; Speed Trend (recent telemetry)</h3>
        {fuelTrend.length === 0 ? (
          <EmptyState title="No telemetry yet" description="Once the device or simulator starts reporting, trends will appear here." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={fuelTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--fm-border)" />
              <XAxis dataKey="time" fontSize={12} />
              <YAxis fontSize={12} yAxisId="left" domain={[0, 100]} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="fuel_percent" name="Fuel %" stroke="#00D4AA" dot={false} strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey="speed" name="Speed (km/h)" stroke="#22D3EE" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="two-col">
        <div className="fm-card fm-card-pad">
          <h3>Recent Alerts</h3>
          {alerts.length === 0 ? (
            <EmptyState title="No alerts" description="Nothing to report for this vehicle." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((a) => <AlertCard key={a.id} alert={a} onAcknowledge={handleAcknowledge} />)}
            </div>
          )}
        </div>

        <div className="fm-card fm-card-pad">
          <h3>Trip History</h3>
          {trips.length === 0 ? (
            <EmptyState title="No trips yet" description="Trips are prepared in the Logbook and started from the Dashboard ignition switch." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trips.map((t) => (
                <Link key={t.id} to={`/logbook?trip=${t.id}`} style={{ display: 'block', padding: '10px 12px', borderRadius: 8, background: 'var(--fm-background)', color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{t.origin || 'Origin'} → {t.destination || 'Destination'}</strong>
                    <TripStatusBadge status={t.status} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{format(new Date(t.created_at), 'PP')} · {t.distance_km ? `${t.distance_km} km` : 'Distance pending'}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
