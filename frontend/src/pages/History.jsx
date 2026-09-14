import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';

import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import EmptyState from '../components/UI/EmptyState.jsx';
import HistoryChart from '../components/Dashboard/HistoryChart.jsx';

import { VehicleAPI } from '../api/endpoints.js';
import { subscribe } from '../socket/socket.js';

import {
  Route,
  RefreshCw,
  Database,
} from 'lucide-react';

const DEFAULT_CENTER = [-13.9626, 33.7741];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDatetimeLocal(date) {
  const d = new Date(date);

  return [
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  ].join('T');
}

function getDefaultRange() {
  const end = new Date();
  const start = new Date(
    end.getTime() - 24 * 60 * 60 * 1000
  );

  return {
    start: toDatetimeLocal(start),
    end: toDatetimeLocal(end),
  };
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function RouteBounds({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (!positions.length) return;

    const timer = window.setTimeout(() => {
      try {
        if (positions.length === 1) {
          map.setView(
            positions[0],
            14,
            { animate: false }
          );
        } else {
          map.fitBounds(
            positions,
            {
              padding: [40, 40],
              maxZoom: 13,
              animate: false,
            }
          );
        }

        map.invalidateSize();
      } catch {
        // Map may have been unmounted during navigation.
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [map, positions]);

  return null;
}

function HistoryMap({ history }) {
  const positions = useMemo(
    () =>
      history
        .map((point) => [
          safeNumber(point.latitude),
          safeNumber(point.longitude),
        ])
        .filter(
          ([lat, lng]) =>
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
        ),
    [history]
  );

  const center =
    positions[0] || DEFAULT_CENTER;

  return (
    <div
      style={{
        height: '100%',
        minHeight: 420,
        width: '100%',
      }}
    >
      <MapContainer
        center={center}
        zoom={7}
        scrollWheelZoom
        style={{
          height: '100%',
          width: '100%',
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RouteBounds
          positions={positions}
        />

        {positions.length >= 2 && (
          <Polyline
            positions={positions}
            pathOptions={{
              color: '#12877F',
              weight: 5,
              opacity: 0.95,
            }}
          />
        )}

        {positions.length > 0 && (
          <>
            <CircleMarker
              center={positions[0]}
              radius={6}
              pathOptions={{
                color: '#0B2A4A',
                fillColor: '#FFFFFF',
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>
                <strong>Trip start</strong>
                <br />
                {history[0]?.recorded_at
                  ? new Date(
                      history[0].recorded_at
                    ).toLocaleString()
                  : '—'}
              </Popup>
            </CircleMarker>

            <CircleMarker
              center={
                positions[
                  positions.length - 1
                ]
              }
              radius={7}
              pathOptions={{
                color: '#0B2A4A',
                fillColor: '#12877F',
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>
                <strong>Latest position</strong>
                <br />
                {history[
                  history.length - 1
                ]?.recorded_at
                  ? new Date(
                      history[
                        history.length - 1
                      ].recorded_at
                    ).toLocaleString()
                  : '—'}
              </Popup>
            </CircleMarker>
          </>
        )}
      </MapContainer>
    </div>
  );
}

export default function History() {
  const [vehicles, setVehicles] =
    useState([]);

  const [vehicleId, setVehicleId] =
    useState('');

  const [range, setRange] =
    useState(getDefaultRange());

  const [history, setHistory] =
    useState([]);

  const [loadingVehicles, setLoadingVehicles] =
    useState(true);

  const [loadingHistory, setLoadingHistory] =
    useState(false);

  const [error, setError] =
    useState('');

  const [loadedRange, setLoadedRange] =
    useState(null);

  const requestIdRef =
    useRef(0);

  const loadVehicles = useCallback(
    async () => {
      setLoadingVehicles(true);
      setError('');

      try {
        const { data } =
          await VehicleAPI.list();

        const list =
          Array.isArray(data.vehicles)
            ? data.vehicles
            : [];

        setVehicles(list);

        setVehicleId(
          (previous) =>
            previous ||
            String(list[0]?.id || '')
        );
      } catch (requestError) {
        setVehicles([]);
        setError(
          requestError.response?.data?.message ||
            'Unable to load vehicles.'
        );
      } finally {
        setLoadingVehicles(false);
      }
    },
    []
  );

  const loadHistory =
    useCallback(
      async ({
        showSpinner = true,
      } = {}) => {
        if (!vehicleId) {
          setHistory([]);
          return;
        }

        const startDate =
          new Date(range.start);

        const endDate =
          new Date(range.end);

        if (
          Number.isNaN(
            startDate.getTime()
          ) ||
          Number.isNaN(
            endDate.getTime()
          )
        ) {
          setError(
            'Please select valid start and end dates.'
          );
          return;
        }

        if (endDate <= startDate) {
          setError(
            'End date must be after the start date.'
          );
          return;
        }

        const requestId =
          requestIdRef.current + 1;

        requestIdRef.current =
          requestId;

        if (showSpinner) {
          setLoadingHistory(true);
        }

        setError('');

        try {
          const { data } =
            await VehicleAPI.history(
              vehicleId,
              startDate.toISOString(),
              endDate.toISOString()
            );

          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          const points =
            Array.isArray(data.history)
              ? data.history
              : [];

          setHistory(points);

          setLoadedRange({
            start: startDate,
            end: endDate,
          });

          if (points.length === 0) {
            setError(
              'No route history was found for this vehicle in the selected period. Run the simulator and choose a range that includes its telemetry.'
            );
          }
        } catch (requestError) {
          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setHistory([]);

          setError(
            requestError.response?.data?.message ||
              'Unable to load route history.'
          );
        } finally {
          if (
            requestId ===
            requestIdRef.current
          ) {
            setLoadingHistory(false);
          }
        }
      },
      [vehicleId, range.start, range.end]
    );

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    if (!vehicleId) return;

    loadHistory();
  }, [vehicleId]);

  /*
   * Refresh the current route when new telemetry
   * arrives. This means you can leave the simulator
   * running and see history accumulate.
   */
  useEffect(() => {
    const unsubscribe =
      subscribe(
        'vehicle:update',
        (payload) => {
          if (
            String(payload.vehicleId) !==
            String(vehicleId)
          ) {
            return;
          }

          loadHistory({
            showSpinner: false,
          });
        }
      );

    return unsubscribe;
  }, [vehicleId, loadHistory]);

  const selectedVehicle =
    vehicles.find(
      (vehicle) =>
        String(vehicle.id) ===
        String(vehicleId)
    );

  const routeDistanceKm =
    useMemo(() => {
      if (history.length < 2) {
        return 0;
      }

      let total = 0;

      const earthRadius = 6371;

      function toRad(degrees) {
        return (
          (degrees * Math.PI) / 180
        );
      }

      for (
        let index = 1;
        index < history.length;
        index += 1
      ) {
        const previous =
          history[index - 1];

        const current =
          history[index];

        const lat1 =
          safeNumber(
            previous.latitude
          );

        const lon1 =
          safeNumber(
            previous.longitude
          );

        const lat2 =
          safeNumber(
            current.latitude
          );

        const lon2 =
          safeNumber(
            current.longitude
          );

        const dLat =
          toRad(lat2 - lat1);

        const dLon =
          toRad(lon2 - lon1);

        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

        total +=
          earthRadius *
          2 *
          Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
          );
      }

      return total;
    }, [history]);

  return (
    <AppShell title="History">
      <Card
        title="Route History"
        subtitle={
          selectedVehicle
            ? `${selectedVehicle.name} · ${selectedVehicle.license_plate}`
            : 'Select a vehicle and date range'
        }
      >
        <div className="report-toolbar history-toolbar">
          <div
            className="form-group"
            style={{
              marginBottom: 0,
              minWidth: 220,
              flex: '1 1 220px',
            }}
          >
            <label
              className="form-label"
              htmlFor="history-vehicle"
            >
              Vehicle
            </label>

            <select
              id="history-vehicle"
              className="form-input"
              value={vehicleId}
              disabled={
                loadingVehicles ||
                vehicles.length === 0
              }
              onChange={(event) =>
                setVehicleId(
                  event.target.value
                )
              }
            >
              {vehicles.length === 0 ? (
                <option value="">
                  No vehicles available
                </option>
              ) : (
                vehicles.map(
                  (vehicle) => (
                    <option
                      key={vehicle.id}
                      value={vehicle.id}
                    >
                      {vehicle.name} (
                      {vehicle.license_plate})
                    </option>
                  )
                )
              )}
            </select>
          </div>

          <div
            className="form-group"
            style={{
              marginBottom: 0,
              flex: '1 1 210px',
            }}
          >
            <label
              className="form-label"
              htmlFor="history-start"
            >
              Start
            </label>

            <input
              id="history-start"
              type="datetime-local"
              className="form-input"
              value={range.start}
              onChange={(event) =>
                setRange(
                  (current) => ({
                    ...current,
                    start:
                      event.target.value,
                  })
                )
              }
            />
          </div>

          <div
            className="form-group"
            style={{
              marginBottom: 0,
              flex: '1 1 210px',
            }}
          >
            <label
              className="form-label"
              htmlFor="history-end"
            >
              End
            </label>

            <input
              id="history-end"
              type="datetime-local"
              className="form-input"
              value={range.end}
              onChange={(event) =>
                setRange(
                  (current) => ({
                    ...current,
                    end:
                      event.target.value,
                  })
                )
              }
            />
          </div>

          <Button
            type="button"
            size="md"
            onClick={() =>
              loadHistory()
            }
            loading={loadingHistory}
            disabled={
              loadingHistory ||
              loadingVehicles ||
              !vehicleId
            }
            className="history-load-button"
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
            />
            {loadingHistory
              ? 'Loading...'
              : 'Load Route'}
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background:
                'var(--fm-red-tint)',
              border:
                '1px solid var(--fm-red)',
              color: 'var(--fm-red)',
              fontSize:
                'var(--fm-text-sm)',
            }}
          >
            {error}
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      {loadingVehicles ? (
        <Skeleton height={500} />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={Route}
          title="No vehicles yet"
          description="Add a vehicle and run the simulator to generate route history."
        />
      ) : (
        <>
          <div
            className="history-summary-grid"
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(3, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Card>
              <div className="card-subtitle">
                Telemetry points
              </div>

              <div
                className="kpi-value"
                style={{
                  marginTop: 6,
                }}
              >
                {history.length}
              </div>
            </Card>

            <Card>
              <div className="card-subtitle">
                Recorded distance
              </div>

              <div
                className="kpi-value"
                style={{
                  marginTop: 6,
                }}
              >
                {routeDistanceKm.toFixed(
                  1
                )}{' '}
                km
              </div>
            </Card>

            <Card>
              <div className="card-subtitle">
                Route status
              </div>

              <div
                className="kpi-value"
                style={{
                  marginTop: 6,
                  fontSize: 20,
                }}
              >
                {history.length >= 2
                  ? 'Route loaded'
                  : 'Waiting for data'}
              </div>
            </Card>
          </div>

          <div className="dashboard-grid history-grid">
            <Card
              title="Vehicle Route"
              subtitle={
                loadedRange
                  ? `${loadedRange.start.toLocaleString()} → ${loadedRange.end.toLocaleString()}`
                  : 'Load a route to display it'
              }
              className="map-card"
              bodyClassName="map-card-body"
            >
              {loadingHistory ? (
                <Skeleton height={420} />
              ) : history.length ===
                0 ? (
                <EmptyState
                  icon={Database}
                  title="No route data"
                  description="Start the simulator, then load a range containing telemetry."
                />
              ) : (
                <div className="history-map-container">
                  <HistoryMap
                    history={history}
                  />
                </div>
              )}
            </Card>

            <Card
              title="Fuel Over Time"
              subtitle="Recorded fuel levels during the selected period"
            >
              {history.length > 0 ? (
                <HistoryChart
                  telemetry={history}
                />
              ) : (
                <EmptyState
                  icon={Route}
                  title="No fuel history"
                  description="Fuel readings will appear once telemetry is available."
                />
              )}
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}

