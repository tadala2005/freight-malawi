import { useEffect, useState } from 'react';

const EMPTY_FORM = {
  name: '', license_plate: '', driver_name: '', fuel_tank_capacity: 400,
  payload_capacity_kg: 12000, overspeed_threshold_kmh: 80,
  device_id: '', device_key: '',
};

export default function VehicleForm({ initialValue, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (initialValue) {
      setForm({
        name: initialValue.name || '',
        license_plate: initialValue.license_plate || '',
        driver_name: initialValue.driver_name || '',
        fuel_tank_capacity: initialValue.fuel_tank_capacity || 400,
        payload_capacity_kg: initialValue.payload_capacity_kg || 12000,
        overspeed_threshold_kmh: initialValue.overspeed_threshold_kmh || 80,
        device_id: initialValue.device_id || '',
        device_key: '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue?.id]);

  function set(field, value) { setForm((prev) => ({ ...prev, [field]: value })); }

  function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = [];
    if (!form.name.trim()) nextErrors.push('Vehicle name is required.');
    if (!form.license_plate.trim()) nextErrors.push('License plate is required.');
    setErrors(nextErrors);
    if (nextErrors.length) return;

    const payload = { ...form };
    if (!payload.device_id) delete payload.device_id;
    if (!payload.device_key) delete payload.device_key;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors.length > 0 && <div className="fm-badge fm-badge-red" style={{ display: 'block', marginBottom: 12, padding: 10 }}>{errors.join(' ')}</div>}
      <div style={{ padding: 10, marginBottom: 16, background: 'var(--fm-background)', borderRadius: 8, fontSize: 13, color: 'var(--fm-muted)' }}>
        Routes are planned per trip in the Trip Logbook. Vehicle setup is only for the truck, driver and device.
      </div>
      <div className="fm-form-grid">
        <div className="fm-field"><label htmlFor="vf-name">Vehicle name</label><input id="vf-name" className="fm-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Truck 01" /></div>
        <div className="fm-field"><label htmlFor="vf-plate">License plate</label><input id="vf-plate" className="fm-input" value={form.license_plate} onChange={(e) => set('license_plate', e.target.value)} placeholder="e.g. NA 1001" /></div>
        <div className="fm-field"><label htmlFor="vf-driver">Driver name</label><input id="vf-driver" className="fm-input" value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} placeholder="e.g. John Banda" /></div>
        <div className="fm-field"><label htmlFor="vf-tank">Fuel tank capacity (L)</label><input id="vf-tank" type="number" min="1" className="fm-input" value={form.fuel_tank_capacity} onChange={(e) => set('fuel_tank_capacity', Number(e.target.value))} /></div>
        <div className="fm-field"><label htmlFor="vf-payload">Payload capacity (kg)</label><input id="vf-payload" type="number" min="1" className="fm-input" value={form.payload_capacity_kg} onChange={(e) => set('payload_capacity_kg', Number(e.target.value))} /></div>
        <div className="fm-field"><label htmlFor="vf-overspeed">Overspeed threshold (km/h)</label><input id="vf-overspeed" type="number" min="20" max="180" className="fm-input" value={form.overspeed_threshold_kmh} onChange={(e) => set('overspeed_threshold_kmh', Number(e.target.value))} /></div>
        <div className="fm-field"><label htmlFor="vf-device">Device ID</label><input id="vf-device" className="fm-input" value={form.device_id} onChange={(e) => set('device_id', e.target.value)} placeholder="e.g. ESP32-001" /></div>
        <div className="fm-field"><label htmlFor="vf-devicekey">Device key {initialValue && <span style={{ textTransform: 'none', fontWeight: 400 }}>(leave blank to keep current)</span>}</label><input id="vf-devicekey" type="text" className="fm-input" value={form.device_key} onChange={(e) => set('device_key', e.target.value)} placeholder="Shared secret for this device" /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
        <button type="button" className="fm-btn fm-btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button type="submit" className="fm-btn fm-btn-primary" disabled={submitting}>{submitting ? 'Saving…' : initialValue ? 'Save changes' : 'Add vehicle'}</button>
      </div>
    </form>
  );
}
