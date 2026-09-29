// ============================================================================
// Expenses belong to a trip, which belongs to a user. Every query joins
// through trips to enforce ownership rather than trusting a bare expense id.
// ============================================================================
const { pool } = require('../config/db');

async function listForTrip(tripId, userId) {
  const [rows] = await pool.execute(
    `SELECT e.* FROM trip_expenses e
     JOIN trips t ON t.id = e.trip_id
     WHERE e.trip_id = ? AND t.user_id = ?
     ORDER BY e.expense_date DESC, e.id DESC`,
    [tripId, userId],
  );
  return rows;
}

async function create(tripId, userId, data) {
  const [tripRows] = await pool.execute(
    "SELECT id, status FROM trips WHERE id = ? AND user_id = ? LIMIT 1",
    [tripId, userId],
  );
  if (!tripRows.length || ['COMPLETED', 'CANCELLED'].includes(tripRows[0].status)) return null;
  const [result] = await pool.execute(
    'INSERT INTO trip_expenses (trip_id, category, description, amount, expense_date) VALUES (?, ?, ?, ?, ?)',
    [tripId, data.category, data.description || null, data.amount, data.expense_date],
  );
  const [rows] = await pool.execute('SELECT * FROM trip_expenses WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function update(expenseId, userId, data) {
  const [rows] = await pool.execute(
    `SELECT e.id FROM trip_expenses e JOIN trips t ON t.id = e.trip_id WHERE e.id = ? AND t.user_id = ? AND t.status <> 'COMPLETED' AND t.status <> 'CANCELLED'`,
    [expenseId, userId],
  );
  if (!rows.length) return null;

  const assignable = ['category', 'description', 'amount', 'expense_date'];
  const fields = [];
  const values = [];
  for (const key of assignable) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) {
    const [existing] = await pool.execute('SELECT * FROM trip_expenses WHERE id = ?', [expenseId]);
    return existing[0];
  }
  values.push(expenseId);
  await pool.execute(`UPDATE trip_expenses SET ${fields.join(', ')} WHERE id = ?`, values);
  const [updated] = await pool.execute('SELECT * FROM trip_expenses WHERE id = ?', [expenseId]);
  return updated[0];
}

async function remove(expenseId, userId) {
  const [result] = await pool.execute(
    `DELETE FROM trip_expenses
     WHERE id = ?
       AND trip_id IN (
         SELECT t.id FROM trips t
         WHERE t.user_id = ? AND t.status <> 'COMPLETED' AND t.status <> 'CANCELLED'
       )`,
    [expenseId, userId],
  );
  return result.affectedRows > 0;
}

async function totalForTrip(tripId) {
  const [rows] = await pool.execute('SELECT COALESCE(SUM(amount), 0) AS total FROM trip_expenses WHERE trip_id = ?', [tripId]);
  return Number(rows[0].total);
}

module.exports = { listForTrip, create, update, remove, totalForTrip };
