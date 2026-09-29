import { Fuel, User, ShieldAlert, Package, Route, ClipboardList, Cpu, CheckCircle2 } from 'lucide-react';
import { SeverityBadge } from '../UI/Badge';

const CATEGORY_ICON = {
  FUEL: Fuel,
  DRIVER: User,
  SAFETY: ShieldAlert,
  LOAD: Package,
  ROUTE: Route,
  TRIP: ClipboardList,
  SYSTEM: Cpu,
};


function humanMessage(message) {
  if (typeof message === 'string') return message;
  if (message == null) return 'Alert details unavailable.';
  if (typeof message === 'object') {
    if (typeof message.message === 'string') return message.message;
    return 'Alert details available in incident details.';
  }
  return String(message);
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AlertCard({ alert, onAcknowledge, onOpenVehicle, acknowledging }) {
  const Icon = CATEGORY_ICON[alert.category] || Cpu;
  return (
    <div className="fm-card fm-card-pad" style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: 'var(--fm-navy-tint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
      >
        <Icon size={18} style={{ color: 'var(--fm-navy)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <strong
            style={{ cursor: onOpenVehicle ? 'pointer' : 'default' }}
            onClick={() => onOpenVehicle && onOpenVehicle(alert.vehicle_id)}
          >
            {alert.vehicle_name} ({alert.license_plate})
          </strong>
          <SeverityBadge severity={alert.severity} />
          <span className="fm-badge fm-badge-muted">{alert.category}</span>
          {alert.acknowledged ? <span className="fm-badge fm-badge-teal">Acknowledged</span> : null}
        </div>
        <p style={{ margin: '0 0 4px', color: 'var(--fm-ink)' }}>{humanMessage(alert.message)}</p>
        <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>
          {alert.driver_name ? `${alert.driver_name} · ` : ''}{timeAgo(alert.created_at)}
        </div>
      </div>
      {!alert.acknowledged && onAcknowledge && (
        <button
          type="button"
          className="fm-btn fm-btn-ghost fm-btn-sm"
          onClick={() => onAcknowledge(alert.id)}
          disabled={acknowledging}
          style={{ alignSelf: 'flex-start', flexShrink: 0 }}
        >
          <CheckCircle2 size={14} /> Acknowledge
        </button>
      )}
    </div>
  );
}
