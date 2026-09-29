import { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const MALAWI_CENTER = [
  -13.9626,
  33.7741,
];

function FitAndResize({
  points,
}) {
  const map = useMap();
  const observerRef =
    useRef(null);

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

  useEffect(() => {
    if (!points?.length) {
      map.setView(
        MALAWI_CENTER,
        7,
      );
      return;
    }

    if (
      points.length > 1
    ) {
      map.fitBounds(
        points.map(
          (point) => [
            Number(
              point.lat,
            ),
            Number(
              point.lng,
            ),
          ],
        ),
        {
          padding: [32, 32],
          maxZoom: 13,
        },
      );
    } else {
      map.setView(
        [
          Number(
            points[0].lat,
          ),
          Number(
            points[0].lng,
          ),
        ],
        12,
      );
    }
  }, [points, map]);

  return null;
}

export default function HistoryMap({
  points = [],
  height = '100%',
}) {
  const validPoints =
    points.filter(
      (point) =>
        Number.isFinite(
          Number(point.lat),
        ) &&
        Number.isFinite(
          Number(point.lng),
        ),
    );

  const latLngs =
    validPoints.map(
      (point) => [
        Number(point.lat),
        Number(point.lng),
      ],
    );

  const hasPoints =
    validPoints.length > 0;

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
        zoom={7}
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

        <FitAndResize
          points={validPoints}
        />

        {hasPoints && (
          <Polyline
            positions={
              latLngs
            }
            pathOptions={{
              color:
                '#00D4AA',
              weight: 4,
              opacity: 0.9,
            }}
          />
        )}

        {hasPoints && (
          <CircleMarker
            center={
              latLngs[0]
            }
            radius={7}
            pathOptions={{
              color:
                '#22D3EE',
              fillColor:
                '#22D3EE',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip
              permanent
              direction="top"
            >
              Device start point
            </Tooltip>
          </CircleMarker>
        )}

        {hasPoints && (
          <CircleMarker
            center={
              latLngs[
                latLngs.length -
                  1
              ]
            }
            radius={7}
            pathOptions={{
              color:
                '#F59E0B',
              fillColor:
                '#F59E0B',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip
              permanent
              direction="top"
            >
              Latest device point
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}