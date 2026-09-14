const { getHistory } = require('../models/telemetryModel');
const { countForVehicleInRange } = require('../models/alertModel');
const { haversineKm } = require('./theftDetector');

/**
 * Builds a fuel/distance report for a vehicle over a date range, computed
 * entirely from stored telemetry — no fabricated figures.
 */
async function buildReport(vehicle, start, end) {
  const rows = await getHistory(vehicle.id, start, end);

  let totalDistanceKm = 0;
  let totalFuelConsumedLitres = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];

    const distanceKm = haversineKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    totalDistanceKm += distanceKm;

    const fuelDelta = prev.fuel_level_litres - curr.fuel_level_litres;
    if (fuelDelta > 0) {
      // Only count decreases as consumption; increases are refuelling events
      // and are excluded from the consumption total.
      totalFuelConsumedLitres += fuelDelta;
    }
  }

  const averageConsumptionKmPerLitre =
    totalFuelConsumedLitres > 0 ? totalDistanceKm / totalFuelConsumedLitres : 0;

  const alertCount = await countForVehicleInRange(vehicle.id, start, end);

  return {
    vehicle: {
      id: vehicle.id,
      name: vehicle.name,
      licensePlate: vehicle.license_plate,
      driverName: vehicle.driver_name,
      fuelTankCapacity: vehicle.fuel_tank_capacity,
    },
    period: { start, end },
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    totalFuelConsumedLitres: Number(totalFuelConsumedLitres.toFixed(2)),
    averageConsumptionKmPerLitre: Number(averageConsumptionKmPerLitre.toFixed(2)),
    alertCount,
    pointCount: rows.length,
  };
}

module.exports = { buildReport };
