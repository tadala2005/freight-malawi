import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { BookOpen, Plus, PlayCircle } from 'lucide-react';
import { tripApi, vehicleApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../api/axios';
import SearchInput from '../components/UI/SearchInput';
import DateRangePicker from '../components/UI/DateRangePicker';
import { TripStatusBadge } from '../components/UI/Badge';
import EmptyState from '../components/UI/EmptyState';
import { SkeletonRows } from '../components/UI/Skeleton';
import TripDetailModal from '../components/Trips/TripDetailModal';
import { ROUTE_OPTIONS } from '../constants/routes';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING_DETAILS', label: 'Awaiting ignition' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ROUTE_COMPLETED', label: 'At destination' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function money(n) { return `MWK ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

const INITIAL_FORM = {
  vehicle_id: '', route_key: '', origin: '', destination: '', cargo_type: '', cargo_description: '', cargo_weight_kg: '', transporter_income: '',
};

export default function Logbook() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [vehicleId, setVehicleId] = useState('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [openTripId, setOpenTripId] = useState(searchParams.get('trip') ? Number(searchParams.get('trip')) : null);
  const { getSocket } = useAuth();
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tripApi.list({
        status: status || undefined,
        vehicleId: vehicleId || undefined,
        search: search || undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
      });
      setTrips(data);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, vehicleId, search, dateRange, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { vehicleApi.list().then(setVehicles).catch((err) => toast.error(extractErrorMessage(err))); }, [toast]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const reload = () => load();
    const onStarted = (trip) => { toast.success(`Trip started — ${trip.vehicle_name} (${trip.license_plate})`); load(); };
    const onUpdated = () => load();
    socket.on('trip:started', onStarted);
    socket.on('trip:updated', onUpdated);
    socket.on('trip:completed', reload);
    return () => {
      socket.off('trip:started', onStarted);
      socket.off('trip:updated', onUpdated);
      socket.off('trip:completed', reload);
    };
  }, [getSocket, load, toast]);

  function openTrip(id) {
    setOpenTripId(id);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('trip', id); return next; });
  }
  function closeTrip() {
    setOpenTripId(null);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('trip'); return next; });
  }
  function setField(field, value) { setForm((prev) => ({ ...prev, [field]: value })); }

  function changeRoute(routeKey) {
    const route = ROUTE_OPTIONS.find((r) => r.value === routeKey);
    setForm((prev) => ({
      ...prev,
      route_key: routeKey,
      origin: route ? route.origin : '',
      destination: route ? route.destination : '',
    }));
  }

  async function createTrip(e) {
    e.preventDefault();
    if (!form.vehicle_id || !form.route_key) {
      toast.warning('Choose a vehicle and trip route before creating the trip.');
      return;
    }
    if (form.cargo_weight_kg !== '' && Number(form.cargo_weight_kg) < 0) {
      toast.warning('Cargo weight cannot be negative.');
      return;
    }
    if (form.transporter_income !== '' && Number(form.transporter_income) < 0) {
      toast.warning('Income cannot be negative.');
      return;
    }
    setCreating(true);
    try {
      const trip = await tripApi.create({
        vehicle_id: Number(form.vehicle_id),
        route_key: form.route_key,
        origin: form.origin || null,
        destination: form.destination || null,
        cargo_type: form.cargo_type || null,
        cargo_description: form.cargo_description || null,
        cargo_weight_kg: form.cargo_weight_kg === '' ? null : Number(form.cargo_weight_kg),
        transporter_income: form.transporter_income === '' ? 0 : Number(form.transporter_income),
      });
      toast.success('Trip plan created. Go to Dashboard and turn the ignition ON to start the simulation.');
      setForm(INITIAL_FORM);
      await load();
      openTrip(trip.id);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1>Trip Logbook</h1>
          <p style={{ color: 'var(--fm-muted)' }}>Prepare the trip first, then start the vehicle from the Dashboard ignition switch.</p>
        </div>
      </div>

      <div className="fm-card fm-card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div><h3 style={{ margin: 0 }}>Prepare a new trip</h3><div style={{ color: 'var(--fm-muted)', fontSize: 13 }}>The trip stays editable until it is marked completed.</div></div>
          <span className="fm-badge fm-badge-warning"><PlayCircle size={13} /> Awaiting ignition after save</span>
        </div>
        <form onSubmit={createTrip}>
          <div className="fm-form-grid">
            <div className="fm-field"><label htmlFor="new-trip-vehicle">Vehicle</label><select id="new-trip-vehicle" className="fm-select" value={form.vehicle_id} onChange={(e) => setField('vehicle_id', e.target.value)}><option value="">Select vehicle…</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}</select></div>
            <div className="fm-field"><label htmlFor="new-trip-route">Trip route</label><select id="new-trip-route" className="fm-select" value={form.route_key} onChange={(e) => changeRoute(e.target.value)}><option value="">Select route…</option>{ROUTE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div className="fm-field"><label htmlFor="new-trip-origin">Origin</label><input id="new-trip-origin" className="fm-input" value={form.origin} onChange={(e) => setField('origin', e.target.value)} placeholder="e.g. Blantyre" /></div>
            <div className="fm-field"><label htmlFor="new-trip-destination">Destination</label><input id="new-trip-destination" className="fm-input" value={form.destination} onChange={(e) => setField('destination', e.target.value)} placeholder="e.g. Lilongwe" /></div>
            <div className="fm-field"><label htmlFor="new-trip-cargo">Cargo category</label><input id="new-trip-cargo" className="fm-input" value={form.cargo_type} onChange={(e) => setField('cargo_type', e.target.value)} placeholder="e.g. Maize, Fertilizer, Cement" /></div>
            <div className="fm-field"><label htmlFor="new-trip-weight">Cargo weight (kg)</label><input id="new-trip-weight" type="number" min="0" className="fm-input" value={form.cargo_weight_kg} onChange={(e) => setField('cargo_weight_kg', e.target.value)} /></div>
            <div className="fm-field"><label htmlFor="new-trip-income">Transporter income (MWK)</label><input id="new-trip-income" type="number" min="0" className="fm-input" value={form.transporter_income} onChange={(e) => setField('transporter_income', e.target.value)} placeholder="0" /></div>
            <div className="fm-field"><label htmlFor="new-trip-notes">Trip notes</label><input id="new-trip-notes" className="fm-input" value={form.cargo_description} onChange={(e) => setField('cargo_description', e.target.value)} placeholder="Optional" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="submit" className="fm-btn fm-btn-primary" disabled={creating}><Plus size={16} /> {creating ? 'Creating…' : 'Create trip plan'}</button></div>
        </form>
      </div>

      <div className="fm-card fm-card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <SearchInput value={search} onDebouncedChange={setSearch} placeholder="Search route, vehicle, driver…" />
          <select className="fm-select" style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select className="fm-select" style={{ width: 200 }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}</select>
          <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
        </div>
      </div>

      <div className="fm-card fm-card-pad">
        {loading ? <SkeletonRows rows={5} height={44} /> : trips.length === 0 ? (
          <EmptyState icon={BookOpen} title="No trips yet" description="Create a trip plan above. It will appear here immediately and can be started from the Dashboard." />
        ) : (
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Route</th><th>Cargo</th><th>Distance</th><th>Income</th><th>Expenses</th><th>Profit/Loss</th><th>Status</th></tr></thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} onClick={() => openTrip(t.id)}>
                    <td>{format(new Date(t.created_at), 'PP')}</td>
                    <td>{t.vehicle_name}<br /><span style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{t.license_plate}</span></td>
                    <td>{t.driver_name || '—'}</td>
                    <td>{t.origin || '—'} → {t.destination || '—'}</td>
                    <td>{t.cargo_type || '—'}</td>
                    <td>{t.distance_km ? `${Number(t.distance_km).toFixed(1)} km` : 'Pending GPS'}</td>
                    <td>{money(t.transporter_income)}</td>
                    <td>{money(t.total_expenses)}</td>
                    <td style={{ color: t.profit_loss < 0 ? 'var(--fm-red)' : 'var(--fm-teal)', fontWeight: 600 }}>{money(t.profit_loss)}</td>
                    <td><TripStatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openTripId && <TripDetailModal tripId={openTripId} onClose={closeTrip} onChanged={load} />}
    </div>
  );
}
