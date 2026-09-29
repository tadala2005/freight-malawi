import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { vehicleApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../api/axios';
import Modal, { ConfirmModal } from '../components/UI/Modal';
import VehicleForm from '../components/Vehicles/VehicleForm';
import { VehicleStatusBadge } from '../components/UI/Badge';
import { SkeletonRows } from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const data = await vehicleApi.list();
    setVehicles(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(vehicle) {
    setEditing(vehicle);
    setFormOpen(true);
  }

  async function handleSubmit(payload) {
    setSubmitting(true);
    try {
      if (editing) {
        await vehicleApi.update(editing.id, payload);
        toast.success('Vehicle updated successfully.');
      } else {
        await vehicleApi.create(payload);
        toast.success('Vehicle created successfully.');
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await vehicleApi.remove(deleting.id);
      toast.success('Vehicle deleted.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>Vehicles</h1>
          <p style={{ color: 'var(--fm-muted)' }}>Manage your fleet, drivers and IoT device assignments.</p>
        </div>
        <button type="button" className="fm-btn fm-btn-primary" onClick={openCreate}>
          <Plus size={16} /> Add vehicle
        </button>
      </div>

      <div className="fm-card fm-card-pad">
        {loading ? (
          <SkeletonRows rows={4} height={56} />
        ) : vehicles.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No vehicles yet"
            description="Add your first truck to start tracking it."
            action={<button type="button" className="fm-btn fm-btn-primary" onClick={openCreate}>Add your first truck</button>}
          />
        ) : (
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Device</th>
                  <th>Fuel Capacity</th>
                  <th>Payload Capacity</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} onClick={() => navigate(`/vehicles/${v.id}`)}>
                    <td><strong>{v.name}</strong><br /><span style={{ color: 'var(--fm-muted)', fontSize: 12 }}>{v.license_plate}</span></td>
                    <td>{v.driver_name || '—'}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{v.device_id || 'Not assigned'}</td>
                    <td>{v.fuel_tank_capacity} L</td>
                    <td>{Number(v.payload_capacity_kg).toLocaleString()} kg</td>
                    <td><VehicleStatusBadge status={v.current_status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => openEdit(v)} aria-label={`Edit ${v.name}`}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => setDeleting(v)} aria-label={`Delete ${v.name}`}>
                          <Trash2 size={14} style={{ color: 'var(--fm-red)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={formOpen} title={editing ? 'Edit vehicle' : 'Add vehicle'} onClose={() => setFormOpen(false)} width="640px">
        <VehicleForm initialValue={editing} onSubmit={handleSubmit} onCancel={() => setFormOpen(false)} submitting={submitting} />
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title="Delete vehicle?"
        message={deleting ? `This will permanently remove ${deleting.name} (${deleting.license_plate}) and its historical data cannot be recovered.` : ''}
        confirmLabel="Delete vehicle"
        danger
        loading={submitting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
