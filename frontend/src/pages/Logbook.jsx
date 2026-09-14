import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import EmptyState from '../components/UI/EmptyState.jsx';
import Modal from '../components/UI/Modal.jsx';
import { TripAPI } from '../api/endpoints.js';
import { subscribe } from '../socket/socket.js';
import { useToast } from '../context/ToastContext.jsx';

const CATEGORIES = ['FUEL', 'TOLL', 'DRIVER_ALLOWANCE', 'LOADING', 'UNLOADING', 'MAINTENANCE', 'REPAIR', 'ACCOMMODATION', 'FOOD', 'OTHER'];

const money = (value) => `MWK ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const statusClass = (status) => status === 'COMPLETED' ? 'trip-status completed' : status === 'ACTIVE' ? 'trip-status active' : status === 'CANCELLED' ? 'trip-status cancelled' : 'trip-status pending';

export default function Logbook() {
  const { showToast } = useToast();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [expense, setExpense] = useState({ category: 'FUEL', description: '', amount: '' });
  const [savingExpense, setSavingExpense] = useState(false);
  const [completing, setCompleting] = useState(false);

  const loadTrips = useCallback(async () => {
    const { data } = await TripAPI.list({ search, status });
    setTrips(data.trips || []);
  }, [search, status]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    const { data } = await TripAPI.get(id);
    setDetail(data);
  }, []);

  useEffect(() => {
    loadTrips().finally(() => setLoading(false));
  }, [loadTrips]);

  useEffect(() => {
    const offCreated = subscribe('trip:created', loadTrips);
    const offUpdated = subscribe('trip:updated', async () => {
      await loadTrips();
      if (selectedId) await loadDetail(selectedId);
    });
    const offCompleted = subscribe('trip:completed', async () => {
      await loadTrips();
      if (selectedId) await loadDetail(selectedId);
    });
    return () => { offCreated(); offUpdated(); offCompleted(); };
  }, [loadTrips, loadDetail, selectedId]);

  const openTrips = useMemo(() => trips.filter((t) => ['PENDING_LOG', 'ACTIVE'].includes(t.status)), [trips]);

  async function addExpense() {
    if (!selectedId || !expense.amount || Number(expense.amount) <= 0) return;
    setSavingExpense(true);
    try {
      await TripAPI.addExpense(selectedId, expense);
      setExpense({ category: 'FUEL', description: '', amount: '' });
      await loadDetail(selectedId);
      await loadTrips();
      showToast('Expense added', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add expense', 'error');
    } finally {
      setSavingExpense(false);
    }
  }

  async function removeExpense(expenseId) {
    try {
      await TripAPI.deleteExpense(selectedId, expenseId);
      await loadDetail(selectedId);
      await loadTrips();
      showToast('Expense removed', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove expense', 'error');
    }
  }

  async function completeSelectedTrip() {
    if (!selectedId) return;
    setCompleting(true);
    try {
      await TripAPI.complete(selectedId);
      await loadDetail(selectedId);
      await loadTrips();
      showToast('Trip completed', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not complete trip', 'error');
    } finally {
      setCompleting(false);
    }
  }

  return (
    <AppShell title="Logbook">
      <Card title="Trip Logbook" subtitle="Track active trips, expenses and completed-trip profitability">
        <div className="report-toolbar">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <label className="form-label" htmlFor="trip-search">Search</label>
            <input id="trip-search" className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vehicle, driver, destination or trip number" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label className="form-label" htmlFor="trip-status">Status</label>
            <select id="trip-status" className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PENDING_LOG">Pending log</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      {loading ? <Skeleton height={300} /> : trips.length === 0 ? (
        <EmptyState icon={BookOpen} title="No trips recorded" description="Start a vehicle and complete the trip prompt to create a logbook entry." />
      ) : (
        <Card title="Trips">
          <div style={{ overflowX: 'auto' }}>
            <table className="fm-table">
              <thead><tr><th>Trip</th><th>Vehicle</th><th>Route</th><th>Start</th><th>Status</th><th>Revenue</th><th>Expenses</th><th>Result</th></tr></thead>
              <tbody>
                {trips.map((trip) => {
                  const revenue = Number(trip.agreed_payment || 0);
                  const expenses = Number(trip.total_expenses || 0);
                  const result = revenue - expenses;
                  return (
                    <tr key={trip.id} className="selectable" onClick={() => { setSelectedId(trip.id); loadDetail(trip.id); }}>
                      <td>{trip.trip_number}</td>
                      <td>{trip.vehicle_name}<div className="card-subtitle">{trip.license_plate}</div></td>
                      <td>{trip.origin || 'Not recorded'} → {trip.destination || 'Not recorded'}</td>
                      <td>{trip.started_at ? new Date(trip.started_at).toLocaleString() : 'Not recorded'}</td>
                      <td><span className={statusClass(trip.status)}>{trip.status.replace('_', ' ')}</span></td>
                      <td>{money(revenue)}</td>
                      <td>{money(expenses)}</td>
                      <td className={result < 0 ? 'financial-loss' : result > 0 ? 'financial-profit' : ''}>{trip.status === 'COMPLETED' ? money(result) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(detail)}
        title={detail ? `${detail.trip.trip_number} — ${detail.trip.vehicle_name}` : 'Trip'}
        onClose={() => { setDetail(null); setSelectedId(null); }}
        confirmLabel="Close"
        onConfirm={() => { setDetail(null); setSelectedId(null); }}
      >
        {detail && (
          <div className="trip-detail">
            <div className="trip-detail-grid">
              <div><span>Status</span><strong className={statusClass(detail.trip.status)}>{detail.trip.status.replace('_', ' ')}</strong></div>
              <div><span>Driver</span><strong>{detail.trip.vehicle_driver_name || 'Not recorded'}</strong></div>
              <div><span>Origin</span><strong>{detail.trip.origin || 'Not recorded'}</strong></div>
              <div><span>Destination</span><strong>{detail.trip.destination || 'Not recorded'}</strong></div>
              <div><span>Revenue</span><strong>{money(detail.report.financial.revenue)}</strong></div>
              <div><span>Net</span><strong className={detail.report.financial.netProfit < 0 ? 'financial-loss' : 'financial-profit'}>{money(detail.report.financial.netProfit)}</strong></div>
            </div>

            <div className="trip-detail-section">
              <div className="card-title">Trip data</div>
              <table className="fm-table"><tbody>
                <tr><td>Cargo</td><td>{detail.trip.cargo_type || 'Not recorded'} — {detail.trip.cargo_description || 'No description'}</td></tr>
                <tr><td>Planned distance</td><td>{detail.trip.planned_distance_km ?? 'Not recorded'} km</td></tr>
                <tr><td>Actual distance</td><td>{detail.trip.actual_distance_km ?? 'Not available'} km</td></tr>
                <tr><td>Fuel consumed</td><td>{detail.trip.fuel_consumed_litres ?? 'Not available'} L</td></tr>
                <tr><td>Fuel price</td><td>{detail.trip.fuel_price_per_litre ? money(detail.trip.fuel_price_per_litre) + ' / L' : 'Not recorded'}</td></tr>
              </tbody></table>
            </div>

            <div className="trip-detail-section">
              <div className="card-title">Expenses</div>
              <table className="fm-table"><thead><tr><th>Category</th><th>Description</th><th>Amount</th><th /></tr></thead><tbody>
                {(detail.expenses || []).map((item) => <tr key={item.id}><td>{item.expense_category}</td><td>{item.description || '—'}</td><td>{money(item.amount)}</td><td><Button size="sm" variant="ghost" onClick={() => removeExpense(item.id)}><Trash2 size={14} /></Button></td></tr>)}
                {(!detail.expenses || detail.expenses.length === 0) && <tr><td colSpan="4">No expenses recorded.</td></tr>}
              </tbody></table>
              {['PENDING_LOG', 'ACTIVE'].includes(detail.trip.status) && (
                <div className="expense-form">
                  <select className="form-input" value={expense.category} onChange={(e) => setExpense((v) => ({ ...v, category: e.target.value }))}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                  <input className="form-input" placeholder="Description" value={expense.description} onChange={(e) => setExpense((v) => ({ ...v, description: e.target.value }))} />
                  <input className="form-input" type="number" min="0.01" placeholder="Amount" value={expense.amount} onChange={(e) => setExpense((v) => ({ ...v, amount: e.target.value }))} />
                  <Button size="sm" loading={savingExpense} onClick={addExpense}><Plus size={14} /> Add</Button>
                </div>
              )}
            </div>

            <div className="trip-detail-section">
              <div className="card-title">Trip assessment</div>
              <div className={`profit-banner ${detail.report.financial.result === 'LOSS' ? 'loss' : detail.report.financial.result === 'PROFIT' ? 'profit' : 'break-even'}`}>
                <div><span>Result</span><strong>{detail.report.financial.result}</strong></div>
                <div><span>Total expenses</span><strong>{money(detail.report.financial.totalExpenses)}</strong></div>
                <div><span>Margin</span><strong>{detail.report.financial.profitMargin.toFixed(1)}%</strong></div>
              </div>
              <div className="trip-detail-actions">
                <Link className="btn btn-outline" to={`/trip-reports/${detail.trip.id}`} onClick={() => { setDetail(null); setSelectedId(null); }}>Open detailed report</Link>
                {['PENDING_LOG', 'ACTIVE'].includes(detail.trip.status) && <Button loading={completing} onClick={completeSelectedTrip}>Complete Trip</Button>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
