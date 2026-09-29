import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { VehicleStatusBadge } from '../UI/Badge';

const MALAWI_CENTER = [-13.9626, 33.7741];
const MALAWI_DEFAULT_ZOOM = 7;

const STATUS_COLOR = {
  MOVING: '#00D4AA',
  IDLE: '#F59E0B',
  STOPPED: '#94A3B8',
  OFFLINE: '#64748B',
};

function normalizeLocation(vehicle) {
  const telemetry = vehicle?.latest_telemetry;

  const telemetryLat = Number(telemetry?.latitude);
  const telemetryLng = Number(telemetry?.longitude);

  if (
    Number.isFinite(telemetryLat) &&
    Number.isFinite(telemetryLng)
  ) {
    return {
      lat: telemetryLat,
      lng: telemetryLng,
      heading: Number(telemetry?.heading || 0),
      speed: Number(telemetry?.speed || 0),
      fuelPercent: Number(
        telemetry?.fuel_percent || 0,
      ),
      fuelLitres: Number(
        telemetry?.fuel_level_litres || 0,
      ),
      ignitionOn: Boolean(
        telemetry?.ignition_on,
      ),
      recordedAt:
        telemetry?.recorded_at ||
        vehicle?.last_gps_update ||
        vehicle?.last_seen_at ||
        null,
      live:
        vehicle?.current_status !==
        'OFFLINE',
    };
  }

  // If there is no latest telemetry object, use the coordinates persisted
  // on the vehicle row by the backend as the last known device position.
  const lastLat = Number(
    vehicle?.last_latitude,
  );
  const lastLng = Number(
    vehicle?.last_longitude,
  );

  if (
    Number.isFinite(lastLat) &&
    Number.isFinite(lastLng)
  ) {
    return {
      lat: lastLat,
      lng: lastLng,
      heading: 0,
      speed: 0,
      fuelPercent: 0,
      fuelLitres: 0,
      ignitionOn: false,
      recordedAt:
        vehicle?.last_gps_update ||
        vehicle?.last_seen_at ||
        null,
      live: false,
    };
  }

  return null;
}

function truckIconSvg(
  color,
  heading,
  selected,
  offline,
) {
  const safeHeading = Number.isFinite(
    Number(heading),
  )
    ? Number(heading)
    : 0;

  return `
    <div
      style="
        transform:rotate(${safeHeading}deg);
        transform-origin:center;
        filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))
      "
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="${selected ? 16 : 14}"
          fill="#07111F"
          stroke="${color}"
          stroke-width="${selected ? 4 : 3}"
          ${
            offline
              ? 'stroke-dasharray="4 3"'
              : ''
          }
        />

        <path
          d="M10.5 22V12.5h9l5 4.5V22h-14Z"
          fill="none"
          stroke="${color}"
          stroke-width="2.2"
          stroke-linejoin="round"
        />

        <path
          d="M19.5 13v4h5"
          fill="none"
          stroke="${color}"
          stroke-width="2.2"
          stroke-linejoin="round"
        />

        <circle
          cx="14"
          cy="23"
          r="2"
          fill="${color}"
        />

        <circle
          cx="23"
          cy="23"
          r="2"
          fill="${color}"
        />
      </svg>
    </div>
  `;
}

function vehicleIcon(
  vehicle,
  selected,
) {
  const color =
    STATUS_COLOR[
      vehicle?.current_status
    ] || '#94A3B8';

  const location =
    normalizeLocation(vehicle);

  return L.divIcon({
    html: truckIconSvg(
      color,
      location?.heading || 0,
      selected,
      vehicle?.current_status ===
        'OFFLINE',
    ),

    className:
      'fm-vehicle-marker',

    iconSize: [36, 36],

    iconAnchor: [18, 18],
  });
}

function ResizeHandler() {
  const map = useMap();
  const observerRef = useRef(null);

  useEffect(() => {
    const container =
      map.getContainer();

    const invalidate = () => {
      map.invalidateSize({
        pan: false,
        animate: false,
      });
    };

    if (
      typeof ResizeObserver !==
      'undefined'
    ) {
      observerRef.current =
        new ResizeObserver(
          invalidate,
        );

      observerRef.current.observe(
        container,
      );
    }

    const timers = [
      100,
      300,
      700,
      1200,
    ].map((ms) =>
      setTimeout(
        invalidate,
        ms,
      ),
    );

    window.addEventListener(
      'resize',
      invalidate,
    );

    return () => {
      observerRef.current?.disconnect();

      timers.forEach(clearTimeout);

      window.removeEventListener(
        'resize',
        invalidate,
      );
    };
  }, [map]);

  return null;
}

function FleetFitHandler({
  vehicles,
  selectedVehicleId,
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedVehicleId) {
      return;
    }

    const points = vehicles
      .map(normalizeLocation)
      .filter(Boolean)
      .map((location) => [
        location.lat,
        location.lng,
      ]);

    if (points.length > 1) {
      map.fitBounds(
        points,
        {
          padding: [40, 40],
          maxZoom: 10,
        },
      );
    } else if (
      points.length === 1
    ) {
      map.setView(
        points[0],
        10,
      );
    }
  }, [
    vehicles,
    selectedVehicleId,
    map,
  ]);

  return null;
}

function SelectedVehicleHandler({
  vehicle,
}) {
  const map = useMap();

  useEffect(() => {
    const location =
      normalizeLocation(vehicle);

    if (!location) {
      return;
    }

    map.flyTo(
      [
        location.lat,
        location.lng,
      ],
      Math.max(
        map.getZoom(),
        11,
      ),
      {
        duration: 0.6,
        easeLinearity: 0.25,
      },
    );
  }, [vehicle, map]);

  return null;
}

export default function LiveMap({
  vehicles = [],
  selectedVehicleId,
  onSelectVehicle,
  height = '100%',
}) {
  const positioned =
    useMemo(
      () =>
        vehicles
          .map((vehicle) => ({
            vehicle,
            location:
              normalizeLocation(
                vehicle,
              ),
          }))
          .filter(
            ({ location }) =>
              location,
          ),
      [vehicles],
    );

  const selectedVehicle =
    positioned.find(
      ({ vehicle }) =>
        String(vehicle.id) ===
        String(
          selectedVehicleId,
        ),
    )?.vehicle || null;

  return (
    <div
      className="map-container"
      style={{
        height,
        minHeight: 320,
      }}
    >
      <MapContainer
        center={
          MALAWI_CENTER
        }
        zoom={
          MALAWI_DEFAULT_ZOOM
        }
        scrollWheelZoom
        style={{
          width: '100%',
          height: '100%',
          minHeight: 320,
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <ResizeHandler />

        <FleetFitHandler
          vehicles={vehicles}
          selectedVehicleId={
            selectedVehicleId
          }
        />

        <SelectedVehicleHandler
          vehicle={
            selectedVehicle
          }
        />

        {positioned.map(
          ({
            vehicle,
            location,
          }) => {
            const selected =
              String(
                vehicle.id,
              ) ===
              String(
                selectedVehicleId,
              );

            const offline =
              vehicle.current_status ===
              'OFFLINE';

            return (
              <Marker
                key={
                  vehicle.id
                }
                position={[
                  location.lat,
                  location.lng,
                ]}
                icon={vehicleIcon(
                  vehicle,
                  selected,
                )}
                eventHandlers={{
                  click:
                    () =>
                      onSelectVehicle?.(
                        vehicle.id,
                      ),
                }}
              >
                <Popup>
                  <div
                    style={{
                      minWidth: 230,
                    }}
                  >
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        gap: 8,
                        alignItems:
                          'center',
                        marginBottom:
                          8,
                      }}
                    >
                      <strong>
                        {
                          vehicle.name
                        }
                      </strong>

                      <VehicleStatusBadge
                        status={
                          vehicle.current_status
                        }
                      />
                    </div>

                    <div
                      style={{
                        color:
                          'var(--fm-text-secondary)',
                        lineHeight:
                          1.75,
                      }}
                    >
                      Registration:{' '}
                      <strong
                        style={{
                          color:
                            'var(--fm-text)',
                        }}
                      >
                        {
                          vehicle.license_plate
                        }
                      </strong>

                      <br />

                      Driver:{' '}
                      <strong
                        style={{
                          color:
                            'var(--fm-text)',
                        }}
                      >
                        {
                          vehicle.driver_name ||
                          'Unassigned'
                        }
                      </strong>

                      <br />

                      Speed:{' '}
                      <strong
                        style={{
                          color:
                            'var(--fm-text)',
                        }}
                      >
                        {location.speed.toFixed(
                          0,
                        )}{' '}
                        km/h
                      </strong>

                      <br />

                      Fuel:{' '}
                      <strong
                        style={{
                          color:
                            'var(--fm-text)',
                        }}
                      >
                        {location.fuelPercent.toFixed(
                          0,
                        )}
                        %
                      </strong>

                      <br />

                      Ignition:{' '}
                      <strong
                        style={{
                          color:
                            'var(--fm-text)',
                        }}
                      >
                        {
                          location.ignitionOn
                            ? 'ON'
                            : 'OFF'
                        }
                      </strong>

                      <br />

                      GPS:{' '}
                      <strong
                        style={{
                          color:
                            offline
                              ? 'var(--fm-warning)'
                              : 'var(--fm-primary)',
                        }}
                      >
                        {
                          location.live
                            ? 'LIVE'
                            : 'LAST KNOWN'
                        }
                      </strong>

                      <br />

                      Last update:{' '}
                      <strong
                        style={{
                          color:
                            'var(--fm-text)',
                        }}
                      >
                        {location.recordedAt
                          ? new Date(
                              location.recordedAt,
                            ).toLocaleString()
                          : 'Unknown'}
                      </strong>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          },
        )}
      </MapContainer>

      <div
        style={{
          position:
            'absolute',
          top: 12,
          left: 12,
          zIndex: 500,
          display: 'flex',
          gap: 8,
          flexWrap:
            'wrap',
          pointerEvents:
            'none',
        }}
      >
        <span className="fm-badge fm-badge-teal">
          LIVE
        </span>

        <span className="fm-badge fm-badge-muted">
          LAST KNOWN
        </span>
      </div>
    </div>
  );
}