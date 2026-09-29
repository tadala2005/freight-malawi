// ============================================================================
// Freight Malawi brand mark: a route line (fleet movement), a location pin
// (destination/trip), and a signal arc (IoT telemetry) — no bitmap assets.
// ============================================================================

export function LogoIcon({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Freight Malawi">
      <rect width="64" height="64" rx="14" fill="var(--fm-navy)" />
      <path d="M14 40 C 22 40, 24 24, 32 24 S 42 40, 50 40" stroke="var(--fm-teal)" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="20" r="6" fill="var(--fm-red)" />
      <path d="M32 26 L32 34" stroke="var(--fm-red)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function LogoFull({ height = 28, className = '' }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoIcon size={height + 4} />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontWeight: 700, fontSize: height * 0.62, color: 'var(--fm-white)' }}>Freight Malawi</div>
        <div style={{ fontSize: height * 0.32, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>FLEET &amp; FUEL INTELLIGENCE</div>
      </div>
    </div>
  );
}

export function LogoReversed({ height = 28, className = '' }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoIcon size={height + 4} />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontWeight: 700, fontSize: height * 0.62, color: 'var(--fm-navy)' }}>Freight Malawi</div>
        <div style={{ fontSize: height * 0.32, color: 'var(--fm-muted)', letterSpacing: '0.04em' }}>FLEET &amp; FUEL INTELLIGENCE</div>
      </div>
    </div>
  );
}

export function LogoSingleColor({ size = 32, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Freight Malawi">
      <rect width="64" height="64" rx="14" fill="none" stroke={color} strokeWidth="3" />
      <path d="M14 40 C 22 40, 24 24, 32 24 S 42 40, 50 40" stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="20" r="6" fill={color} />
      <path d="M32 26 L32 34" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
