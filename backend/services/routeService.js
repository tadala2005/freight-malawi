// ============================================================================
// FREIGHT MALAWI ROUTE SERVICE
//
// Route geometry is used for route-deviation detection.
// Operational road distance is stored separately from GPS geometry.
//
// M1 Blantyre <-> Lilongwe = 305 km road-distance reference.
// ============================================================================

const {
  distanceToPolylineKm,
  haversineDistanceKm,
} = require('../utils/geo');

const M1_BLANTYRE_LILONGWE = [
  {
    lat: -15.7861,
    lng: 35.0058,
    label: 'Blantyre',
  },
  {
    lat: -15.7200,
    lng: 35.0000,
    label: 'Blantyre outskirts',
  },
  {
    lat: -15.6350,
    lng: 34.9000,
    label: 'Lunzu',
  },
  {
    lat: -15.7000,
    lng: 34.8300,
    label: 'Lirangwe',
  },
  {
    lat: -15.6000,
    lng: 34.7800,
    label: 'Mdeka',
  },
  {
    lat: -15.4650,
    lng: 34.9080,
    label: 'Zalewa',
  },
  {
    lat: -15.3800,
    lng: 34.8200,
    label: 'M1-M6 corridor',
  },
  {
    lat: -15.2900,
    lng: 34.7500,
    label: 'Phalula',
  },
  {
    lat: -15.1450,
    lng: 34.7000,
    label: 'Senzani',
  },
  {
    lat: -14.9800,
    lng: 34.6500,
    label: 'Manjawira',
  },
  {
    lat: -14.9000,
    lng: 34.6100,
    label: 'Chingen',
  },
  {
    lat: -14.7600,
    lng: 34.5500,
    label: 'Kampebuza',
  },
  {
    lat: -14.5931,
    lng: 34.4783,
    label: 'Ntcheu',
  },
  {
    lat: -14.5400,
    lng: 34.4300,
    label: 'Tsangano',
  },
  {
    lat: -14.4200,
    lng: 34.3700,
    label: 'Lizulu',
  },
  {
    lat: -14.3822,
    lng: 34.3322,
    label: 'Dedza',
  },
  {
    lat: -14.2465,
    lng: 34.1102,
    label: 'Chimbiya',
  },
  {
    lat: -14.1004,
    lng: 33.9312,
    label: 'Kampata',
  },
  {
    lat: -14.0600,
    lng: 33.8500,
    label: 'Nathenje',
  },
  {
    lat: -14.0200,
    lng: 33.8100,
    label: 'Nanjiri',
  },
  {
    lat: -13.9900,
    lng: 33.7900,
    label: 'Mitundu',
  },
  {
    lat: -13.9626,
    lng: 33.7741,
    label: 'Lilongwe',
  },
];

const ROUTES = {
  BLANTYRE_LILONGWE: {
    name:
      'Blantyre – Lilongwe (M1)',

    origin:
      'Blantyre',

    destination:
      'Lilongwe',

    roadDistanceKm:
      305,

    waypoints:
      M1_BLANTYRE_LILONGWE,
  },

  M1_LILONGWE_BLANTYRE: {
    name:
      'Lilongwe – Blantyre (M1)',

    origin:
      'Lilongwe',

    destination:
      'Blantyre',

    roadDistanceKm:
      305,

    waypoints:
      M1_BLANTYRE_LILONGWE
        .slice()
        .reverse(),
  },

  BLANTYRE_ZOMBA: {
    name:
      'Blantyre – Zomba',

    origin:
      'Blantyre',

    destination:
      'Zomba',

    roadDistanceKm:
      65,

    waypoints: [
      {
        lat: -15.7861,
        lng: 35.0058,
        label: 'Blantyre',
      },
      {
        lat: -15.6300,
        lng: 35.1200,
        label: 'M3 corridor',
      },
      {
        lat: -15.4700,
        lng: 35.2450,
        label:
          'Approaching Zomba',
      },
      {
        lat: -15.3833,
        lng: 35.3333,
        label: 'Zomba',
      },
    ],
  },

  LILONGWE_SALIMA: {
    name:
      'Lilongwe – Salima',

    origin:
      'Lilongwe',

    destination:
      'Salima',

    roadDistanceKm:
      110,

    waypoints: [
      {
        lat: -13.9626,
        lng: 33.7741,
        label: 'Lilongwe',
      },
      {
        lat: -13.8750,
        lng: 34.0500,
        label:
          'M14 corridor',
      },
      {
        lat: -13.7960,
        lng: 34.3200,
        label:
          'Approaching Salima',
      },
      {
        lat: -13.7803,
        lng: 34.4587,
        label: 'Salima',
      },
    ],
  },
};

function getRoute(routeKey) {
  return (
    ROUTES[routeKey] ||
    null
  );
}

function listRoutes() {
  return Object.entries(
    ROUTES,
  ).map(
    ([key, route]) => ({
      key,

      name:
        route.name,

      origin:
        route.origin,

      destination:
        route.destination,

      distance_km:
        Number(
          route.roadDistanceKm ||
            0,
        ),
    }),
  );
}

function deviationDistanceKm(
  routeKey,
  lat,
  lng,
) {
  const route =
    getRoute(routeKey);

  if (!route) {
    return null;
  }

  return distanceToPolylineKm(
    lat,
    lng,
    route.waypoints,
  );
}

function isNearDestination(
  routeKey,
  lat,
  lng,
  thresholdKm = 3,
) {
  const route =
    getRoute(routeKey);

  if (!route) {
    return false;
  }

  const destination =
    route.waypoints[
      route.waypoints.length - 1
    ];

  return (
    haversineDistanceKm(
      lat,
      lng,
      destination.lat,
      destination.lng,
    ) <= thresholdKm
  );
}

module.exports = {
  ROUTES,
  getRoute,
  listRoutes,
  deviationDistanceKm,
  isNearDestination,
};