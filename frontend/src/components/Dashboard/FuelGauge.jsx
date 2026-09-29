function colorForPercent(pct) {
  if (pct > 50) return 'var(--fm-teal)';
  if (pct >= 25) return 'var(--fm-warning)';
  return 'var(--fm-red)';
}

export default function FuelGauge({ litres, percent, capacity, size = 140 }) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = 52;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference * (1 - pct / 100);
  const color = colorForPercent(pct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size }}>
      <svg width={size} height={size * 0.62} viewBox="0 0 140 90">
        <path d="M 14 80 A 52 52 0 0 1 126 80" fill="none" stroke="var(--fm-border)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 14 80 A 52 52 0 0 1 126 80"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
        <text x="70" y="72" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--fm-ink)" className="mono">
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div style={{ textAlign: 'center', marginTop: -6 }}>
        <div className="mono" style={{ fontWeight: 600 }}>{Number(litres || 0).toFixed(0)} L</div>
        <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>of {Number(capacity || 0).toFixed(0)} L capacity</div>
      </div>
    </div>
  );
}
