import React from 'react';
import { Download } from 'lucide-react';
import Button from '../UI/Button.jsx';

function escapeCsv(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(report) {
  const rows = [
    ['Field', 'Value'],
    ['Vehicle', report.vehicle.name],
    ['License Plate', report.vehicle.licensePlate],
    ['Driver', report.vehicle.driverName],
    ['Period Start', report.period.start],
    ['Period End', report.period.end],
    ['Total Distance (km)', report.totalDistanceKm],
    ['Total Fuel Consumed (L)', report.totalFuelConsumedLitres],
    ['Average Consumption (km/L)', report.averageConsumptionKmPerLitre],
    ['Alert Count', report.alertCount],
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `freight-malawi-report-${report.vehicle.licensePlate.replace(/\s+/g, '')}-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportTable({ report }) {
  if (!report) return null;

  return (
    <div>
      <div className="report-summary-grid">
        <div className="card">
          <div className="kpi-header"><span>Total Distance</span></div>
          <div className="kpi-value mono">{report.totalDistanceKm} km</div>
        </div>
        <div className="card">
          <div className="kpi-header"><span>Fuel Consumed</span></div>
          <div className="kpi-value mono">{report.totalFuelConsumedLitres} L</div>
        </div>
        <div className="card">
          <div className="kpi-header"><span>Avg Consumption</span></div>
          <div className="kpi-value mono">{report.averageConsumptionKmPerLitre} km/L</div>
        </div>
        <div className="card">
          <div className="kpi-header"><span>Alerts</span></div>
          <div className={`kpi-value mono${report.alertCount > 0 ? ' danger' : ''}`}>{report.alertCount}</div>
        </div>
      </div>

      <table className="fm-table" style={{ marginBottom: 16 }}>
        <thead>
          <tr><th>Field</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr><td>Vehicle</td><td>{report.vehicle.name} ({report.vehicle.licensePlate})</td></tr>
          <tr><td>Driver</td><td>{report.vehicle.driverName}</td></tr>
          <tr><td>Tank Capacity</td><td>{report.vehicle.fuelTankCapacity} L</td></tr>
          <tr><td>Period</td><td>{new Date(report.period.start).toLocaleString()} &rarr; {new Date(report.period.end).toLocaleString()}</td></tr>
          <tr><td>Telemetry Points</td><td>{report.pointCount}</td></tr>
        </tbody>
      </table>

      <Button variant="outline" onClick={() => downloadCsv(report)}>
        <Download size={16} /> Export CSV
      </Button>
    </div>
  );
}
