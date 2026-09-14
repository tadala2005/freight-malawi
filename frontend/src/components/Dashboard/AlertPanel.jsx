import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Fuel,
  ShieldAlert,
  Check,
  Gauge,
  Truck,
} from 'lucide-react';
import EmptyState from '../UI/EmptyState.jsx';
import Button from '../UI/Button.jsx';
import Badge from '../UI/Badge.jsx';

const TYPE_CONFIG = {
  THEFT_SUSPECTED: {
    label: 'Suspected fuel theft',
    icon: ShieldAlert,
    category: 'Fuel Security',
    tone: 'red',
  },

  ABNORMAL_CONSUMPTION: {
    label: 'Abnormal consumption',
    icon: Fuel,
    category: 'Fuel Management',
    tone: 'warning',
  },

  REFUEL: {
    label: 'Refuelling',
    icon: Fuel,
    category: 'Fuel Management',
    tone: 'teal',
  },

  ENGINE_START: {
    label: 'Engine started',
    icon: Truck,
    category: 'Trip Operations',
    tone: 'navy',
  },

  OVERSPEEDING: {
    label: 'Overspeeding',
    icon: Gauge,
    category: 'Driver Safety',
    tone: 'red',
  },

  OVERWEIGHT: {
    label: 'Overweight load',
    icon: Truck,
    category: 'Load Compliance',
    tone: 'red',
  },

  ROUTE_COMPLETED: {
    label: 'Route completed',
    icon: Truck,
    category: 'Trip Operations',
    tone: 'teal',
  },

  POWER_LOSS: {
    label: 'Power loss',
    icon: AlertTriangle,
    category: 'Vehicle Health',
    tone: 'warning',
  },

  GEOFENCE_EXIT: {
    label: 'Geofence exit',
    icon: AlertTriangle,
    category: 'Vehicle Security',
    tone: 'warning',
  },
};

const FILTERS = [
  'ALL',
  'Fuel',
  'Safety',
  'Operations',
  'Vehicle',
];

function categoryForAlert(type) {
  const config = TYPE_CONFIG[type];

  if (!config) return 'Vehicle';

  if (config.category.startsWith('Fuel')) {
    return 'Fuel';
  }

  if (
    config.category === 'Driver Safety' ||
    config.category === 'Load Compliance'
  ) {
    return 'Safety';
  }

  if (config.category === 'Trip Operations') {
    return 'Operations';
  }

  return 'Vehicle';
}

export default function AlertPanel({
  alerts = [],
  onAcknowledge,
  acknowledgingId,
}) {
  const [filter, setFilter] = useState('ALL');

  const counts = useMemo(
    () => ({
      ALL: alerts.length,

      Fuel: alerts.filter(
        (alert) =>
          categoryForAlert(alert.alert_type) === 'Fuel'
      ).length,

      Safety: alerts.filter(
        (alert) =>
          categoryForAlert(alert.alert_type) === 'Safety'
      ).length,

      Operations: alerts.filter(
        (alert) =>
          categoryForAlert(alert.alert_type) ===
          'Operations'
      ).length,

      Vehicle: alerts.filter(
        (alert) =>
          categoryForAlert(alert.alert_type) === 'Vehicle'
      ).length,
    }),
    [alerts]
  );

  const filteredAlerts = useMemo(() => {
    if (filter === 'ALL') return alerts;

    return alerts.filter(
      (alert) =>
        categoryForAlert(alert.alert_type) === filter
    );
  }, [alerts, filter]);

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No alerts"
        description="Fleet alerts will appear here in real time."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 14,
        }}
      >
        {FILTERS.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={
              filter === item
                ? 'primary'
                : 'outline'
            }
            onClick={() => setFilter(item)}
          >
            {item === 'ALL' ? 'All' : item}
            {' '}
            <span style={{ opacity: 0.75 }}>
              {counts[item]}
            </span>
          </Button>
        ))}
      </div>

      {filteredAlerts.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No alerts in this category"
          description="Choose another category to see other fleet alerts."
        />
      ) : (
        filteredAlerts.map((alert) => {
          const config =
            TYPE_CONFIG[alert.alert_type] || {
              label: alert.alert_type,
              icon: AlertTriangle,
              category: 'Vehicle',
              tone: 'muted',
            };

          const Icon = config.icon;

          const severityClass = `severity-${(
            alert.severity || 'low'
          ).toLowerCase()}`;

          return (
            <div
              key={alert.id}
              className={`alert-item ${severityClass}`}
            >
              <div className="alert-item-top">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Icon size={16} aria-hidden="true" />

                  <div>
                    <div className="alert-item-title">
                      {config.label}
                    </div>

                    <div style={{ marginTop: 3 }}>
                      <Badge tone={config.tone}>
                        {config.category}
                      </Badge>
                    </div>
                  </div>
                </div>

                {!alert.acknowledged &&
                  onAcknowledge && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={
                        acknowledgingId === alert.id
                      }
                      onClick={() =>
                        onAcknowledge(alert.id)
                      }
                    >
                      <Check size={14} />
                      Acknowledge
                    </Button>
                  )}

                {alert.acknowledged && (
                  <span className="badge badge-muted">
                    Acknowledged
                  </span>
                )}
              </div>

              <div className="alert-item-message">
                {alert.message}
              </div>

              <div className="alert-item-meta">
                <span>
                  {alert.vehicle_name || 'Vehicle'}
                  {' · '}
                  {alert.license_plate || '—'}
                </span>

                <span className="mono">
                  {new Date(
                    alert.created_at ||
                      alert.createdAt
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}