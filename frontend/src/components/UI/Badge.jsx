export function Badge({ tone = 'navy', children, className = '' }) {
  return <span className={`fm-badge fm-badge-${tone} ${className}`}>{children}</span>;
}

const VEHICLE_STATUS_TONE = {
  MOVING: 'teal',
  IDLE: 'warning',
  STOPPED: 'navy',
  OFFLINE: 'muted',
};

export function VehicleStatusBadge({ status }) {
  const tone = VEHICLE_STATUS_TONE[status] || 'muted';
  return <Badge tone={tone}>{status === 'OFFLINE' ? '● Offline' : status}</Badge>;
}

const SEVERITY_TONE = {
  LOW: 'muted',
  MEDIUM: 'warning',
  HIGH: 'red',
  CRITICAL: 'red',
};

export function SeverityBadge({ severity }) {
  return <Badge tone={SEVERITY_TONE[severity] || 'muted'}>{severity}</Badge>;
}

const TRIP_STATUS_TONE = {
  ACTIVE: 'teal',
  PENDING_DETAILS: 'warning',
  ROUTE_COMPLETED: 'warning',
  COMPLETED: 'navy',
  CANCELLED: 'muted',
};

export function TripStatusBadge({ status }) {
  return <Badge tone={TRIP_STATUS_TONE[status] || 'muted'}>{status.replace('_', ' ')}</Badge>;
}
