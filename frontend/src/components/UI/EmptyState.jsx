import React from 'react';
import { Inbox } from 'lucide-react';
import Button from './Button.jsx';

export default function EmptyState({
  icon: Icon = Inbox, title = 'Nothing here yet', description, actionLabel, onAction,
}) {
  return (
    <div className="empty-state">
      <Icon size={40} strokeWidth={1.5} />
      <div className="empty-state-title">{title}</div>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <div style={{ marginTop: 16 }}>
          <Button onClick={onAction} variant="primary" size="sm">{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
