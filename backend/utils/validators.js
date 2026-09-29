// ============================================================================
// Pure validation functions. Each returns { valid: boolean, errors: string[] }
// so middleware/validation.js can turn failures into a consistent 400 response.
// ============================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,50}$/;

function fail(errors) {
  return { valid: false, errors };
}
function ok() {
  return { valid: true, errors: [] };
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateRegister(body) {
  const errors = [];
  const { username, email, password } = body || {};
  if (!username || !USERNAME_RE.test(username)) {
    errors.push('Username must be 3-50 characters (letters, numbers, . _ -).');
  }
  if (!email || !EMAIL_RE.test(email)) {
    errors.push('A valid email address is required.');
  }
  if (!password || String(password).length < 8) {
    errors.push('Password must be at least 8 characters.');
  }
  return errors.length ? fail(errors) : ok();
}

function validateLogin(body) {
  const errors = [];
  if (!body || !body.username) errors.push('Username is required.');
  if (!body || !body.password) errors.push('Password is required.');
  return errors.length ? fail(errors) : ok();
}

function validateVehicle(body, { partial = false } = {}) {
  const errors = [];
  const b = body || {};
  if (!partial || b.name !== undefined) {
    if (!b.name || String(b.name).trim().length < 2) errors.push('Vehicle name is required.');
  }
  if (!partial || b.license_plate !== undefined) {
    if (!b.license_plate || String(b.license_plate).trim().length < 2) errors.push('License plate is required.');
  }
  if (b.fuel_tank_capacity !== undefined) {
    const v = Number(b.fuel_tank_capacity);
    if (!isFiniteNumber(v) || v <= 0 || v > 5000) errors.push('Fuel tank capacity must be between 0 and 5000 litres.');
  }
  if (b.payload_capacity_kg !== undefined) {
    const v = Number(b.payload_capacity_kg);
    if (!isFiniteNumber(v) || v <= 0 || v > 100000) errors.push('Payload capacity must be between 0 and 100000 kg.');
  }
  if (b.overspeed_threshold_kmh !== undefined) {
    const v = Number(b.overspeed_threshold_kmh);
    if (!isFiniteNumber(v) || v < 20 || v > 180) errors.push('Overspeed threshold must be between 20 and 180 km/h.');
  }
  return errors.length ? fail(errors) : ok();
}

function validateTelemetry(body) {
  const errors = [];
  const b = body || {};
  const lat = Number(b.latitude);
  const lon = Number(b.longitude);
  const speed = Number(b.speed);
  const heading = Number(b.heading);
  const fuelLitres = Number(b.fuel_level_litres);
  const fuelPercent = Number(b.fuel_percent);
  const cargo = b.cargo_weight_kg !== undefined ? Number(b.cargo_weight_kg) : 0;

  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) errors.push('latitude must be between -90 and 90.');
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) errors.push('longitude must be between -180 and 180.');
  if (!isFiniteNumber(speed) || speed < 0 || speed > 250) errors.push('speed must be a non-negative number (<=250 km/h).');
  if (b.heading !== undefined && (!isFiniteNumber(heading) || heading < 0 || heading > 360)) {
    errors.push('heading must be between 0 and 360.');
  }
  if (!isFiniteNumber(fuelLitres) || fuelLitres < 0) errors.push('fuel_level_litres must be a non-negative number.');
  if (!isFiniteNumber(fuelPercent) || fuelPercent < 0 || fuelPercent > 100) errors.push('fuel_percent must be between 0 and 100.');
  if (cargo !== undefined && (!isFiniteNumber(cargo) || cargo < 0)) errors.push('cargo_weight_kg must be a non-negative number.');
  if (!b.device_id) errors.push('device_id is required.');
  if (b.ignition_on === undefined) errors.push('ignition_on is required.');

  return errors.length ? fail(errors) : ok();
}

function validateTripCreate(body) {
  const errors = [];
  const b = body || {};
  if (!b.vehicle_id) errors.push('vehicle_id is required.');
  if (!b.route_key || typeof b.route_key !== 'string') errors.push('route_key is required.');
  if (b.transporter_income !== undefined) {
    const v = Number(b.transporter_income);
    if (!isFiniteNumber(v) || v < 0) errors.push('transporter_income must be a non-negative number.');
  }
  if (b.cargo_weight_kg !== undefined && b.cargo_weight_kg !== null) {
    const v = Number(b.cargo_weight_kg);
    if (!isFiniteNumber(v) || v < 0) errors.push('cargo_weight_kg must be a non-negative number.');
  }
  return errors.length ? fail(errors) : ok();
}

function validateTripDetails(body) {
  const errors = [];
  const b = body || {};
  if (b.distance_km !== undefined) {
    const v = Number(b.distance_km);
    if (!isFiniteNumber(v) || v < 0 || v > 10000) errors.push('distance_km must be between 0 and 10000.');
  }
  if (b.transporter_income !== undefined) {
    const v = Number(b.transporter_income);
    if (!isFiniteNumber(v) || v < 0) errors.push('transporter_income must be a non-negative number.');
  }
  if (b.cargo_weight_kg !== undefined && b.cargo_weight_kg !== null) {
    const v = Number(b.cargo_weight_kg);
    if (!isFiniteNumber(v) || v < 0) errors.push('cargo_weight_kg must be a non-negative number.');
  }
  return errors.length ? fail(errors) : ok();
}

const EXPENSE_CATEGORIES = [
  'Fuel', 'Toll', 'Food', 'Accommodation', 'Maintenance',
  'Loading', 'Offloading', 'Driver Allowance', 'Parking', 'Other',
];

function validateExpense(body) {
  const errors = [];
  const b = body || {};
  if (!b.category || !EXPENSE_CATEGORIES.includes(b.category)) {
    errors.push(`category must be one of: ${EXPENSE_CATEGORIES.join(', ')}.`);
  }
  const amount = Number(b.amount);
  if (!isFiniteNumber(amount) || amount <= 0) errors.push('amount must be a positive number.');
  if (!b.expense_date || Number.isNaN(Date.parse(b.expense_date))) errors.push('expense_date must be a valid date.');
  return errors.length ? fail(errors) : ok();
}

module.exports = {
  EXPENSE_CATEGORIES,
  validateRegister,
  validateLogin,
  validateVehicle,
  validateTelemetry,
  validateTripCreate,
  validateTripDetails,
  validateExpense,
};
