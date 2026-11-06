
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Route as RouteIcon,
  Fuel,
  Gauge,
  Bell,
  AlertTriangle
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { vehicleApi, reportApi, alertApi } from '../api/endpoints';
import api from '../api/axios';

import KPICard from '../components/Dashboard/KPICard';
import LiveMap from '../components/Dashboard/LiveMap';
import { VehicleStatusBadge } from '../components/UI/Badge';
import { SkeletonRows } from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';
import AlertCard from '../components/Alerts/AlertCard';
import IgnitionSwitch from '../components/Dashboard/IgnitionSwitch';

// ===================================================
// FREIGHT MALAWI — LIVE HARDWARE FUEL DASHBOARD
// ===================================================

const HARDWARE_DEVICE_ID = 'ESP32-HW-001';
const SENSOR_FRESH_MS = 20000;

const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function isReporting(vehicle) {
  if (vehicle.current_status === 'OFFLINE') {
    return false;
  }

  if (!vehicle.last_seen_at) {
    return true;
  }

  const lastSeen = new Date(vehicle.last_seen_at).getTime();

  return (
    !Number.isFinite(lastSeen) ||
    Date.now() - lastSeen < 90000
  );
}

export default function Dashboard() {
  const { getSocket } = useAuth();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [vehicleFilterId, setVehicleFilterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [clock, setClock] = useState(Date.now());
  const [hardwareFuel, setHardwareFuel] = useState(null);

  // ===================================================
  // 1. LOAD DASHBOARD DATA
  // ===================================================

  const loadAll = useCallback(async () => {
    try {
      const params = vehicleFilterId
        ? { vehicleId: vehicleFilterId }
        : undefined;

      const [
        vehicleList,
        fleetSummary,
        alerts
      ] = await Promise.all([
        vehicleApi.list(),
        reportApi.fleet(params),
        alertApi.list({
          scope: 'active',
          acknowledged: false,
          limit: 30,
          ...(params || {})
        })
      ]);

      setVehicles(
        Array.isArray(vehicleList) ? vehicleList : []
      );

      setSummary(fleetSummary);

      setRecentAlerts(
        Array.isArray(alerts) ? alerts : []
      );

      setError('');
    } catch (err) {
      console.error('Dashboard refresh failed:', err);

      setError(
        'Unable to refresh the dashboard. Check your backend connection.'
      );
    } finally {
      setLoading(false);
    }
  }, [vehicleFilterId]);

  useEffect(() => {
    setSummary(null);
    loadAll();

    const refresh = setInterval(loadAll, 20000);

    // Used to detect when hardware readings go stale.
    const clockTick = setInterval(() => {
      setClock(Date.now());
    }, 5000);

    return () => {
      clearInterval(refresh);
      clearInterval(clockTick);
    };
  }, [loadAll]);

  // ===================================================
  // 2. FIND THE HARDWARE VEHICLE
  // ===================================================

  const hardwareVehicleId = useMemo(() => {
    const hardware = vehicles.find(
      v => v.device_id === HARDWARE_DEVICE_ID
    );

    return hardware?.id ?? null;
  }, [vehicles]);

  // ===================================================
  // 3. POLL LIVE ESP32 SENSOR INDEPENDENTLY
  // ===================================================

  useEffect(() => {
    if (!hardwareVehicleId) {
      setHardwareFuel(null);
      return undefined;
    }

    let active = true;
    let inFlight = false;

    async function refreshPhysicalFuel() {
      if (inFlight) return;

      inFlight = true;

      try {
        const response = await api.get(
          `/devices/${hardwareVehicleId}/fuel`
        );

        if (!active) return;

        const incoming = response.data?.data;

        if (incoming) {
          setHardwareFuel(previous => {
            if (
              String(previous?.vehicle_id) ===
                String(incoming.vehicle_id) &&
              previous?.observed_at &&
              incoming.observed_at &&
              Date.parse(previous.observed_at) >
                Date.parse(incoming.observed_at)
            ) {
              return previous;
            }

            return incoming;
          });
        }
      } catch (err) {
        if (active) {
          console.warn(
            'Hardware fuel refresh failed:',
            err.message
          );

          setHardwareFuel(previous =>
            previous
              ? { ...previous, fresh: false }
              : null
          );
        }
      } finally {
        inFlight = false;
      }
    }

    refreshPhysicalFuel();

    // Update independently of ignition every 2.5 seconds.
    const poll = setInterval(
      refreshPhysicalFuel,
      2500
    );

    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [hardwareVehicleId]);

  // ===================================================
  // 4. SOCKET.IO LIVE EVENTS
  // ===================================================

  useEffect(() => {
    const socket = getSocket();

    if (!socket) {
      return undefined;
    }

    const onVehicleUpdate = vehicle => {
      setVehicles(previous =>
        previous.map(v =>
          String(v.id) === String(vehicle.id)
            ? { ...v, ...vehicle }
            : v
        )
      );
    };

    const onTelemetryUpdate = ({
      vehicle_id,
      reading
    }) => {
      setVehicles(previous =>
        previous.map(v =>
          String(v.id) === String(vehicle_id)
            ? {
                ...v,
                latest_telemetry: reading
              }
            : v
        )
      );
    };

    // ESP32 fuel events are independent of ignition.
    const onHardwareFuel = reading => {
      if (
        reading?.device_id !== HARDWARE_DEVICE_ID
      ) {
        return;
      }

      setHardwareFuel(previous => {
        if (
          String(previous?.vehicle_id) ===
            String(reading.vehicle_id) &&
          previous?.observed_at &&
          reading.observed_at &&
          Date.parse(previous.observed_at) >
            Date.parse(reading.observed_at)
        ) {
          return previous;
        }

        return reading;
      });
    };

    const onAlertNew = alert => {
      if (
        vehicleFilterId &&
        String(alert.vehicle_id) !== vehicleFilterId
      ) {
        return;
      }

      setRecentAlerts(previous =>
        previous.some(a => a.id === alert.id)
          ? previous
          : [alert, ...previous].slice(0, 30)
      );

      setSummary(previous =>
        previous
          ? {
              ...previous,
              open_alerts:
                asNumber(previous.open_alerts) + 1
            }
          : previous
      );
    };

    const onTripUpdate = trip => {
      setVehicles(previous =>
        previous.map(v =>
          String(v.id) === String(trip.vehicle_id)
            ? {
                ...v,
                active_trip:
                  ['COMPLETED', 'CANCELLED'].includes(
                    trip.status
                  )
                    ? null
                    : trip
              }
            : v
        )
      );
    };

    const onDeviceStatus = ({
      vehicle_id,
      status
    }) => {
      setVehicles(previous =>
        previous.map(v =>
          String(v.id) === String(vehicle_id)
            ? {
                ...v,
                current_status: status
              }
            : v
        )
      );
    };

    const events = [
      ['vehicle:update', onVehicleUpdate],
      ['telemetry:update', onTelemetryUpdate],
      ['hardware:fuel', onHardwareFuel],
      ['alert:new', onAlertNew],
      ['trip:started', onTripUpdate],
      ['trip:updated', onTripUpdate],
      ['trip:completed', onTripUpdate],
      ['device:status', onDeviceStatus]
    ];

    for (const [event, handler] of events) {
      socket.on(event, handler);
    }

    return () => {
      for (const [event, handler] of events) {
        socket.off(event, handler);
      }
    };
  }, [getSocket, vehicleFilterId]);

  // ===================================================
  // 5. VERIFY THE FUEL READING IS LIVE
  // ===================================================

  const sensorFuelIsLive = Boolean(
    hardwareFuel?.fresh === true &&
    hardwareFuel?.fuel_percent != null &&
    Number.isFinite(
      Number(hardwareFuel.fuel_percent)
    ) &&
    hardwareFuel?.observed_at &&
    Number.isFinite(
      Date.parse(hardwareFuel.observed_at)
    ) &&
    Math.max(clock, Date.now()) -
      Date.parse(hardwareFuel.observed_at) >= -3000 &&
    Math.max(clock, Date.now()) -
      Date.parse(hardwareFuel.observed_at) <=
        SENSOR_FRESH_MS
  );

  const physicalPercent = sensorFuelIsLive
    ? Number(hardwareFuel.fuel_percent)
    : null;

  // ===================================================
  // 6. OVERLAY REAL FUEL ON SIMULATED TELEMETRY
  // ===================================================

  const displayVehicles = useMemo(
    () =>
      vehicles.map(vehicle => {
        if (
          vehicle.device_id !== HARDWARE_DEVICE_ID ||
          !sensorFuelIsLive ||
          String(vehicle.id) !==
            String(hardwareFuel?.vehicle_id) ||
          !vehicle.latest_telemetry
        ) {
          return vehicle;
        }

        const percentage = Number(
          hardwareFuel.fuel_percent
        );

        const capacity = asNumber(
          vehicle.fuel_tank_capacity
        );

        return {
          ...vehicle,
          latest_telemetry: {
            ...vehicle.latest_telemetry,
            fuel_percent: percentage,
            fuel_level_litres:
              percentage * capacity / 100
          }
        };
      }),
    [vehicles, hardwareFuel, sensorFuelIsLive]
  );

  // ===================================================
  // 7. VEHICLE FILTERING
  // ===================================================

  const visibleVehicles = useMemo(() => {
    if (!vehicleFilterId) {
      return displayVehicles;
    }

    return displayVehicles.filter(
      v => String(v.id) === vehicleFilterId
    );
  }, [displayVehicles, vehicleFilterId]);

  const selectedVehicle = vehicleFilterId
    ? visibleVehicles[0]
    : null;

  // ===================================================
  // 8. DASHBOARD KPI CALCULATIONS
  // ===================================================

  const live = useMemo(() => {
    const reporting = visibleVehicles.filter(v => {
      if (isReporting(v)) {
        return true;
      }

      // A physical sensor counts as reporting even
      // when the hardware truck's ignition is OFF.
      return (
        v.device_id === HARDWARE_DEVICE_ID &&
        sensorFuelIsLive &&
        String(v.id) ===
          String(hardwareFuel?.vehicle_id)
      );
    });

    const readings = reporting.flatMap(v => {
      if (v.device_id === HARDWARE_DEVICE_ID) {
        if (
          !sensorFuelIsLive ||
          String(v.id) !==
            String(hardwareFuel?.vehicle_id)
        ) {
          return [];
        }

        return [{
          fuel_level_litres:
            Number(hardwareFuel.fuel_percent) *
            asNumber(v.fuel_tank_capacity) /
            100
        }];
      }

      return v.latest_telemetry
        ? [v.latest_telemetry]
        : [];
    });

    const currentFuel = readings.reduce(
      (sum, reading) =>
        sum +
        asNumber(reading.fuel_level_litres),
      0
    );

    const moving = reporting.filter(
      v =>
        v.latest_telemetry &&
        asNumber(v.latest_telemetry.speed) > 2
    );

    const avgSpeed = moving.length
      ? moving.reduce(
          (sum, v) =>
            sum +
            asNumber(
              v.latest_telemetry.speed
            ),
          0
        ) / moving.length
      : 0;

    const activeTrips = visibleVehicles.filter(
      v => v.active_trip?.status === 'ACTIVE'
    ).length;

    const fuelCapacity = visibleVehicles.reduce(
      (sum, v) =>
        sum + asNumber(v.fuel_tank_capacity),
      0
    );

    return {
      total: visibleVehicles.length,
      reporting: reporting.length,
      activeTrips,
      fuelLitres: currentFuel,
      fuelCapacity,
      hasReading: readings.length > 0,
      avgSpeed,
      movingCount: moving.length
    };
  }, [
    visibleVehicles,
    clock,
    sensorFuelIsLive,
    hardwareFuel
  ]);

  // ===================================================
  // 9. ALERT HANDLING
  // ===================================================

  const newestTheftAlert = recentAlerts.find(
    alert =>
      alert.type === 'THEFT_SUSPECTED' &&
      String(alert.severity).toUpperCase() ===
        'CRITICAL'
  );

  function selectVehicle(id) {
    setVehicleFilterId(
      id == null || id === ''
        ? ''
        : String(id)
    );
  }

  async function handleAcknowledge(id) {
    try {
      await alertApi.acknowledge(id);

      setRecentAlerts(previous =>
        previous.filter(a => a.id !== id)
      );

      setSummary(previous =>
        previous
          ? {
              ...previous,
              open_alerts: Math.max(
                0,
                asNumber(previous.open_alerts) - 1
              )
            }
          : previous
      );
    } catch {
      setError(
        'Could not acknowledge the alert.'
      );
    }
  }

  // ===================================================
  // 10. LOADING SCREEN
  // ===================================================

  if (loading) {
    return (
      <div>
        <h1>Dashboard</h1>
        <SkeletonRows
          rows={5}
          height={80}
          gap={14}
        />
      </div>
    );
  }

  // ===================================================
  // 11. DASHBOARD INTERFACE
  // ===================================================

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18
      }}
    >
      {/* PAGE HEADER */}

      <div className="fm-page-head">
        <div>
          <h1>Fleet Dashboard</h1>

          <p style={{ color: 'var(--fm-muted)' }}>
            Live data from authenticated device telemetry
            {' · '}
            {selectedVehicle
              ? selectedVehicle.license_plate
              : 'All vehicles'}
          </p>
        </div>

        <label className="fm-field-inline">
          <span>Vehicle view</span>

          <select
            value={vehicleFilterId}
            onChange={event =>
              selectVehicle(event.target.value)
            }
          >
            <option value="">
              All vehicles
            </option>

            {vehicles.map(vehicle => (
              <option
                key={vehicle.id}
                value={vehicle.id}
              >
                {vehicle.name}
                {' · '}
                {vehicle.license_plate}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div
          className="fm-card fm-card-pad"
          role="alert"
          style={{
            border: '1px solid #F59E0B'
          }}
        >
          {error}

          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-sm"
            onClick={loadAll}
          >
            Retry
          </button>
        </div>
      )}

      {/* CRITICAL FUEL THEFT ALERT */}

      {newestTheftAlert && (
        <div
          className="fm-card fm-card-pad"
          role="alert"
          style={{
            border: '2px solid #EF4444',
            background: 'rgba(239,68,68,.10)',
            display: 'flex',
            gap: 12,
            alignItems: 'center'
          }}
        >
          <AlertTriangle
            color="#EF4444"
            size={30}
          />

          <div style={{ flex: 1 }}>
            <strong
              style={{ color: '#EF4444' }}
            >
              CRITICAL — POSSIBLE FUEL THEFT
            </strong>

            <div>
              {newestTheftAlert.vehicle_name}
              {' ('}
              {newestTheftAlert.license_plate}
              {'): '}
              {newestTheftAlert.message}
            </div>

            <div
              style={{
                color: 'var(--fm-muted)',
                fontSize: 12
              }}
            >
              Rule-based stationary fuel loss.
              Investigate immediately.
            </div>
          </div>

          <button
            type="button"
            className="fm-btn fm-btn-secondary fm-btn-sm"
            onClick={() => navigate('/alerts')}
          >
            Review alert
          </button>
        </div>
      )}

      {/* ========================================
          DASHBOARD KPI CARDS
          ======================================== */}

      <div className="kpi-grid">
        <KPICard
          icon={Truck}
          label="Reporting vehicles"
          value={`${live.reporting}/${live.total}`}
          sub={
            vehicleFilterId
              ? 'Selected vehicle · live status'
              : 'Currently reporting'
          }
        />

        <KPICard
          icon={RouteIcon}
          label="Active trips"
          value={live.activeTrips}
          sub="From current Logbook trip status"
          onClick={() =>
            navigate('/logbook?status=ACTIVE')
          }
        />

        <KPICard
          icon={Fuel}
          label="Current tank fuel"
          value={
            live.hasReading
              ? `${live.fuelLitres.toLocaleString(
                  undefined,
                  {
                    maximumFractionDigits: 1
                  }
                )} L`
              : '—'
          }
          sub={
            selectedVehicle?.device_id ===
              HARDWARE_DEVICE_ID
              ? (
                  sensorFuelIsLive
                    ? `LIVE HC-SR04 · ${physicalPercent.toFixed(1)}% · ignition independent`
                    : 'Waiting for current HC-SR04 sensor reading'
                )
              : (
                  live.fuelCapacity
                    ? `Configured tank capacity: ${live.fuelCapacity.toLocaleString()} L`
                    : 'Awaiting telemetry'
                )
          }
        />

        <KPICard
          icon={Gauge}
          label="Live speed"
          value={`${live.avgSpeed.toFixed(1)} km/h`}
          sub={
            vehicleFilterId
              ? 'Current selected vehicle speed'
              : `Average moving speed · ${live.movingCount} moving`
          }
        />

        <KPICard
          icon={Bell}
          label="Open alerts"
          value={
            summary
              ? asNumber(summary.open_alerts)
              : '…'
          }
          tone="red"
          sub="Unacknowledged active incidents"
          onClick={() => navigate('/alerts')}
        />
      </div>

      {/* ========================================
          REAL HARDWARE FUEL SENSOR DISPLAY
          Shows even with ignition OFF.
          ======================================== */}

      {selectedVehicle?.device_id ===
        HARDWARE_DEVICE_ID && (
        <div
          className="fm-card fm-card-pad"
          style={{
            border:
              '1px solid rgba(34,211,238,0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                ESP32 Live Ultrasonic Fuel Sensor
              </h3>

              <div
                style={{
                  color: '#F8FAFC',
                  fontSize: 12,
                  marginTop: 4
                }}
              >
                Hardware input · Independent of
                ignition and trip status
              </div>
            </div>

            <span
              role="status"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: sensorFuelIsLive
                  ? '#00D4AA'
                  : '#F59E0B'
              }}
            >
              {sensorFuelIsLive
                ? 'SENSOR LIVE'
                : 'SENSOR OFFLINE / STALE'}
            </span>
          </div>

          {/* ACTUAL FUEL VALUES */}

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 14
            }}
          >
            <strong
              className="mono"
              style={{
                fontSize: 36,
                color: '#FFFFFF'
              }}
            >
              {sensorFuelIsLive
                ? `${physicalPercent.toFixed(1)}%`
                : '—'}
            </strong>

            <span
              style={{
                fontSize: 18,
                color: '#FFFFFF'
              }}
            >
              {sensorFuelIsLive
                ? `${(
                    physicalPercent *
                    asNumber(
                      selectedVehicle.fuel_tank_capacity
                    ) /
                    100
                  ).toFixed(1)} L equivalent`
                : 'Waiting for ESP32 telemetry'}
            </span>

            {sensorFuelIsLive && (
              <span
                style={{
                  fontSize: 13,
                  color: '#FFFFFF'
                }}
              >
                {(
                  physicalPercent *
                  Math.PI *
                  3.25 *
                  3.25 *
                  6 /
                  100
                ).toFixed(1)}
                {' mL physical'}
              </span>
            )}
          </div>

          {/* LIVE FUEL PROGRESS BAR */}

          <div
            role="progressbar"
            aria-label="Physical sensor fuel level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              sensorFuelIsLive
                ? physicalPercent
                : undefined
            }
            style={{
              height: 15,
              width: '100%',
              background:
                'rgba(255,255,255,0.12)',
              borderRadius: 999,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: sensorFuelIsLive
                  ? `${physicalPercent}%`
                  : '0%',
                background: '#00D4AA',
                borderRadius: 999,
                transition:
                  'width 0.6s ease'
              }}
            />
          </div>

          <div
            style={{
              color: '#FFFFFF',
              fontSize: 12
            }}
          >
            {hardwareFuel?.observed_at
              ? `Last sensor update: ${new Date(
                  hardwareFuel.observed_at
                ).toLocaleTimeString()}`
              : 'No sensor measurements received yet'}
          </div>
        </div>
      )}

      {/* ========================================
          FLEET MAP AND VEHICLE LIST
          ======================================== */}

      <div className="dashboard-grid">
        {/* MAP */}

        <div
          className="fm-card"
          style={{
            height: 460,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              padding: '14px 16px 0',
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            <h3 style={{ margin: 0 }}>
              Live Fleet Map
            </h3>

            {vehicleFilterId && (
              <button
                type="button"
                className="fm-btn fm-btn-ghost fm-btn-sm"
                onClick={() => selectVehicle('')}
              >
                Show all
              </button>
            )}
          </div>

          <div
            style={{
              flex: 1,
              padding: 12
            }}
          >
            <LiveMap
              vehicles={visibleVehicles}
              selectedVehicleId={
                vehicleFilterId
                  ? Number(vehicleFilterId)
                  : null
              }
              onSelectVehicle={selectVehicle}
            />
          </div>
        </div>

        {/* VEHICLES */}

        <div
          className="fm-card fm-card-pad"
          style={{
            height: 460,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <h3>
            Vehicles
            {vehicleFilterId
              ? ' · Filtered'
              : ''}
          </h3>

          {visibleVehicles.length === 0 ? (
            <EmptyState
              title="No vehicles"
              description="Choose a vehicle or add a truck."
            />
          ) : (
            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              {visibleVehicles.map(vehicle => (
                <div
                  key={vehicle.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background:
                      vehicleFilterId ===
                      String(vehicle.id)
                        ? 'var(--fm-navy-tint)'
                        : 'transparent'
                  }}
                >
                  {/* VEHICLE DETAILS */}

                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        selectVehicle(vehicle.id)
                      }
                      style={{
                        display: 'block',
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        color: 'inherit',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      {vehicle.name}
                    </button>

                    <div
                      style={{
                        color: '#FFFFFF',
                        fontSize: 12
                      }}
                    >
                      {vehicle.license_plate}
                      {' · '}
                      {vehicle.driver_name ||
                        'Unassigned'}
                    </div>

                    {vehicle.active_trip && (
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 4,
                          color: '#FFFFFF'
                        }}
                      >
                        Trip: {
                          vehicle.active_trip.status
                        }
                      </div>
                    )}

                    <button
                      type="button"
                      className="fm-btn fm-btn-ghost fm-btn-sm"
                      onClick={() =>
                        navigate(
                          `/vehicles/${vehicle.id}`
                        )
                      }
                    >
                      Details
                    </button>
                  </div>

                  {/* STATUS, IGNITION AND FUEL */}

                  <div
                    style={{
                      textAlign: 'right',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 6
                    }}
                  >
                    <VehicleStatusBadge
                      status={
                        vehicle.current_status
                      }
                    />

                    {/* Original ignition button */}
                    <IgnitionSwitch
                      vehicle={vehicle}
                      compact
                    />

                    {vehicle.device_id ===
                    HARDWARE_DEVICE_ID ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#FFFFFF'
                        }}
                      >
                        {sensorFuelIsLive &&
                        String(vehicle.id) ===
                          String(hardwareFuel?.vehicle_id)
                          ? `${physicalPercent.toFixed(1)}% real fuel · `
                          : 'Sensor offline · '}

                        {vehicle.latest_telemetry
                          ? `${asNumber(
                              vehicle.latest_telemetry.speed
                            ).toFixed(1)} km/h simulated`
                          : 'No movement telemetry'}
                      </div>
                    ) : (
                      vehicle.latest_telemetry && (
                        <div
                          style={{
                            fontSize: 12,
                            color: '#FFFFFF'
                          }}
                        >
                          {asNumber(
                            vehicle.latest_telemetry
                              .fuel_percent
                          ).toFixed(1)}
                          {'% fuel · '}

                          {asNumber(
                            vehicle.latest_telemetry
                              .speed
                          ).toFixed(1)}
                          {' km/h'}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================
          RECENT ACTIVE ALERTS
          ======================================== */}

      <div className="fm-card fm-card-pad">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10
          }}
        >
          <h3 style={{ margin: 0 }}>
            Recent Active Alerts
            {selectedVehicle
              ? ` · ${selectedVehicle.license_plate}`
              : ''}
          </h3>

          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-sm"
            onClick={() => navigate('/alerts')}
          >
            View all
          </button>
        </div>

        {recentAlerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No active alerts"
            description="There are no unacknowledged active incidents for this selection."
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            {recentAlerts.slice(0, 10).map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={
                  handleAcknowledge
                }
                onOpenVehicle={id =>
                  navigate(`/vehicles/${id}`)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
