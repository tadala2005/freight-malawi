import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 size={18} color="var(--fm-teal)" />,
  error: <XCircle size={18} color="var(--fm-red)" />,
  warning: <AlertTriangle size={18} color="var(--fm-warning)" />,
};

export default function Toast({ type = 'success', children, onClose }) {
  return (
    <div className={`toast ${type}`} role="status">
      {ICONS[type] || ICONS.success}
      <span style={{ flex: 1 }}>{children}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fm-muted)' }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
