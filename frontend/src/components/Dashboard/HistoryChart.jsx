import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import EmptyState from '../UI/EmptyState.jsx';
import { Activity } from 'lucide-react';

export default function HistoryChart({ telemetry }) {
  if (!telemetry || telemetry.length === 0) {
    return <EmptyState icon={Activity} title="No telemetry in range" description="Choose a different date range or run the simulator." />;
  }

  const data = telemetry.map((t) => ({
    time: format(new Date(t.recorded_at), 'HH:mm'),
    fuelPercent: Number(t.fuel_percent),
    fuelLitres: Number(t.fuel_level_litres),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--fm-border)" strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={{ fontSize: 12, fill: 'var(--fm-muted)' }} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--fm-muted)' }} unit="%" domain={[0, 100]} />
        <Tooltip
          formatter={(value, name) => [name === 'fuelPercent' ? `${value}%` : `${value} L`, name === 'fuelPercent' ? 'Fuel %' : 'Fuel level']}
        />
        <Line type="monotone" dataKey="fuelPercent" stroke="#12877F" strokeWidth={2} dot={false} name="fuelPercent" />
      </LineChart>
    </ResponsiveContainer>
  );
}
