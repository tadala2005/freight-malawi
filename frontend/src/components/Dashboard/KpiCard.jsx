import React from 'react';
import Card from '../UI/Card.jsx';

export default function KpiCard({ icon: Icon, label, value, sub, danger = false }) {
  return (
    <Card className="kpi-card">
      <div className="kpi-header">
        <span>{label}</span>
        {Icon && <Icon size={16} aria-hidden="true" />}
      </div>
      <div className={`kpi-value mono${danger ? ' danger' : ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </Card>
  );
}
