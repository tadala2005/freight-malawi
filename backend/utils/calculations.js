// ============================================================================
// Shared financial & fuel-efficiency calculations. These are authoritative —
// the frontend must never recompute these independently for anything it
// persists or reports as fact; it only displays what the backend returns.
// ============================================================================

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function totalExpenses(expenses) {
  return round2((expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0));
}

function profitLoss(transporterIncome, expenses) {
  const income = Number(transporterIncome || 0);
  const expenseTotal = Array.isArray(expenses) ? totalExpenses(expenses) : Number(expenses || 0);
  return round2(income - expenseTotal);
}

function profitMargin(transporterIncome, expenses) {
  const income = Number(transporterIncome || 0);
  if (income <= 0) return 0;
  const pl = profitLoss(income, expenses);
  return round2((pl / income) * 100);
}

/** Fuel efficiency in km per litre. Returns null when not computable. */
function fuelEfficiencyKmPerLitre(distanceKm, fuelUsedLitres) {
  const distance = Number(distanceKm || 0);
  const fuel = Number(fuelUsedLitres || 0);
  if (fuel <= 0 || distance <= 0) return null;
  return round2(distance / fuel);
}

function costPerKm(totalCost, distanceKm) {
  const distance = Number(distanceKm || 0);
  if (distance <= 0) return null;
  return round2(Number(totalCost || 0) / distance);
}

function revenuePerKm(income, distanceKm) {
  const distance = Number(distanceKm || 0);
  if (distance <= 0) return null;
  return round2(Number(income || 0) / distance);
}

module.exports = {
  round2,
  totalExpenses,
  profitLoss,
  profitMargin,
  fuelEfficiencyKmPerLitre,
  costPerKm,
  revenuePerKm,
};
