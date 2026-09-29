export default function Card({ children, padded = true, className = '', style, ...rest }) {
  return (
    <div className={`fm-card ${padded ? 'fm-card-pad' : ''} ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ margin: '4px 0 0', color: 'var(--fm-muted)', fontSize: 'var(--fm-fs-sm)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
