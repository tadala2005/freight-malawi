import React, { useEffect, useState } from 'react';
import { Plus, Truck, Trash2 } from 'lucide-react';
import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Modal from '../components/UI/Modal.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import EmptyState from '../components/UI/EmptyState.jsx';
import { VehicleAPI } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';

const EMPTY_FORM = { name: '', licensePlate: '', driverName: '', fuelTankCapacity: '', deviceId: '' };

export default function Vehicles() {
  const { showToast } = useToast();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function loadVehicles() {
    const { data } = await VehicleAPI.list();
    setVehicles(data.vehicles);
  }

  useEffect(() => {
    loadVehicles().finally(() => setLoading(false));
  }, []);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');

    if (!form.name || !form.licensePlate || !form.driverName || !form.fuelTankCapacity || !form.deviceId) {
      setFormError('All fields are required');
      return;
    }
    if (Number(form.fuelTankCapacity) <= 0) {
      setFormError('Fuel tank capacity must be a positive number');
      return;
    }

    setSaving(true);
    try {
      await VehicleAPI.create({ ...form, fuelTankCapacity: Number(form.fuelTankCapacity) });
      showToast('Vehicle added', 'success');
      setAddOpen(false);
      setForm(EMPTY_FORM);
      await loadVehicles();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not add vehicle');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await VehicleAPI.remove(deleteTarget.id);
      showToast('Vehicle deleted', 'success');
      setDeleteTarget(null);
      await loadVehicles();
    } catch (err) {
      showToast('Could not delete vehicle', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell title="Vehicles">
      <Card
        title="Fleet Vehicles"
        subtitle="Vehicles registered to your account"
        action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus size={16} /> Add Vehicle</Button>}
      >
        {loading ? (
          <Skeleton height={160} />
        ) : vehicles.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No vehicles yet"
            description="Add your first truck to start monitoring fuel and location."
            actionLabel="Add Vehicle"
            onAction={() => setAddOpen(true)}
          />
        ) : (
          <table className="fm-table">
            <thead>
              <tr>
                <th>Name</th><th>Plate</th><th>Driver</th><th>Tank Capacity</th><th>Device ID</th><th></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.license_plate}</td>
                  <td>{v.driver_name}</td>
                  <td className="mono">{v.fuel_tank_capacity} L</td>
                  <td className="mono">{v.device_id}</td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(v)} aria-label={`Delete ${v.name}`}>
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={addOpen}
        title="Add Vehicle"
        onClose={() => { setAddOpen(false); setFormError(''); }}
        onConfirm={handleAdd}
        confirmLabel="Add Vehicle"
        confirmLoading={saving}
      >
        <form onSubmit={handleAdd} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="v-name">Vehicle name</label>
            <input id="v-name" className="form-input" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Truck 01" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="v-plate">License plate</label>
            <input id="v-plate" className="form-input" value={form.licensePlate} onChange={(e) => updateField('licensePlate', e.target.value)} placeholder="NA 1234" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="v-driver">Driver name</label>
            <input id="v-driver" className="form-input" value={form.driverName} onChange={(e) => updateField('driverName', e.target.value)} placeholder="John Banda" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="v-capacity">Fuel tank capacity (L)</label>
            <input id="v-capacity" type="number" min="1" className="form-input" value={form.fuelTankCapacity} onChange={(e) => updateField('fuelTankCapacity', e.target.value)} placeholder="400" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="v-device">Device ID</label>
            <input id="v-device" className="form-input" value={form.deviceId} onChange={(e) => updateField('deviceId', e.target.value)} placeholder="ESP32-001" />
            <span className="form-hint">Must match the ID used by the ESP32 device or the simulator config.</span>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete vehicle"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmLoading={deleting}
      >
        <p>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will also remove its telemetry and alert history.</p>
      </Modal>
    </AppShell>
  );
}
