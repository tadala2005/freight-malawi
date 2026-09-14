import React, { useEffect, useState } from 'react';
import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import EmptyState from '../components/UI/EmptyState.jsx';
import ReportTable from '../components/Dashboard/ReportTable.jsx';
import { VehicleAPI } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { FileBarChart } from 'lucide-react';

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 16),
    end: end.toISOString().slice(0, 16),
  };
}

export default function Reports() {
  const { showToast } = useToast();
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [range, setRange] = useState(defaultRange());
  const [report, setReport] = useState(null);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    VehicleAPI.list().then(({ data }) => {
      setVehicles(data.vehicles);
      if (data.vehicles.length > 0) setVehicleId(String(data.vehicles[0].id));
    }).finally(() => setLoadingVehicles(false));
  }, []);

  async function generateReport() {
    if (!vehicleId) return;
    setGenerating(true);
    try {
      const { data } = await VehicleAPI.report(
        vehicleId,
        new Date(range.start).toISOString(),
        new Date(range.end).toISOString()
      );
      setReport(data.report);
      showToast('Report generated', 'success');
    } catch (err) {
      showToast('Could not generate report', 'error');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AppShell title="Reports">
      <Card>
        <div className="report-toolbar">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label className="form-label" htmlFor="rep-vehicle">Vehicle</label>
            <select id="rep-vehicle" className="form-input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="rep-start">Start</label>
            <input id="rep-start" type="datetime-local" className="form-input" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="rep-end">End</label>
            <input id="rep-end" type="datetime-local" className="form-input" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </div>
          <Button onClick={generateReport} loading={generating} disabled={!vehicleId}>Generate Report</Button>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      {loadingVehicles ? (
        <Skeleton height={200} />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No vehicles yet" description="Add a vehicle before generating a report." />
      ) : !report ? (
        <EmptyState icon={FileBarChart} title="No report generated" description="Choose a vehicle and date range, then click Generate Report." />
      ) : (
        <Card title="Report Summary">
          <ReportTable report={report} />
        </Card>
      )}
    </AppShell>
  );
}
