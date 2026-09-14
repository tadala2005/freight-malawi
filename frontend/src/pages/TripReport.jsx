import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileBarChart } from 'lucide-react';
import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import EmptyState from '../components/UI/EmptyState.jsx';
import { TripAPI } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';

const money = (value) => `MWK ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
function csv(value) { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export default function TripReport() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    TripAPI.report(id).then(({ data }) => setReport(data.report)).catch(() => showToast('Could not load trip report', 'error')).finally(() => setLoading(false));
  }, [id, showToast]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ['Field', 'Value'],
      ['Trip ID', report.trip.id], ['Trip Number', report.trip.trip_number],
      ['Vehicle', report.trip.vehicle_name], ['License Plate', report.trip.license_plate],
      ['Driver', report.trip.vehicle_driver_name], ['Status', report.trip.status],
      ['Origin', report.trip.origin], ['Destination', report.trip.destination],
      ['Cargo Type', report.trip.cargo_type], ['Cargo Weight (kg)', report.trip.cargo_weight_kg],
      ['Planned Distance (km)', report.distance.plannedKm], ['Actual Distance (km)', report.distance.actualKm],
      ['Fuel Consumed (L)', report.fuel.consumedLitres], ['Fuel Price (MWK/L)', report.fuel.fuelPricePerLitre],
      ['Revenue (MWK)', report.financial.revenue], ['Fuel Expense (MWK)', report.financial.fuelExpense],
      ['Other Expenses (MWK)', report.financial.otherExpenses], ['Total Expenses (MWK)', report.financial.totalExpenses],
      ['Net Profit/Loss (MWK)', report.financial.netProfit], ['Profit Margin (%)', report.financial.profitMargin],
      ['Result', report.financial.result], ['Total Alerts', report.alertSummary.total], ['High Alerts', report.alertSummary.high],
    ];
    const csvText = rows.map((row) => row.map(csv).join(',')).join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${report.trip.trip_number}-report.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Trip Report">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Link className="btn btn-outline" to="/logbook"><ArrowLeft size={16} /> Logbook</Link>
        {report && <Button variant="outline" onClick={exportCsv}><Download size={16} /> Export CSV</Button>}
      </div>
      {loading ? <Skeleton height={520} /> : !report ? <EmptyState icon={FileBarChart} title="Report unavailable" description="The requested trip report could not be loaded." /> : (
        <>
          <div className="report-summary-grid">
            <div className="card"><div className="card-subtitle">Revenue</div><div className="kpi-value">{money(report.financial.revenue)}</div></div>
            <div className="card"><div className="card-subtitle">Total Expenses</div><div className="kpi-value">{money(report.financial.totalExpenses)}</div></div>
            <div className="card"><div className="card-subtitle">Net Result</div><div className={`kpi-value ${report.financial.netProfit < 0 ? 'danger' : ''}`}>{money(report.financial.netProfit)}</div></div>
            <div className="card"><div className="card-subtitle">Margin</div><div className="kpi-value">{report.financial.profitMargin.toFixed(1)}%</div></div>
          </div>

          <Card title={`${report.trip.trip_number} — ${report.trip.vehicle_name}`} subtitle={`${report.trip.license_plate} · ${report.trip.vehicle_driver_name || 'Driver not recorded'}`}>
            <div className={`profit-banner ${report.financial.result === 'LOSS' ? 'loss' : report.financial.result === 'PROFIT' ? 'profit' : 'break-even'}`}>
              <div><span>Trip result</span><strong>{report.financial.result}</strong></div>
              <div><span>Route</span><strong>{report.trip.origin || 'Not recorded'} → {report.trip.destination || 'Not recorded'}</strong></div>
              <div><span>Duration</span><strong>{report.trip.duration_minutes == null ? 'Not available' : `${report.trip.duration_minutes} min`}</strong></div>
            </div>

            <div className="report-detail-grid">
              <div><h3>Trip overview</h3><table className="fm-table"><tbody>
                <tr><td>Start</td><td>{report.trip.started_at ? new Date(report.trip.started_at).toLocaleString() : 'Not recorded'}</td></tr>
                <tr><td>Completed</td><td>{report.trip.completed_at ? new Date(report.trip.completed_at).toLocaleString() : 'Not completed'}</td></tr>
                <tr><td>Planned distance</td><td>{report.distance.plannedKm ?? 'Not recorded'} km</td></tr>
                <tr><td>Actual distance</td><td>{report.distance.actualKm ?? 'Not available'} km</td></tr>
                <tr><td>Variance</td><td>{report.distance.varianceKm ?? 'Not available'} km</td></tr>
                <tr><td>Cargo</td><td>{report.trip.cargo_type || 'Not recorded'} · {report.trip.cargo_weight_kg ?? 'Not recorded'} kg</td></tr>
              </tbody></table></div>
              <div><h3>Fuel</h3><table className="fm-table"><tbody>
                <tr><td>Starting fuel</td><td>{report.fuel.startingFuelLitres ?? 'Not available'} L</td></tr>
                <tr><td>Ending fuel</td><td>{report.fuel.endingFuelLitres ?? 'Not available'} L</td></tr>
                <tr><td>Consumed</td><td>{report.fuel.consumedLitres ?? 'Not available'} L</td></tr>
                <tr><td>Average</td><td>{report.fuel.averageKmPerLitre ?? 'Not available'} km/L</td></tr>
                <tr><td>Price</td><td>{report.fuel.fuelPricePerLitre ? money(report.fuel.fuelPricePerLitre) + ' / L' : 'Not recorded'}</td></tr>
                <tr><td>Fuel expense</td><td>{money(report.financial.fuelExpense)}</td></tr>
              </tbody></table></div>
            </div>

            <div className="report-detail-grid">
              <div><h3>Expense breakdown</h3><table className="fm-table"><thead><tr><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>{report.expenses.map((e) => <tr key={e.id}><td>{e.expense_category}</td><td>{e.description || '—'}</td><td>{money(e.amount)}</td></tr>)}</tbody></table></div>
              <div><h3>Alert summary</h3><table className="fm-table"><tbody><tr><td>Total</td><td>{report.alertSummary.total}</td></tr><tr><td>High</td><td>{report.alertSummary.high}</td></tr>{Object.entries(report.alertSummary.categories).map(([key, value]) => <tr key={key}><td>{key}</td><td>{value}</td></tr>)}</tbody></table></div>
            </div>

            <div><h3>Alert timeline</h3><table className="fm-table"><thead><tr><th>Time</th><th>Category</th><th>Alert</th><th>Severity</th><th>Status</th></tr></thead><tbody>{report.alerts.map((alert) => <tr key={alert.id}><td>{new Date(alert.created_at).toLocaleString()}</td><td>{alert.category}</td><td>{alert.message}</td><td>{alert.severity}</td><td>{alert.acknowledged ? 'Acknowledged' : 'Open'}</td></tr>)}{report.alerts.length === 0 && <tr><td colSpan="5">No alerts recorded for this trip.</td></tr>}</tbody></table></div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
