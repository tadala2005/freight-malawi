import { useCallback, useEffect, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { reportApi, vehicleApi } from '../api/endpoints';
import DateRangePicker from '../components/UI/DateRangePicker';
import { SkeletonRows } from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';
import { useToast } from '../context/ToastContext';

function money(n) {
  return `MWK ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
function csvRow(row) { return row.map(csvEscape).join(','); }
function resultLabel(value) {
  const n = Number(value || 0);
  return n > 0 ? 'PROFIT' : n < 0 ? 'LOSS' : 'BREAK-EVEN';
}
function downloadCsv(filename, lines) {
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className="fm-card fm-card-pad">
      <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--fm-text-secondary)', fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 7, fontSize: 22, fontWeight: 750, color: tone || 'var(--fm-text)' }}>{value}</div>
    </div>
  );
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [tripRows, setTripRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [status, setStatus] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        vehicleId: vehicleId || undefined,
        status: status || undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
      };
      const [fleet, trips] = await Promise.all([
        reportApi.fleet(params),
        reportApi.trips(params),
      ]);
      setSummary(fleet);
      setTripRows(trips);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, [vehicleId, status, dateRange, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { vehicleApi.list().then(setVehicles).catch(() => {}); }, []);

  const selectedVehicle = vehicles.find((v) => String(v.id) === String(vehicleId));

  function exportCsv() {
    if (!tripRows.length) {
      toast.warning('No trip data to export for the current filters.');
      return;
    }
    const totalIncome = tripRows.reduce((s, t) => s + Number(t.transporter_income || 0), 0);
    const totalExpenses = tripRows.reduce((s, t) => s + Number(t.total_expenses || 0), 0);
    const totalDistance = tripRows.reduce((s, t) => s + Number(t.distance_km || 0), 0);
    const totalFuel = tripRows.reduce((s, t) => s + Number(t.fuel_used_litres || 0), 0);
    const totalNet = totalIncome - totalExpenses;
    const efficiency = totalFuel > 0 ? totalDistance / totalFuel : null;
    const vehicleLabel = selectedVehicle ? `${selectedVehicle.name} (${selectedVehicle.license_plate})` : 'All vehicles';
    const dateStamp = format(new Date(), 'yyyy-MM-dd');
    const lines = [
      csvRow(['FREIGHT MALAWI — FILTERED TRIP REPORT']),
      csvRow(['Generated', format(new Date(), 'yyyy-MM-dd HH:mm:ss')]),
      csvRow(['Vehicle filter', vehicleLabel]),
      csvRow(['Status filter', status || 'All statuses']),
      csvRow(['From date', dateRange.from || 'All dates']),
      csvRow(['To date', dateRange.to || 'All dates']),
      '',
      csvRow(['SUMMARY']),
      csvRow(['Trips included', tripRows.length]),
      csvRow(['Total distance (km)', totalDistance.toFixed(2)]),
      csvRow(['Fuel used (L)', totalFuel.toFixed(2)]),
      csvRow(['Overall fuel efficiency (km/L)', efficiency == null ? '' : efficiency.toFixed(2)]),
      csvRow(['Total income (MWK)', totalIncome.toFixed(2)]),
      csvRow(['Total expenses (MWK)', totalExpenses.toFixed(2)]),
      csvRow(['Net result (MWK)', totalNet.toFixed(2)]),
      csvRow(['Overall result', resultLabel(totalNet)]),
      '',
      csvRow(['TRIP DETAILS']),
      csvRow(['Trip ID', 'Trip Date', 'Vehicle', 'Registration', 'Driver', 'Route', 'Cargo Category', 'Cargo Weight (kg)', 'Distance (km)', 'Fuel Used (L)', 'Fuel Efficiency (km/L)', 'Income (MWK)', 'Expenses (MWK)', 'Net Result (MWK)', 'Result', 'Trip Status']),
      ...tripRows.map((t) => csvRow([
        t.id,
        t.created_at ? format(new Date(t.created_at), 'yyyy-MM-dd HH:mm') : '',
        t.vehicle_name,
        t.license_plate,
        t.driver_name || '',
        `${t.origin || ''} → ${t.destination || ''}`,
        t.cargo_type || '',
        t.cargo_weight_kg ?? '',
        t.distance_km ?? '',
        Number(t.fuel_used_litres || 0).toFixed(2),
        t.fuel_efficiency_km_per_l ?? '',
        Number(t.transporter_income || 0).toFixed(2),
        Number(t.total_expenses || 0).toFixed(2),
        Number(t.profit_loss || 0).toFixed(2),
        resultLabel(t.profit_loss),
        t.status,
      ])),
    ];
    const safe = vehicleLabel.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'all';
    downloadCsv(`freight-malawi-report-${safe}-${dateStamp}.csv`, lines);
    toast.success('Filtered report exported to CSV.');
  }

  return (
    <div className="reports-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Reports</h1>
          <p style={{ color: 'var(--fm-text-secondary)' }}>Every card, table and CSV export uses the same vehicle, status and date filters.</p>
        </div>
        <button type="button" className="fm-btn fm-btn-primary" onClick={exportCsv} disabled={loading || !tripRows.length}><Download size={16} /> Export CSV</button>
      </div>

      <div className="fm-card fm-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--fm-text-secondary)', fontSize: 13, fontWeight: 700 }}><Filter size={15} /> REPORT FILTERS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <select className="fm-select" style={{ minWidth: 230, width: 'auto' }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">All vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}
          </select>
          <select className="fm-select" style={{ minWidth: 190, width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING_DETAILS">Awaiting ignition</option>
            <option value="ACTIVE">Active</option>
            <option value="ROUTE_COMPLETED">At destination</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
        </div>
      </div>

      {loading ? <SkeletonRows rows={2} height={92} /> : summary && (
        <div className="reports-kpi-grid">
          <SummaryCard label="TOTAL DISTANCE" value={`${Number(summary.total_distance_km || 0).toLocaleString()} km`} />
          <SummaryCard label="FUEL USED" value={`${Number(summary.total_fuel_litres || 0).toLocaleString()} L`} />
          <SummaryCard label="AVG. CONSUMPTION" value={summary.average_consumption_km_per_l ? `${summary.average_consumption_km_per_l} km/L` : '—'} />
          <SummaryCard label="TOTAL INCOME" value={money(summary.total_income)} />
          <SummaryCard label="TOTAL EXPENSES" value={money(summary.total_expenses)} />
          <SummaryCard label="NET RESULT" value={money(summary.fleet_profit_loss)} tone={Number(summary.fleet_profit_loss) < 0 ? 'var(--fm-danger)' : 'var(--fm-success)'} />
        </div>
      )}

      <div className="fm-card fm-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div><h3>Trip results</h3><div style={{ color: 'var(--fm-text-secondary)', fontSize: 12 }}>{tripRows.length} trip{tripRows.length === 1 ? '' : 's'} in the active filter</div></div>
        </div>
        {loading ? <SkeletonRows rows={5} height={42} /> : tripRows.length === 0 ? <EmptyState title="No trips for these filters" description="Create a trip in the Logbook and start it from Dashboard ignition." /> : (
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead><tr><th>Vehicle</th><th>Route</th><th>Cargo</th><th>Distance</th><th>Fuel</th><th>Income</th><th>Expenses</th><th>Net</th><th>Status</th></tr></thead>
              <tbody>
                {tripRows.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.vehicle_name}</strong><br /><span style={{ fontSize: 12, color: 'var(--fm-text-secondary)' }}>{t.license_plate}</span></td>
                    <td>{t.origin || '—'} → {t.destination || '—'}</td>
                    <td>{t.cargo_type || '—'}{t.cargo_weight_kg ? ` · ${Number(t.cargo_weight_kg).toLocaleString()} kg` : ''}</td>
                    <td>{t.distance_km != null ? `${Number(t.distance_km).toFixed(1)} km` : '—'}</td>
                    <td>{Number(t.fuel_used_litres || 0).toFixed(1)} L<br /><span style={{ fontSize: 11, color: 'var(--fm-text-secondary)' }}>{t.fuel_efficiency_km_per_l ? `${t.fuel_efficiency_km_per_l} km/L` : '—'}</span></td>
                    <td>{money(t.transporter_income)}</td>
                    <td>{money(t.total_expenses)}</td>
                    <td><strong>{money(t.profit_loss)}</strong><div style={{ fontSize: 11, color: Number(t.profit_loss) < 0 ? 'var(--fm-danger)' : 'var(--fm-success)' }}>{t.result || resultLabel(t.profit_loss)}</div></td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
