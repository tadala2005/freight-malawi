import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { useNavigate } from 'react-router-dom';

import {
  Truck,
  Route as RouteIcon,
  Fuel,
  Gauge,
  Bell
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { vehicleApi, reportApi, alertApi } from '../api/endpoints';
import api from '../api/axios';

import KPICard from '../components/Dashboard/KPICard';
import LiveMap from '../components/Dashboard/LiveMap';
import IgnitionSwitch from '../components/Dashboard/IgnitionSwitch';
import AlertCard from '../components/Alerts/AlertCard';
import { VehicleStatusBadge } from '../components/UI/Badge';

const HW = 'ESP32-HW-001';

const number = value =>
  value == null || value === '' ? NaN : Number(value);

const time = value =>
  Date.parse(value || '') || 0;

function recent(value, now, limit) {
  const age = now - time(value);

  return (
    time(value) > 0 &&
    age >= -3000 &&
    age <= limit
  );
}

export default function Dashboard() {
  const { getSocket, connectionStatus } = useAuth();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState('');
  const [sensor, setSensor] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const request = useRef(0);
  const revisions = useRef(new Map());
  const revision = useRef(0);

  const touch = id => {
    revisions.current.set(
      String(id),
      ++revision.current
    );
  };

  const mergeSensor = useCallback(incoming => {
    if (!incoming) return;

    setSensor(previous =>
      time(previous?.observed_at) > time(incoming.observed_at)
        ? previous
        : incoming
    );
  }, []);

  const load = useCallback(async () => {
    const id = ++request.current;
    const started = revision.current;

    try {
      const params = selected
        ? { vehicleId: selected }
        : {};

      const [list, stats, alerts] = await Promise.all([
        vehicleApi.list(),
        reportApi.fleet(params),
        alertApi.list({
          ...params,
          scope: 'active',
          acknowledged: false,
          limit: 30
        })
      ]);

      if (id !== request.current) return;

      setVehicles(previous => {
        const existing = new Map(
          previous.map(v => [String(v.id), v])
        );

        return list.map(v => {
          const old = existing.get(String(v.id));

          return (
            old &&
            (revisions.current.get(String(v.id)) || 0) >
              started
          )
            ? { ...v, ...old }
            : v;
        });
      });

      setSummary(stats);
      setIncidents(alerts);
      setError('');
    } catch {
      if (id === request.current) {
        setError(
          'Could not refresh the dashboard. Please retry.'
        );
      }
    } finally {
      if (id === request.current) {
        setLoading(false);
      }
    }
  }, [selected]);

  useEffect(() => {
    setSummary(null);
    load();

    const timer = setInterval(load, 15000);

    return () => {
      clearInterval(timer);
      request.current++;
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(
      () => setClock(Date.now()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  const hardwareId =
    vehicles.find(v => v.device_id === HW)?.id;

  useEffect(() => {
    if (!hardwareId) {
      setSensor(null);
      return;
    }

    let active = true;
    let busy = false;

    async function poll() {
      if (busy) return;
      busy = true;

      try {
        const response = await api.get(
          `/devices/${hardwareId}/fuel`
        );

        if (active) {
          mergeSensor(response.data.data);
        }
      } catch {
        // Existing measurements expire according to their age.
      } finally {
        busy = false;
      }
    }

    poll();

    const timer = setInterval(poll, 2500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hardwareId, mergeSensor]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const update = vehicle => {
      if (!vehicle?.id) return;

      touch(vehicle.id);

      setVehicles(list =>
        list.map(old =>
          String(old.id) === String(vehicle.id)
            ? { ...old, ...vehicle }
            : old
        )
      );
    };

    const telemetry = ({ vehicle_id, reading }) => {
      touch(vehicle_id);

      setVehicles(list =>
        list.map(vehicle => {
          if (
            String(vehicle.id) !== String(vehicle_id) ||
            time(vehicle.latest_telemetry?.recorded_at) >
              time(reading.recorded_at)
          ) {
            return vehicle;
          }

          return {
            ...vehicle,
            latest_telemetry: reading,
            last_seen_at: reading.recorded_at,
            current_status: reading.ignition_on
              ? (reading.speed > 3 ? 'MOVING' : 'IDLE')
              : 'STOPPED'
          };
        })
      );
    };

    const trip = value => {
      touch(value.vehicle_id);

      setVehicles(list =>
        list.map(vehicle =>
          String(vehicle.id) === String(value.vehicle_id)
            ? {
                ...vehicle,
                active_trip:
                  ['COMPLETED', 'CANCELLED'].includes(
                    value.status
                  )
                    ? null
                    : value
              }
            : vehicle
        )
      );

      load();
    };

    const status = value => {
      touch(value.vehicle_id);

      setVehicles(list =>
        list.map(vehicle =>
          String(vehicle.id) === String(value.vehicle_id)
            ? {
                ...vehicle,
                current_status: value.status
              }
            : vehicle
        )
      );
    };

    const incomingAlert = value => {
      if (
        selected &&
        String(value.vehicle_id) !== selected
      ) {
        return;
      }

      setIncidents(list =>
        list.some(alert =>
          String(alert.id) === String(value.id)
        )
          ? list
          : [value, ...list].slice(0, 30)
      );

      load();
    };

    const hardware = value => {
      if (value?.device_id === HW) {
        mergeSensor(value);
      }
    };

    const events = [
      ['vehicle:update', update],
      ['telemetry:update', telemetry],
      ['device:status', status],
      ['trip:started', trip],
      ['trip:updated', trip],
      ['trip:completed', trip],
      ['hardware:fuel', hardware],
      ['alert:new', incomingAlert],
      ['alert:updated', load],
      ['connect', load]
    ];

    events.forEach(([name, handler]) => {
      socket.on(name, handler);
    });

    return () => {
      events.forEach(([name, handler]) => {
        socket.off(name, handler);
      });
    };
  }, [
    getSocket,
    connectionStatus,
    selected,
    load,
    mergeSensor
  ]);

  const sensorLive =
    sensor?.fresh === true &&
    Number.isFinite(number(sensor.fuel_percent)) &&
    number(sensor.fuel_percent) >= 0 &&
    number(sensor.fuel_percent) <= 100 &&
    recent(sensor.observed_at, clock, 10000);

  const visible = useMemo(() =>
    vehicles
      .filter(vehicle =>
        !selected ||
        String(vehicle.id) === selected
      )
      .map(vehicle => {
        const live =
          recent(vehicle.last_seen_at, clock, 60000) &&
          vehicle.current_status !== 'OFFLINE';

        const capacity =
          number(vehicle.fuel_tank_capacity);

        const isHardware =
          vehicle.device_id === HW;

        const fuel = isHardware
          ? (
              sensorLive &&
              String(sensor.vehicle_id) === String(vehicle.id)
                ? number(sensor.fuel_percent) * capacity / 100
                : NaN
            )
          : (
              live
                ? number(
                    vehicle.latest_telemetry?.fuel_level_litres
                  )
                : NaN
            );

        const validFuel =
          Number.isFinite(fuel) &&
          capacity > 0 &&
          fuel >= 0 &&
          fuel <= capacity;

        return {
          ...vehicle,

          current_status: live
            ? vehicle.current_status
            : 'OFFLINE',

          live,

          displayFuel: validFuel
            ? fuel
            : null,

          latest_telemetry:
            vehicle.latest_telemetry && isHardware
              ? {
                  ...vehicle.latest_telemetry,
                  fuel_level_litres: validFuel ? fuel : null,
                  fuel_percent: validFuel
                    ? fuel * 100 / capacity
                    : null
                }
              : vehicle.latest_telemetry
        };
      }),
    [
      vehicles,
      selected,
      clock,
      sensor,
      sensorLive
    ]
  );

  const reporting =
    visible.filter(vehicle => vehicle.live);

  const fuelVehicles =
    visible.filter(vehicle => vehicle.displayFuel !== null);

  const fuelTotal = fuelVehicles.reduce(
    (sum, vehicle) => sum + vehicle.displayFuel,
    0
  );

  const moving = reporting.filter(
    vehicle => number(vehicle.latest_telemetry?.speed) > 2
  );

  const speed = moving.length
    ? moving.reduce(
        (sum, vehicle) =>
          sum + number(vehicle.latest_telemetry.speed),
        0
      ) / moving.length
    : 0;

  const hardwareVisible =
    visible.some(vehicle => vehicle.device_id === HW);

  const hardwareVehicle =
    vehicles.find(vehicle => vehicle.device_id === HW);

  async function acknowledge(id) {
    try {
      await alertApi.acknowledge(id);

      setIncidents(list =>
        list.filter(alert =>
          String(alert.id) !== String(id)
        )
      );

      load();
    } catch {
      setError('Could not acknowledge the alert.');
    }
  }

  if (loading) {
    return <p role="status">Loading dashboard…</p>;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18
      }}
    >
      <div className="fm-page-head">
        <h1 style={{ margin: 0 }}>
          Fleet Dashboard
        </h1>

        <select
          aria-label="Filter by vehicle"
          value={selected}
          onChange={event => setSelected(event.target.value)}
          className="fm-select"
          style={{
            width: 'auto',
            maxWidth: '100%'
          }}
        >
          <option value="">All vehicles</option>

          {vehicles.map(vehicle => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name} · {vehicle.license_plate}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="fm-card fm-card-pad" role="alert">
          {error}{' '}

          <button
            type="button"
            onClick={load}
            className="fm-btn fm-btn-secondary"
          >
            Retry
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <KPICard
          icon={Truck}
          label="Vehicles online"
          value={`${reporting.length}/${visible.length}`}
        />

        <KPICard
          icon={RouteIcon}
          label="Active trips"
          value={
            visible.filter(
              vehicle =>
                vehicle.active_trip?.status === 'ACTIVE'
            ).length
          }
          onClick={() => navigate('/logbook')}
        />

        <KPICard
          icon={Fuel}
          label="Tank fuel"
          value={
            fuelVehicles.length
              ? `${fuelTotal.toFixed(1)} L`
              : '—'
          }
          sub={[
            fuelVehicles.length < visible.length
              ? `${fuelVehicles.length}/${visible.length} reporting`
              : '',

            fuelVehicles.some(
              vehicle => vehicle.device_id === HW
            )
              ? 'Includes equivalent litres'
              : ''
          ].filter(Boolean).join(' · ')}
        />

        <KPICard
          icon={Gauge}
          label="Avg. moving speed"
          value={`${speed.toFixed(1)} km/h`}
        />

        <KPICard
          icon={Bell}
          label="Open alerts"
          value={summary?.open_alerts ?? '—'}
          onClick={() => navigate('/alerts')}
        />
      </div>

      {hardwareVisible && (
        <div className="fm-card fm-card-pad">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <h3 style={{ margin: 0 }}>
              Fuel sensor
            </h3>

            <span
              className={
                `fm-badge ${
                  sensorLive
                    ? 'fm-badge-teal'
                    : 'fm-badge-warning'
                }`
              }
              role="status"
            >
              {sensorLive ? 'Live' : 'Unavailable'}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 14,
              flexWrap: 'wrap',
              margin: '14px 0'
            }}
          >
            <strong
              className="mono"
              style={{ fontSize: 32 }}
            >
              {sensorLive
                ? `${Number(sensor.fuel_percent).toFixed(1)}%`
                : '—'}
            </strong>

            <span style={{ color: 'var(--fm-muted)' }}>
              {sensorLive
                ? `${
                    (
                      Number(sensor.fuel_percent) *
                      Number(hardwareVehicle.fuel_tank_capacity) /
                      100
                    ).toFixed(1)
                  } L equivalent`
                : 'No current reading'}
            </span>
          </div>

          <progress
            aria-label="Fuel level"
            max="100"
            value={
              sensorLive
                ? Number(sensor.fuel_percent)
                : 0
            }
            style={{
              width: '100%',
              height: 10,
              accentColor: 'var(--fm-teal)'
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 10,
              fontSize: 12,
              color: 'var(--fm-muted)'
            }}
          >
            <span>
              {hardwareVehicle?.license_plate}
            </span>

            {sensor?.observed_at && (
              <span>
                Updated{' '}
                {new Date(sensor.observed_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div
          className="fm-card fm-card-pad"
          style={{
            height: 460,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12
            }}
          >
            <h3 style={{ margin: 0 }}>
              Fleet map
            </h3>

            <span className="fm-badge fm-badge-muted">
              Simulated
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <LiveMap
              vehicles={visible}
              selectedVehicleId={
                selected ? Number(selected) : null
              }
              onSelectVehicle={
                id => setSelected(
                  id == null ? '' : String(id)
                )
              }
            />
          </div>
        </div>

        <div
          className="fm-card fm-card-pad"
          style={{
            height: 460,
            overflowY: 'auto'
          }}
        >
          <h3>Vehicles</h3>

          {visible.map(vehicle => (
            <div
              key={vehicle.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid var(--fm-border)'
              }}
            >
              <button
                type="button"
                className="fm-btn fm-btn-ghost"
                onClick={() =>
                  navigate(`/vehicles/${vehicle.id}`)
                }
              >
                {vehicle.name} · {vehicle.license_plate}
              </button>

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}
              >
                <VehicleStatusBadge
                  status={vehicle.current_status}
                />

                <IgnitionSwitch
                  vehicle={vehicle}
                  compact
                />

                <span
                  className="mono"
                  style={{ fontSize: 13 }}
                >
                  {vehicle.displayFuel === null
                    ? 'Fuel unavailable'
                    : `${vehicle.displayFuel.toFixed(1)} / ` +
                      `${Number(vehicle.fuel_tank_capacity).toFixed(0)} L` +
                      `${vehicle.device_id === HW ? ' eq.' : ''}`}
                </span>
              </div>

              {vehicle.active_trip && (
                <small
                  style={{
                    display: 'block',
                    marginTop: 6,
                    color: 'var(--fm-muted)'
                  }}
                >
                  Trip:{' '}
                  {vehicle.active_trip.status
                    .toLowerCase()
                    .replaceAll('_', ' ')}
                </small>
              )}
            </div>
          ))}

          {!visible.length && (
            <p>No vehicles available.</p>
          )}
        </div>
      </div>

      <div className="fm-card fm-card-pad">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12
          }}
        >
          <h3 style={{ margin: 0 }}>
            Active alerts
          </h3>

          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-sm"
            onClick={() => navigate('/alerts')}
          >
            View all
          </button>
        </div>

        {!incidents.length && (
          <p style={{ color: 'var(--fm-muted)' }}>
            No active alerts.
          </p>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          {incidents.slice(0, 10).map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={acknowledge}
              onOpenVehicle={
                id => navigate(`/vehicles/${id}`)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
