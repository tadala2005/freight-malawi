import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format } from 'date-fns';
import { vehicleApi } from '../api/endpoints';
import HistoryMap from '../components/History/HistoryMap';
import DateRangePicker from '../components/UI/DateRangePicker';
import EmptyState from '../components/UI/EmptyState';
import { SkeletonRows } from '../components/UI/Skeleton';
import { MapPinned } from 'lucide-react';

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function History() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [dateRange, setDateRange] = useState({ from: defaultFrom(), to: new Date().toISOString().slice(0, 10) });
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    vehicleApi.list().then((list) => {
      setVehicles(list);
      if (list.length && !vehicleId) setVehicleId(String(list[0].id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    const data = await vehicleApi.history(vehicleId, {
      from: dateRange.from ? `${dateRange.from}T00:00:00` : undefined,
      to: dateRange.to ? `${dateRange.to}T23:59:59` : undefined,
    });
    setPoints(data.points || []);
    setLoading(false);
  }, [vehicleId, dateRange]);

  useEffect(() => { load(); }, [load]);

  const chartData = points.map((p) => ({
    time: format(new Date(p.recorded_at), 'HH:mm'),
    fuel_percent: p.fuel_percent,
    speed: p.speed,
  }));

  return (
    <div>
      <h1>Route History</h1>
      <p style={{ color: 'var(--fm-muted)', marginBottom: 16 }}>Replay a vehicle&rsquo;s actual recorded route, fuel level and speed.</p>

      <div className="fm-card fm-card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <select className="fm-select" style={{ width: 220 }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}
          </select>
          <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} height={40} />
      ) : points.length === 0 ? (
        <div className="fm-card fm-card-pad">
          <EmptyState icon={MapPinned} title="No telemetry for this period" description="Try a wider date range, or start the simulator / device for this vehicle." />
        </div>
      ) : (
        <>
          <div className="fm-card" style={{ height: 420, marginBottom: 16 }}>
            <HistoryMap points={points} />
          </div>
          <div className="fm-card fm-card-pad">
            <h3>Fuel &amp; Speed Timeline</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fm-border)" />
                <XAxis dataKey="time" fontSize={12} />
                <YAxis fontSize={12} domain={[0, 'auto']} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="fuel_percent" name="Fuel %" stroke="#00D4AA" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="speed" name="Speed (km/h)" stroke="#22D3EE" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
