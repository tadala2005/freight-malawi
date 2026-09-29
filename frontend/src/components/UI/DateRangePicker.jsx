export default function DateRangePicker({ from, to, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="date"
        className="fm-input"
        style={{ width: 150 }}
        value={from || ''}
        onChange={(e) => onChange({ from: e.target.value, to })}
        aria-label="From date"
      />
      <span style={{ color: 'var(--fm-muted)' }}>to</span>
      <input
        type="date"
        className="fm-input"
        style={{ width: 150 }}
        value={to || ''}
        onChange={(e) => onChange({ from, to: e.target.value })}
        aria-label="To date"
      />
    </div>
  );
}
