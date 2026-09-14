import React, { useEffect, useRef } from 'react';
import Button from './Button.jsx';

export default function Modal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  confirmLoading = false,
}) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousActive = document.activeElement;

    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);

    requestAnimationFrame(() => {
      boxRef.current
        ?.querySelector('input, select, textarea, button')
        ?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKey);

      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={boxRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="modal-title"
          style={{
            fontSize: 'var(--fm-text-lg)',
            marginBottom: 12,
          }}
        >
          {title}
        </h2>

        <div>{children}</div>

        <div className="modal-actions">
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
          </Button>

          {onConfirm && (
            <Button
              variant={confirmVariant}
              type="button"
              onClick={onConfirm}
              loading={confirmLoading}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}