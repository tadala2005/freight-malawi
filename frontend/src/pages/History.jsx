import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';

import { vehicleApi } from '../api/endpoints';
import HistoryMap from '../components/History/HistoryMap';
import DateRangePicker from '../components/UI/DateRangePicker';

function localDate(date) {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`
  );
}

export default function History() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');

  const [range, setRange] = useState(() => ({
    from: localDate(new Date(Date.now() - 86400000)),
    to: localDate(new Date())
  }));

  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const request = useRef(0);

  useEffect(() => {
    let active = true;

    vehicleApi.list()
      .then(list => {
        if (active) {
          setVehicles(list);

          setVehicleId(
            list.length ? String(list[0].id) : ''
          );
        }
      })
      .catch(() => {
        if (active) {
          setError(
            'Could not load vehicles. Refresh this page to retry.'
          );
        }
      });

    return () => {
      active = false;
      request.current++;
    };
  }, []);

  const load = useCallback(async () => {
    const id = ++request.current;

    if (!vehicleId) {
      setLoading(false);
      setPoints([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (
        range.from &&
        range.to &&
        range.from > range.to
      ) {
        throw new Error(
          'Start date must not be after end date.'
        );
      }

      const result = await vehicleApi.history(
        vehicleId,
        {
          from: range.from
            ? new Date(
                `${range.from}T00:00:00`
              ).toISOString()
            : undefined,

          to: range.to
            ? new Date(
                `${range.to}T23:59:59.999`
              ).toISOString()
            : undefined,

          limit: 5000
        }
      );

      if (id === request.current) {
        setPoints(
          Array.isArray(result.points)
            ? result.points
            : []
        );
      }
    } catch (err) {
      if (id === request.current) {
        setPoints([]);
        setError(
          err.message || 'History could not be loaded.'
        );
      }
    } finally {
      if (id === request.current) {
        setLoading(false);
      }
    }
  }, [vehicleId, range.from, range.to]);

  useEffect(() => {
    load();

    return () => {
      request.current++;
    };
  }, [load]);

  const chart = points
    .filter(p =>
      Number.isFinite(Date.parse(p.recorded_at))
    )
    .map(p => ({
      ...p,
      time: new Date(p.recorded_at).toLocaleTimeString()
    }));

  return (
    <div>
      <h1>Route History</h1>

      <p>
        Recorded demonstration telemetry. Movement is simulated;
        hardware fuel is a scaled model reading.
      </p>

      <div
        className="fm-card fm-card-pad"
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16
        }}
      >
        <select
          className="fm-select"
          value={vehicleId}
          onChange={e => setVehicleId(e.target.value)}
        >
          <option value="">Select vehicle</option>

          {vehicles.map(v => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.license_plate})
            </option>
          ))}
        </select>

        <DateRangePicker
          from={range.from}
          to={range.to}
          onChange={setRange}
        />

        <button
          className="fm-btn fm-btn-secondary"
          onClick={load}
          disabled={loading || !vehicleId}
        >
          {loading ? 'Loading…' : 'Load / Retry'}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {!loading && !points.length && (
        <p>No telemetry for this selection.</p>
      )}

      {points.length > 0 && (
        <>
          {points.length >= 5000 && (
            <p>
              Results reached the 5,000-point limit.
              Narrow the date range to inspect the full period.
            </p>
          )}

          <div
            className="fm-card"
            style={{
              height: 420,
              marginBottom: 16
            }}
          >
            <HistoryMap points={points} />
          </div>

          <div className="fm-card fm-card-pad">
            <h3>Fuel and speed</h3>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />

                <YAxis
                  yAxisId="fuel"
                  domain={[0, 100]}
                  unit="%"
                />

                <YAxis
                  yAxisId="speed"
                  orientation="right"
                  unit=" km/h"
                />

                <Tooltip />
                <Legend />

                <Line
                  yAxisId="fuel"
                  dataKey="fuel_percent"
                  name="Fuel %"
                  stroke="#00D4AA"
                  dot={false}
                />

                <Line
                  yAxisId="speed"
                  dataKey="speed"
                  name="Speed km/h"
                  stroke="#22D3EE"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
