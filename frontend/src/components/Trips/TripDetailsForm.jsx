import { useEffect, useState } from 'react';
import { ROUTE_OPTIONS } from '../../constants/routes';

const EMPTY = {
  route_key: '', cargo_type: '', cargo_description: '', cargo_weight_kg: '',
  origin: '', destination: '', distance_km: '', transporter_income: '',
};

export default function TripDetailsForm({ trip, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState([]);
  const routeLocked = trip?.status !== 'PENDING_DETAILS';

  useEffect(() => {
    if (trip) {
      setForm({
        route_key: trip.route_key || '',
        cargo_type: trip.cargo_type || '',
        cargo_description: trip.cargo_description || '',
        cargo_weight_kg: trip.cargo_weight_kg ?? '',
        origin: trip.origin || '',
        destination: trip.destination || '',
        distance_km: trip.distance_km ?? '',
        transporter_income: trip.transporter_income ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleRouteChange(value) {
    const route = ROUTE_OPTIONS.find((r) => r.value === value);
    setForm((prev) => ({
      ...prev,
      route_key: value,
      origin: route?.origin || prev.origin,
      destination: route?.destination || prev.destination,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = [];
    if (!routeLocked && !form.route_key) nextErrors.push('Select a trip route.');
    if (form.distance_km !== '' && Number(form.distance_km) < 0) nextErrors.push('Distance cannot be negative.');
    if (form.transporter_income !== '' && Number(form.transporter_income) < 0) nextErrors.push('Income cannot be negative.');
    if (form.cargo_weight_kg !== '' && Number(form.cargo_weight_kg) < 0) nextErrors.push('Cargo weight cannot be negative.');
    setErrors(nextErrors);
    if (nextErrors.length) return;

    const payload = {
      cargo_type: form.cargo_type || null,
      cargo_description: form.cargo_description || null,
      cargo_weight_kg: form.cargo_weight_kg === '' ? null : Number(form.cargo_weight_kg),
      origin: form.origin || null,
      destination: form.destination || null,
      distance_km: form.distance_km === '' ? null : Number(form.distance_km),
      transporter_income: form.transporter_income === '' ? 0 : Number(form.transporter_income),
    };
    if (!routeLocked && form.route_key) payload.route_key = form.route_key;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors.length > 0 && <div className="fm-badge fm-badge-red" style={{ display: 'block', marginBottom: 12, padding: 10 }}>{errors.join(' ')}</div>}
      <div className="fm-form-grid">
        <div className="fm-field">
          <label htmlFor="td-route">Trip route</label>
          <select id="td-route" className="fm-select" value={form.route_key} disabled={routeLocked} onChange={(e) => handleRouteChange(e.target.value)}>
            <option value="">Select route…</option>
            {ROUTE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {routeLocked && <span style={{ fontSize: 11, color: 'var(--fm-muted)' }}>Route is locked after ignition starts.</span>}
        </div>
        <div className="fm-field"><label htmlFor="td-cargotype">Cargo category</label><input id="td-cargotype" className="fm-input" value={form.cargo_type} onChange={(e) => set('cargo_type', e.target.value)} placeholder="e.g. Maize, Cement, General goods" /></div>
        <div className="fm-field"><label htmlFor="td-cargoweight">Cargo weight (kg)</label><input id="td-cargoweight" type="number" min="0" className="fm-input" value={form.cargo_weight_kg} onChange={(e) => set('cargo_weight_kg', e.target.value)} /></div>
        <div className="fm-field"><label htmlFor="td-income">Transporter income (MWK)</label><input id="td-income" type="number" min="0" className="fm-input" value={form.transporter_income} onChange={(e) => set('transporter_income', e.target.value)} /></div>
        <div className="fm-field"><label htmlFor="td-origin">Origin</label><input id="td-origin" className="fm-input" value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="e.g. Lilongwe" /></div>
        <div className="fm-field"><label htmlFor="td-destination">Destination</label><input id="td-destination" className="fm-input" value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="e.g. Blantyre" /></div>
        <div className="fm-field"><label htmlFor="td-distance">Manual distance (optional)</label><input id="td-distance" type="number" min="0" className="fm-input" value={form.distance_km} onChange={(e) => set('distance_km', e.target.value)} placeholder="Leave blank to use GPS/odometer distance" /></div>
      </div>
      <div className="fm-field"><label htmlFor="td-desc">Trip / cargo notes</label><textarea id="td-desc" className="fm-input" rows={3} value={form.cargo_description} onChange={(e) => set('cargo_description', e.target.value)} placeholder="Optional notes" /></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="fm-btn fm-btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button type="submit" className="fm-btn fm-btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save trip details'}</button>
      </div>
    </form>
  );
}
