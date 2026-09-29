// Synchronises simulator device keys into the bcrypt hashes stored on the
// matching vehicle rows. This uses the same database adapter as the API, so
// it works with both local MySQL and production PostgreSQL/Supabase.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, closePool } = require('../config/db');

const configPath = path.join(__dirname, '..', '..', 'simulator', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function main() {
  try {
    for (const sim of config.vehicles || []) {
      const [rows] = await pool.execute(
        'SELECT id, license_plate FROM vehicles WHERE device_id = ? LIMIT 1',
        [sim.deviceId],
      );

      if (!rows.length) {
        console.log(`[MISSING] ${sim.deviceId} (${sim.licensePlate}) — no vehicle row found.`);
        continue;
      }

      const hash = await bcrypt.hash(String(sim.deviceKey), 10);
      await pool.execute(
        'UPDATE vehicles SET device_key_hash = ? WHERE id = ?',
        [hash, rows[0].id],
      );
      console.log(`[READY] ${sim.deviceId} → vehicle #${rows[0].id} (${rows[0].license_plate})`);
    }
    console.log('\nSimulator device keys are synchronised. Restart the simulator if it is running.');
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error('\n[ERROR] Could not provision simulator devices:', err.message);
  process.exit(1);
});
