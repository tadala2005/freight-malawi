// ============================================================================
// Geographic helper functions used by the trip engine, route-deviation
// detector and route-completion detector.
// ============================================================================

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in kilometres. */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Approximate shortest distance (km) from a point to a line segment,
 * using an equirectangular projection which is accurate enough at the
 * scale of a single road corridor (tens of km).
 */
function distanceToSegmentKm(lat, lon, lat1, lon1, lat2, lon2) {
  const latRef = toRad((lat1 + lat2) / 2);
  const kx = 111.32 * Math.cos(latRef); // km per degree longitude at this latitude
  const ky = 110.57; // km per degree latitude

  const x = (lon - lon1) * kx;
  const y = (lat - lat1) * ky;
  const dx = (lon2 - lon1) * kx;
  const dy = (lat2 - lat1) * ky;

  const segLenSq = dx * dx + dy * dy;
  let t = segLenSq === 0 ? 0 : (x * dx + y * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = t * dx;
  const projY = t * dy;
  const diffX = x - projX;
  const diffY = y - projY;
  return Math.sqrt(diffX * diffX + diffY * diffY);
}

/**
 * Minimum distance (km) from a point to any segment of a polyline
 * (an array of {lat, lng} waypoints describing a route corridor).
 */
function distanceToPolylineKm(lat, lon, waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
  let min = Infinity;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const d = distanceToSegmentKm(lat, lon, a.lat, a.lng, b.lat, b.lng);
    if (d < min) min = d;
  }
  return min;
}

/** Total length (km) of a polyline made of {lat,lng} waypoints. */
function polylineLengthKm(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    total += haversineDistanceKm(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
  }
  return total;
}

module.exports = {
  haversineDistanceKm,
  distanceToSegmentKm,
  distanceToPolylineKm,
  polylineLengthKm,
};
