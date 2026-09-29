import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, title, onClose, children, width }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="modal-panel"
        style={width ? { maxWidth: width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fm-muted)', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Reusable confirmation dialog — replaces window.confirm() everywhere in the app. */
export function ConfirmModal({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel, loading }) {
  return (
    <Modal open={open} title={title} onClose={onCancel} width="420px">
      <p style={{ color: 'var(--fm-muted)' }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button type="button" className="fm-btn fm-btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
        <button
          type="button"
          className={`fm-btn ${danger ? 'fm-btn-danger' : 'fm-btn-primary'}`}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
