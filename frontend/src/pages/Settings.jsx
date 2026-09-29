import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { vehicleApi } from '../api/endpoints';
import { SkeletonRows } from '../components/UI/Skeleton';

export default function Settings() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastsEnabled, setToastsEnabled] = useState(() => localStorage.getItem('fm_toast_on_alert') !== 'false');

  useEffect(() => { vehicleApi.list().then((v) => { setVehicles(v); setLoading(false); }); }, []);

  function toggleToasts(next) {
    setToastsEnabled(next);
    localStorage.setItem('fm_toast_on_alert', String(next));
  }

  return (
    <div>
      <h1>Settings</h1>
      <p style={{ color: 'var(--fm-muted)', marginBottom: 16 }}>Account, notifications, and per-vehicle thresholds.</p>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="fm-card fm-card-pad">
          <h3>Profile</h3>
          {user && (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 8, fontSize: 14 }}>
              <dt style={{ color: 'var(--fm-muted)' }}>Username</dt><dd style={{ margin: 0 }}>{user.username}</dd>
              <dt style={{ color: 'var(--fm-muted)' }}>Email</dt><dd style={{ margin: 0 }}>{user.email}</dd>
              <dt style={{ color: 'var(--fm-muted)' }}>Member since</dt>
              <dd style={{ margin: 0 }}>{user.created_at ? format(new Date(user.created_at), 'PP') : '—'}</dd>
            </dl>
          )}
        </div>

        <div className="fm-card fm-card-pad">
          <h3>Notification preferences</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={toastsEnabled} onChange={(e) => toggleToasts(e.target.checked)} />
            Show a pop-up notification when a new alert arrives
          </label>
          <p style={{ fontSize: 12, color: 'var(--fm-muted)', marginTop: 8 }}>
            The notification bell and active-alert count always update in real time regardless of this setting.
          </p>
        </div>
      </div>

      <div className="fm-card fm-card-pad">
        <h3>Devices &amp; Thresholds</h3>
        <p style={{ color: 'var(--fm-muted)' }}>Overspeed and idle thresholds are enforced by the backend telemetry pipeline. Edit them from the Vehicles page.</p>
        {loading ? <SkeletonRows rows={3} height={40} /> : (
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead><tr><th>Vehicle</th><th>Device ID</th><th>Status</th><th>Overspeed Threshold</th><th>Idle Threshold</th><th></th></tr></thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name} ({v.license_plate})</td>
                    <td className="mono">{v.device_id || 'Not configured'}</td>
                    <td>{v.current_status}</td>
                    <td>{v.overspeed_threshold_kmh} km/h</td>
                    <td>{v.idle_threshold_minutes} min</td>
                    <td><Link to="/vehicles">Edit</Link></td>
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
