import { useState } from 'react';
import { Power } from 'lucide-react';
import { vehicleApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../api/axios';

export default function IgnitionSwitch({ vehicle, compact = false, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = Boolean(vehicle?.latest_telemetry?.ignition_on);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setBusy(true);
    try {
      await vehicleApi.setIgnition(vehicle.id, next);
      toast.success(next ? `${vehicle.name}: ignition ON command sent. Waiting for device telemetry.` : `${vehicle.name}: ignition OFF command sent. Waiting for device telemetry.`);
      onChanged?.(next);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!vehicle?.device_id) {
    return <span className="fm-badge fm-badge-muted">No device</span>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 9 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        disabled={busy}
        aria-pressed={on}
        title={on ? 'Turn ignition off' : 'Turn ignition on'}
        style={{
          width: compact ? 48 : 58,
          height: compact ? 26 : 30,
          borderRadius: 999,
          border: '1px solid var(--fm-border)',
          background: on ? 'var(--fm-teal)' : 'var(--fm-muted)',
          padding: 3,
          cursor: busy ? 'wait' : 'pointer',
          position: 'relative',
          transition: 'background .2s ease',
        }}
      >
        <span style={{ display: 'block', width: compact ? 18 : 22, height: compact ? 18 : 22, borderRadius: '50%', background: 'white', transform: `translateX(${on ? (compact ? 20 : 25) : 0}px)`, transition: 'transform .2s ease', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
      </button>
      {!compact && <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}><Power size={13} /> {on ? 'IGNITION ON' : 'IGNITION OFF'}</span>}
    </div>
  );
}
