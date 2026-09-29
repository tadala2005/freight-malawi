import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { alertApi, vehicleApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import AlertCard from '../components/Alerts/AlertCard';
import EmptyState from '../components/UI/EmptyState';
import { SkeletonRows } from '../components/UI/Skeleton';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = ['FUEL', 'DRIVER', 'SAFETY', 'LOAD', 'ROUTE', 'TRIP', 'SYSTEM'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function Alerts() {
  const [scope, setScope] = useState('active');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const { getSocket, refreshBadge } = useAuth();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await alertApi.list({
      scope,
      category: category || undefined,
      severity: severity || undefined,
      vehicleId: vehicleId || undefined,
      limit: 100,
    });
    setAlerts(data);
    setLoading(false);
  }, [scope, category, severity, vehicleId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { vehicleApi.list().then(setVehicles); }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onNew = () => load();
    socket.on('alert:new', onNew);
    return () => socket.off('alert:new', onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSocket]);

  async function handleAcknowledge(id) {
    setAcknowledgingId(id);
    try {
      await alertApi.acknowledge(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a)));
      refreshBadge();
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div>
      <h1>Alerts</h1>
      <p style={{ color: 'var(--fm-muted)', marginBottom: 16 }}>
        Active alerts belong to trips still in progress. Completed-trip alerts remain available here and in the Logbook, without inflating the notification bell.
      </p>

      <div className="fm-card fm-card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className={`fm-btn fm-btn-sm ${scope === 'active' ? 'fm-btn-primary' : 'fm-btn-ghost'}`} onClick={() => setScope('active')}>Active</button>
          <button type="button" className={`fm-btn fm-btn-sm ${scope === 'historical' ? 'fm-btn-primary' : 'fm-btn-ghost'}`} onClick={() => setScope('historical')}>Historical</button>
          <button type="button" className={`fm-btn fm-btn-sm ${scope === 'all' ? 'fm-btn-primary' : 'fm-btn-ghost'}`} onClick={() => setScope('all')}>All</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <select className="fm-select" style={{ width: 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="fm-select" style={{ width: 160 }} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="fm-select" style={{ width: 200 }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">All vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={5} height={70} gap={10} />
      ) : alerts.length === 0 ? (
        <div className="fm-card fm-card-pad">
          <EmptyState icon={Bell} title="No active alerts" description="Your fleet is currently clear." />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onAcknowledge={handleAcknowledge}
              acknowledging={acknowledgingId === a.id}
              onOpenVehicle={(id) => navigate(`/vehicles/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
