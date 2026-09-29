export default function DataTable({ columns, rows, onRowClick, rowKey = 'id', emptyMessage = 'No data.' }) {
  if (!rows || !rows.length) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fm-muted)' }}>{emptyMessage}</div>;
  }
  return (
    <div className="fm-table-wrap">
      <table className="fm-table">
        <thead>
          <tr>
            {columns.map((col) => <th key={col.key}>{col.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
