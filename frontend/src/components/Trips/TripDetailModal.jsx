import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Trash2, Plus, Pencil, Lock, PlayCircle } from 'lucide-react';
import { tripApi, expenseApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../api/axios';
import Modal, { ConfirmModal } from '../UI/Modal';
import { TripStatusBadge, SeverityBadge } from '../UI/Badge';
import TripDetailsForm from './TripDetailsForm';
import ExpenseForm from './ExpenseForm';
import { SkeletonRows } from '../UI/Skeleton';

function money(n) { return `MWK ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

export default function TripDetailModal({ tripId, onClose, onChanged }) {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingDetails, setEditingDetails] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try { setTrip(await tripApi.get(tripId)); }
    catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setLoading(false); }
  }, [tripId, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveDetails(payload) {
    setSubmitting(true);
    try { await tripApi.update(tripId, payload); toast.success('Trip details saved.'); setEditingDetails(false); await load(); onChanged?.(); }
    catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSubmitting(false); }
  }
  async function handleAddExpense(payload) {
    setSubmitting(true);
    try { await tripApi.addExpense(tripId, payload); toast.success('Expense added.'); setAddingExpense(false); await load(); onChanged?.(); }
    catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSubmitting(false); }
  }
  async function handleEditExpense(payload) {
    setSubmitting(true);
    try { await expenseApi.update(editingExpense.id, payload); toast.success('Expense updated.'); setEditingExpense(null); await load(); onChanged?.(); }
    catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSubmitting(false); }
  }
  async function handleDeleteExpense() {
    setSubmitting(true);
    try { await expenseApi.remove(deletingExpense.id); toast.success('Expense removed.'); setDeletingExpense(null); await load(); onChanged?.(); }
    catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSubmitting(false); }
  }
  async function handleComplete() {
    setSubmitting(true);
    try { await tripApi.complete(tripId); toast.success('Trip completed and locked.'); await load(); onChanged?.(); }
    catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSubmitting(false); }
  }

  const canEdit = trip && ['ACTIVE', 'ROUTE_COMPLETED', 'PENDING_DETAILS'].includes(trip.status);
  const canComplete = trip && ['ROUTE_COMPLETED', 'ACTIVE'].includes(trip.status);
  const locked = trip && ['COMPLETED', 'CANCELLED'].includes(trip.status);

  return (
    <Modal open={!!tripId} onClose={onClose} title={trip ? `${trip.vehicle_name || 'Vehicle'} · ${trip.license_plate || ''}` : 'Trip'} width="780px">
      {loading || !trip ? <SkeletonRows rows={6} height={20} /> : editingDetails ? (
        <TripDetailsForm trip={trip} onSubmit={handleSaveDetails} onCancel={() => setEditingDetails(false)} submitting={submitting} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <TripStatusBadge status={trip.status} />
              {trip.status === 'PENDING_DETAILS' && <span className="fm-badge fm-badge-warning"><PlayCircle size={13} /> Go to Dashboard → Ignition ON</span>}
              {locked && <span className="fm-badge fm-badge-muted"><Lock size={13} /> Read-only</span>}
              <span style={{ color: 'var(--fm-muted)', fontSize: 13 }}>Created {format(new Date(trip.created_at), 'PPp')} {trip.started_at ? `· Started ${format(new Date(trip.started_at), 'PPp')}` : ''}</span>
            </div>
            <h3 style={{ margin: '0 0 4px' }}>{trip.origin || 'Origin pending'} → {trip.destination || 'Destination pending'}</h3>
            <p style={{ color: 'var(--fm-muted)' }}>{trip.route_name || 'Route not set'} · {trip.cargo_type || 'Cargo category not set'}{trip.cargo_weight_kg ? ` · ${Number(trip.cargo_weight_kg).toLocaleString()} kg` : ''}</p>
            {canEdit && <button type="button" className="fm-btn fm-btn-secondary fm-btn-sm" onClick={() => setEditingDetails(true)}><Pencil size={14} /> Edit trip details</button>}
          </div>

          <div className="two-col">
            <div>
              <h4 style={{ marginBottom: 8 }}>Operational results</h4>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 7, fontSize: 14 }}>
                <dt style={{ color: 'var(--fm-muted)' }}>Distance</dt><dd style={{ margin: 0 }}>{trip.distance_km ? `${Number(trip.distance_km).toFixed(1)} km` : 'Pending GPS'}</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Fuel used</dt><dd style={{ margin: 0 }}>{Number(trip.fuel_used_litres || 0).toFixed(1)} L</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Efficiency</dt><dd style={{ margin: 0 }}>{trip.fuel_efficiency_km_per_l ? `${trip.fuel_efficiency_km_per_l} km/L` : 'Pending'}</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Max speed</dt><dd style={{ margin: 0 }}>{Number(trip.max_speed_kmh || 0).toFixed(0)} km/h</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Idle time</dt><dd style={{ margin: 0 }}>{Math.round((trip.idle_seconds || 0) / 60)} min</dd>
              </dl>
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Financial result</h4>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 7, fontSize: 14 }}>
                <dt style={{ color: 'var(--fm-muted)' }}>Income</dt><dd style={{ margin: 0 }}>{money(trip.transporter_income)}</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Expenses</dt><dd style={{ margin: 0 }}>{money(trip.total_expenses)}</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Profit / Loss</dt><dd style={{ margin: 0, fontWeight: 700, color: trip.profit_loss < 0 ? 'var(--fm-red)' : 'var(--fm-teal)' }}>{money(trip.profit_loss)}</dd>
                <dt style={{ color: 'var(--fm-muted)' }}>Margin</dt><dd style={{ margin: 0 }}>{trip.profit_margin_percent}%</dd>
              </dl>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Expenses</h4>
              {canEdit && <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => { setAddingExpense((v) => !v); setEditingExpense(null); }}><Plus size={14} /> Add expense</button>}
            </div>
            {addingExpense && <div style={{ marginBottom: 12, padding: 12, background: 'var(--fm-background)', borderRadius: 8 }}><ExpenseForm onSubmit={handleAddExpense} onCancel={() => setAddingExpense(false)} submitting={submitting} /></div>}
            {editingExpense && <div style={{ marginBottom: 12, padding: 12, background: 'var(--fm-background)', borderRadius: 8 }}><ExpenseForm initialValue={editingExpense} onSubmit={handleEditExpense} onCancel={() => setEditingExpense(null)} submitting={submitting} /></div>}
            {trip.expenses.length === 0 ? <p style={{ color: 'var(--fm-muted)' }}>No expenses recorded yet.</p> : (
              <div className="fm-table-wrap"><table className="fm-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th>{canEdit && <th />}</tr></thead><tbody>
                {trip.expenses.map((e) => <tr key={e.id}>
                  <td>{format(new Date(e.expense_date), 'PP')}</td><td>{e.category}</td><td>{e.description || '—'}</td><td>{money(e.amount)}</td>
                  {canEdit && <td onClick={(ev) => ev.stopPropagation()}><div style={{ display: 'flex', gap: 4 }}><button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => { setEditingExpense(e); setAddingExpense(false); }}><Pencil size={13} /></button><button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => setDeletingExpense(e)}><Trash2 size={13} style={{ color: 'var(--fm-red)' }} /></button></div></td>}
                </tr>)}
              </tbody></table></div>
            )}
          </div>

          <div>
            <h4 style={{ marginBottom: 8 }}>Alerts & events</h4>
            {trip.alerts.length === 0 ? <p style={{ color: 'var(--fm-muted)' }}>No alerts were raised during this trip.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{trip.alerts.map((a) => <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'var(--fm-background)', borderRadius: 6, fontSize: 13 }}><span>{displayAlertMessage(a.message)}</span><div style={{ display: 'flex', gap: 6, flexShrink: 0 }}><SeverityBadge severity={a.severity} /><span style={{ color: 'var(--fm-muted)' }}>{format(new Date(a.created_at), 'p')}</span></div></div>)}</div>}
          </div>

          {canComplete && <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--fm-border)', paddingTop: 14 }}><button type="button" className="fm-btn fm-btn-primary" onClick={handleComplete} disabled={submitting}>{submitting ? 'Completing…' : 'Mark trip as completed'}</button></div>}
        </div>
      )}

      <ConfirmModal open={!!deletingExpense} title="Remove expense?" message={deletingExpense ? `Remove the ${deletingExpense.category} expense of ${money(deletingExpense.amount)}?` : ''} confirmLabel="Remove" danger loading={submitting} onConfirm={handleDeleteExpense} onCancel={() => setDeletingExpense(null)} />
    </Modal>
  );
}
