export default function KPICard({ icon: Icon, label, value, sub, tone = 'navy', onClick }) {
  return (
    <div
      className="fm-card fm-card-pad"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fm-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
        {Icon && <Icon size={16} style={{ color: `var(--fm-${tone})` }} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--fm-navy)' }} className={typeof value === 'string' && value.match(/^[0-9.,\-]+$/) ? 'mono' : ''}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{sub}</div>}
    </div>
  );
}
