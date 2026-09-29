// ============================================================================
// FREIGHT MALAWI SIMULATOR ROUTES
//
// The M1 Blantyre-Lilongwe corridor is calibrated to a 305 km road distance.
// GPS coordinates are corridor anchors. The roadKm field represents the
// operational road distance and is what the simulator uses for movement.
//
// This prevents the sparse GPS waypoint geometry from being mistaken for the
// actual road distance travelled by the vehicle.
// ============================================================================

const EARTH_RADIUS_KM = 6371;

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )
  );
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const y =
    Math.sin(toRad(lon2 - lon1)) *
    Math.cos(toRad(lat2));

  const x =
    Math.cos(toRad(lat1)) *
      Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));

  return (
    ((Math.atan2(y, x) * 180) /
      Math.PI +
      360) %
    360
  );
}

// ---------------------------------------------------------------------------
// M1 BLANTYRE -> LILONGWE
//
// Operational road-book reference:
// Blantyre = 0 km
// Lunzu = 15 km
// Lirangwe = 31 km
// Mdeka = 42 km
// Zalewa = 52 km
// Phalula = 81 km
// Senzani = 99 km
// Manjawira = 108 km
// Chingen = 115 km
// Kampebuza = 137 km
// Ntcheu = 149 km
// Tsangano = 158 km
// Lizulu = 195 km
// Dedza = 219 km
// Chimbiya = 243 km
// Kampata = 272 km
// Nathenje = 283 km
// Nanjiri = 292 km
// Mitundu = 297 km
// Lilongwe = 305 km
//
// GPS positions are approximate corridor coordinates used for the prototype.
// ---------------------------------------------------------------------------

const M1_BLANTYRE_LILONGWE = [
  {
    lat: -15.7861,
    lng: 35.0058,
    label: 'Blantyre',
    roadKm: 0,
  },
  {
    lat: -15.7200,
    lng: 35.0000,
    label: 'Blantyre outskirts',
    roadKm: 7,
  },
  {
    lat: -15.6350,
    lng: 34.9000,
    label: 'Lunzu',
    roadKm: 15,
  },
  {
    lat: -15.7000,
    lng: 34.8300,
    label: 'Lirangwe',
    roadKm: 31,
  },
  {
    lat: -15.6000,
    lng: 34.7800,
    label: 'Mdeka',
    roadKm: 42,
  },
  {
    lat: -15.4650,
    lng: 34.9080,
    label: 'Zalewa',
    roadKm: 52,
  },
  {
    lat: -15.3800,
    lng: 34.8200,
    label: 'M1-M6 corridor',
    roadKm: 53,
  },
  {
    lat: -15.2900,
    lng: 34.7500,
    label: 'Phalula',
    roadKm: 81,
  },
  {
    lat: -15.1450,
    lng: 34.7000,
    label: 'Senzani',
    roadKm: 99,
  },
  {
    lat: -14.9800,
    lng: 34.6500,
    label: 'Manjawira',
    roadKm: 108,
  },
  {
    lat: -14.9000,
    lng: 34.6100,
    label: 'Chingen',
    roadKm: 115,
  },
  {
    lat: -14.7600,
    lng: 34.5500,
    label: 'Kampebuza',
    roadKm: 137,
  },
  {
    lat: -14.5931,
    lng: 34.4783,
    label: 'Ntcheu',
    roadKm: 149,
  },
  {
    lat: -14.5400,
    lng: 34.4300,
    label: 'Tsangano',
    roadKm: 158,
  },
  {
    lat: -14.4200,
    lng: 34.3700,
    label: 'Lizulu',
    roadKm: 195,
  },
  {
    lat: -14.3822,
    lng: 34.3322,
    label: 'Dedza',
    roadKm: 219,
  },
  {
    lat: -14.2465,
    lng: 34.1102,
    label: 'Chimbiya',
    roadKm: 243,
  },
  {
    lat: -14.1004,
    lng: 33.9312,
    label: 'Kampata',
    roadKm: 272,
  },
  {
    lat: -14.0600,
    lng: 33.8500,
    label: 'Nathenje',
    roadKm: 283,
  },
  {
    lat: -14.0200,
    lng: 33.8100,
    label: 'Nanjiri',
    roadKm: 292,
  },
  {
    lat: -13.9900,
    lng: 33.7900,
    label: 'Mitundu',
    roadKm: 297,
  },
  {
    lat: -13.9626,
    lng: 33.7741,
    label: 'Lilongwe',
    roadKm: 305,
  },
];

const ROUTES = {
  BLANTYRE_LILONGWE: {
    name: 'Blantyre – Lilongwe (M1)',
    origin: 'Blantyre',
    destination: 'Lilongwe',
    roadDistanceKm: 305,
    waypoints: M1_BLANTYRE_LILONGWE,
  },

  M1_LILONGWE_BLANTYRE: {
    name: 'Lilongwe – Blantyre (M1)',
    origin: 'Lilongwe',
    destination: 'Blantyre',
    roadDistanceKm: 305,
    waypoints: M1_BLANTYRE_LILONGWE
      .slice()
      .reverse()
      .map((point) => ({
        ...point,
        roadKm: 305 - point.roadKm,
      })),
  },

  BLANTYRE_ZOMBA: {
    name: 'Blantyre – Zomba',
    origin: 'Blantyre',
    destination: 'Zomba',
    roadDistanceKm: 65,
    waypoints: [
      {
        lat: -15.7861,
        lng: 35.0058,
        label: 'Blantyre',
        roadKm: 0,
      },
      {
        lat: -15.6300,
        lng: 35.1200,
        label: 'M3 corridor',
        roadKm: 25,
      },
      {
        lat: -15.4700,
        lng: 35.2450,
        label: 'Approaching Zomba',
        roadKm: 48,
      },
      {
        lat: -15.3833,
        lng: 35.3333,
        label: 'Zomba',
        roadKm: 65,
      },
    ],
  },

  LILONGWE_SALIMA: {
    name: 'Lilongwe – Salima',
    origin: 'Lilongwe',
    destination: 'Salima',
    roadDistanceKm: 110,
    waypoints: [
      {
        lat: -13.9626,
        lng: 33.7741,
        label: 'Lilongwe',
        roadKm: 0,
      },
      {
        lat: -13.8750,
        lng: 34.0500,
        label: 'M14 corridor',
        roadKm: 52,
      },
      {
        lat: -13.7960,
        lng: 34.3200,
        label: 'Approaching Salima',
        roadKm: 88,
      },
      {
        lat: -13.7803,
        lng: 34.4587,
        label: 'Salima',
        roadKm: 110,
      },
    ],
  },
};

function totalDistanceKm(routeKey) {
  const route = ROUTES[routeKey];

  if (!route) {
    return 0;
  }

  return Number(route.roadDistanceKm || 0);
}

function positionAtDistance(routeKey, distanceKm) {
  const route = ROUTES[routeKey];

  if (!route || !route.waypoints.length) {
    return {
      lat: 0,
      lng: 0,
      heading: 0,
      finished: true,
    };
  }

  const total = totalDistanceKm(routeKey);

  const distance = Math.max(
    0,
    Math.min(
      Number(distanceKm) || 0,
      total,
    ),
  );

  const points = route.waypoints;

  if (distance >= total) {
    const last =
      points[points.length - 1];

    const previous =
      points[points.length - 2] ||
      last;

    return {
      lat: last.lat,
      lng: last.lng,
      heading: bearingDeg(
        previous.lat,
        previous.lng,
        last.lat,
        last.lng,
      ),
      finished: true,
    };
  }

  for (
    let i = 0;
    i < points.length - 1;
    i += 1
  ) {
    const a = points[i];
    const b = points[i + 1];

    const startKm =
      Number(a.roadKm) || 0;

    const endKm =
      Number(b.roadKm) ||
      startKm;

    if (
      distance <= endKm ||
      i === points.length - 2
    ) {
      const segmentKm =
        Math.max(
          0.001,
          endKm - startKm,
        );

      const fraction =
        Math.max(
          0,
          Math.min(
            1,
            (distance - startKm) /
              segmentKm,
          ),
        );

      return {
        lat:
          a.lat +
          (b.lat - a.lat) *
            fraction,

        lng:
          a.lng +
          (b.lng - a.lng) *
            fraction,

        heading: bearingDeg(
          a.lat,
          a.lng,
          b.lat,
          b.lng,
        ),

        finished: false,
      };
    }
  }

  const last =
    points[points.length - 1];

  return {
    lat: last.lat,
    lng: last.lng,
    heading: 0,
    finished: true,
  };
}

function offsetPerpendicular(
  lat,
  lng,
  headingDegValue,
  offsetKm,
) {
  const perpendicular =
    toRad(
      Number(
        headingDegValue || 0,
      ) + 90,
    );

  const dLat =
    (offsetKm / 110.57) *
    Math.cos(perpendicular);

  const dLng =
    (offsetKm /
      (111.32 *
        Math.cos(toRad(lat)))) *
    Math.sin(perpendicular);

  return {
    lat: lat + dLat,
    lng: lng + dLng,
  };
}

module.exports = {
  ROUTES,
  totalDistanceKm,
  positionAtDistance,
  offsetPerpendicular,
  haversineKm,
};