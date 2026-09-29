import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { vehicleApi } from '../api/endpoints';
import { SkeletonRows } from '../components/UI/Skeleton';

export default function Settings() {
  const { user } =
    useAuth();

  const [
    vehicles,
    setVehicles,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    toastsEnabled,
    setToastsEnabled,
  ] = useState(
    () =>
      localStorage.getItem(
        'fm_toast_on_alert',
      ) !== 'false',
  );

  useEffect(() => {
    let active = true;

    vehicleApi
      .list()
      .then((data) => {
        if (!active) {
          return;
        }

        setVehicles(
          Array.isArray(data)
            ? data
            : [],
        );
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setVehicles([]);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function toggleToasts(
    next,
  ) {
    setToastsEnabled(
      next,
    );

    localStorage.setItem(
      'fm_toast_on_alert',
      String(next),
    );
  }

  return (
    <div>
      <h1>
        Settings
      </h1>

      <p
        style={{
          color:
            'var(--fm-muted)',
          marginBottom: 16,
        }}
      >
        Account and notification preferences.
      </p>

      <div
        className="two-col"
        style={{
          marginBottom: 16,
        }}
      >
        <div className="fm-card fm-card-pad">
          <h3>
            Profile
          </h3>

          {user && (
            <dl
              style={{
                margin: 0,
                display:
                  'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                rowGap: 8,
                fontSize: 14,
              }}
            >
              <dt
                style={{
                  color:
                    'var(--fm-muted)',
                }}
              >
                Username
              </dt>

              <dd
                style={{
                  margin: 0,
                }}
              >
                {
                  user.username
                }
              </dd>

              <dt
                style={{
                  color:
                    'var(--fm-muted)',
                }}
              >
                Email
              </dt>

              <dd
                style={{
                  margin: 0,
                }}
              >
                {user.email}
              </dd>

              <dt
                style={{
                  color:
                    'var(--fm-muted)',
                }}
              >
                Member since
              </dt>

              <dd
                style={{
                  margin: 0,
                }}
              >
                {user.created_at
                  ? format(
                      new Date(
                        user.created_at,
                      ),
                      'PP',
                    )
                  : '—'}
              </dd>
            </dl>
          )}
        </div>

        <div className="fm-card fm-card-pad">
          <h3>
            Notification preferences
          </h3>

          <label
            style={{
              display:
                'flex',
              alignItems:
                'center',
              gap: 10,
              cursor:
                'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={
                toastsEnabled
              }
              onChange={(
                event,
              ) =>
                toggleToasts(
                  event.target
                    .checked,
                )
              }
            />

            Show a pop-up notification when a new alert arrives
          </label>

          <p
            style={{
              fontSize: 12,
              color:
                'var(--fm-muted)',
              marginTop: 8,
            }}
          >
            The notification bell and active-alert count continue to update in real time.
          </p>
        </div>
      </div>

      <div className="fm-card fm-card-pad">
        <h3>
          Connected devices
        </h3>

        <p
          style={{
            color:
              'var(--fm-muted)',
            marginBottom: 16,
          }}
        >
          Vehicle devices report GPS, speed, fuel and ignition status in real time. Driver idle monitoring is controlled by the system telemetry rules and is not configured as a vehicle setting.
        </p>

        {loading ? (
          <SkeletonRows
            rows={3}
            height={40}
          />
        ) : vehicles.length ===
          0 ? (
          <p
            style={{
              color:
                'var(--fm-muted)',
            }}
          >
            No vehicles configured yet.
          </p>
        ) : (
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>
                    Vehicle
                  </th>

                  <th>
                    Device ID
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Overspeed limit
                  </th>
                </tr>
              </thead>

              <tbody>
                {vehicles.map(
                  (
                    vehicle,
                  ) => (
                    <tr
                      key={
                        vehicle.id
                      }
                    >
                      <td>
                        {
                          vehicle.name
                        }{' '}
                        (
                        {
                          vehicle.license_plate
                        }
                        )
                      </td>

                      <td className="mono">
                        {vehicle.device_id ||
                          'Not configured'}
                      </td>

                      <td>
                        {
                          vehicle.current_status ||
                          'UNKNOWN'
                        }
                      </td>

                      <td>
                        {vehicle.overspeed_threshold_kmh
                          ? `${vehicle.overspeed_threshold_kmh} km/h`
                          : 'System default'}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}