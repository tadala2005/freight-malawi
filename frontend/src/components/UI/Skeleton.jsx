export function Skeleton({ width = '100%', height = 14, radius, style, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius ?? 'var(--fm-radius-sm)', ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ rows = 3, height = 14, gap = 8 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} width={i === rows - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fm-muted)' }} role="status" aria-live="polite">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function LoadingOverlay({ label = 'Loading…' }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit', zIndex: 5,
    }}
    >
      <Spinner label={label} />
    </div>
  );
}
