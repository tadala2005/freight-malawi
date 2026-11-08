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
  const [search, setSearch] = useState('');
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
        // Failed requests do not create fresh measurements.
        // The displayed sample expires according to its age.
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

    const update = v => {
      if (!v?.id) return;

      touch(v.id);

      setVehicles(list =>
        list.map(old =>
          String(old.id) === String(v.id)
            ? { ...old, ...v }
            : old
        )
      );
    };

    const telemetry = ({ vehicle_id, reading }) => {
      touch(vehicle_id);

      setVehicles(list =>
        list.map(v => {
          if (
            String(v.id) !== String(vehicle_id) ||
            time(v.latest_telemetry?.recorded_at) >
              time(reading.recorded_at)
          ) {
            return v;
          }

          return {
            ...v,
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
        list.map(v =>
          String(v.id) === String(value.vehicle_id)
            ? {
                ...v,
                active_trip:
                  ['COMPLETED', 'CANCELLED'].includes(
                    value.status
                  )
                    ? null
                    : value
              }
            : v
        )
      );

      load();
    };

    const status = value => {
      touch(value.vehicle_id);

      setVehicles(list =>
        list.map(v =>
          String(v.id) === String(value.vehicle_id)
            ? {
                ...v,
                current_status: value.status
              }
            : v
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
        list.some(a => String(a.id) === String(value.id))
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

    events.forEach(([name, fn]) => socket.on(name, fn));

    return () => {
      events.forEach(([name, fn]) => socket.off(name, fn));
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
      .filter(v =>
        (!selected || String(v.id) === selected) &&
        `${v.name} ${v.license_plate} ${v.driver_name || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .map(v => {
        const live =
          recent(v.last_seen_at, clock, 60000) &&
          v.current_status !== 'OFFLINE';

        const capacity = number(v.fuel_tank_capacity);
        const isHardware = v.device_id === HW;

        const fuel = isHardware
          ? (
              sensorLive &&
              String(sensor.vehicle_id) === String(v.id)
                ? number(sensor.fuel_percent) * capacity / 100
                : NaN
            )
          : (
              live
                ? number(v.latest_telemetry?.fuel_level_litres)
                : NaN
            );

        const validFuel =
          Number.isFinite(fuel) &&
          capacity > 0 &&
          fuel >= 0 &&
          fuel <= capacity;

        return {
          ...v,
          current_status: live
            ? v.current_status
            : 'OFFLINE',

          live,
          displayFuel: validFuel ? fuel : null,

          latest_telemetry:
            v.latest_telemetry && isHardware
              ? {
                  ...v.latest_telemetry,
                  fuel_level_litres: validFuel ? fuel : null,
                  fuel_percent: validFuel
                    ? fuel * 100 / capacity
                    : null
                }
              : v.latest_telemetry
        };
      }),
    [
      vehicles,
      selected,
      search,
      clock,
      sensor,
      sensorLive
    ]
  );

  const reporting = visible.filter(v => v.live);

  const fuelVehicles =
    visible.filter(v => v.displayFuel !== null);

  const fuelTotal =
    fuelVehicles.reduce(
      (sum, v) => sum + v.displayFuel,
      0
    );

  const moving = reporting.filter(
    v => number(v.latest_telemetry?.speed) > 2
  );

  const speed = moving.length
    ? moving.reduce(
        (sum, v) =>
          sum + number(v.latest_telemetry.speed),
        0
      ) / moving.length
    : 0;

  const hardwareVisible =
    visible.some(v => v.device_id === HW);

  const hardwareVehicle =
    vehicles.find(v => v.device_id === HW);

  async function acknowledge(id) {
    try {
      await alertApi.acknowledge(id);

      setIncidents(list =>
        list.filter(a => String(a.id) !== String(id))
      );

      load();
    } catch {
      setError('Could not acknowledge the alert.');
    }
  }

  if (loading) {
    return <p>Loading fleet dashboard…</p>;
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
        <div>
          <h1>Fleet Dashboard</h1>
          <p>
            Demonstration fleet · simulated movement ·
            physical fuel input on ESP32-HW-001
          </p>
        </div>

        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="fm-select"
        >
          <option value="">All vehicles</option>

          {vehicles.map(v => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.license_plate}
            </option>
          ))}
        </select>
      </div>

      <input
        className="fm-input"
        aria-label="Search vehicles"
        placeholder="Search name, registration or driver"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {error && (
        <div className="fm-card fm-card-pad" role="alert">
          {error}
          {' '}
          <button
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
          label="Movement telemetry online"
          value={`${reporting.length}/${visible.length}`}
          sub={
            connectionStatus === 'live'
              ? 'Dashboard connected'
              : 'Dashboard reconnecting'
          }
        />

        <KPICard
          icon={RouteIcon}
          label="Active trips"
          value={
            visible.filter(
              v => v.active_trip?.status === 'ACTIVE'
            ).length
          }
          onClick={() => navigate('/logbook')}
        />

        <KPICard
          icon={Fuel}
          label="Available fuel readings"
          value={
            fuelVehicles.length
              ? `${fuelTotal.toFixed(1)} L`
              : '—'
          }
          sub={
            `${fuelVehicles.length}/${visible.length} valid ` +
            '· includes model-equivalent litres'
          }
        />

        <KPICard
          icon={Gauge}
          label="Moving average speed"
          value={`${speed.toFixed(1)} km/h`}
          sub="Simulated movement"
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
          <h3>Physical ultrasonic sensor</h3>

          <p
            style={{
              color: sensorLive
                ? 'var(--fm-teal)'
                : 'var(--fm-warning)'
            }}
          >
            {sensorLive
              ? 'SENSOR LIVE'
              : 'SENSOR INVALID / STALE'}
          </p>

          <strong style={{ fontSize: 32 }}>
            {sensorLive
              ? `${Number(sensor.fuel_percent).toFixed(1)}%`
              : '—'}
          </strong>

          <p>
            {sensorLive
              ? `${
                  (
                    Number(sensor.fuel_percent) *
                    Number(hardwareVehicle.fuel_tank_capacity) /
                    100
                  ).toFixed(1)
                } L equivalent`
              : 'Waiting for a valid physical measurement.'}
          </p>

          <progress
            max="100"
            value={
              sensorLive
                ? Number(sensor.fuel_percent)
                : 0
            }
            style={{ width: '100%' }}
          />

          <p>
            Bench-model level only. Movement is simulated;
            physical engine consumption is not measured.
          </p>

          <small>
            Last sensor update:{' '}
            {sensor?.observed_at
              ? new Date(sensor.observed_at).toLocaleTimeString()
              : 'none'}
          </small>
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
          <h3>Simulated fleet map</h3>

          <div style={{ flex: 1, minHeight: 0 }}>
            <LiveMap
              vehicles={visible}
              selectedVehicleId={
                selected ? Number(selected) : null
              }
              onSelectVehicle={
                id => setSelected(String(id))
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

          {visible.map(v => (
            <div
              key={v.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid var(--fm-border)'
              }}
            >
              <button
                className="fm-btn fm-btn-ghost"
                onClick={() => navigate(`/vehicles/${v.id}`)}
              >
                {v.name} · {v.license_plate}
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
                  status={v.current_status}
                />

                <IgnitionSwitch
                  vehicle={v}
                  compact
                />

                <span>
                  {v.displayFuel === null
                    ? 'Fuel unavailable'
                    : `${v.displayFuel.toFixed(1)} / ` +
                      `${Number(v.fuel_tank_capacity).toFixed(0)} L` +
                      `${v.device_id === HW ? ' equivalent' : ''}`}
                </span>
              </div>

              <small>
                Trip: {v.active_trip?.status || 'None'}
              </small>
            </div>
          ))}

          {!visible.length && (
            <p>No vehicles match this view.</p>
          )}
        </div>
      </div>

      <div className="fm-card fm-card-pad">
        <h3>Recent active alerts</h3>

        {!incidents.length && (
          <p>No active alerts for this vehicle selection.</p>
        )}

        {incidents.slice(0, 10).map(a => (
          <AlertCard
            key={a.id}
            alert={a}
            onAcknowledge={acknowledge}
            onOpenVehicle={
              id => navigate(`/vehicles/${id}`)
            }
          />
        ))}
      </div>
    </div>
  );
}
