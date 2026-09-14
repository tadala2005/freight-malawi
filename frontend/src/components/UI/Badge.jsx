import React from 'react';

export default function Badge({ children, tone = 'muted' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
