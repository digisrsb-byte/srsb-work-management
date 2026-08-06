import { testDatabaseConnection, pool } from './config/database.js';
import { ensureV110Schema } from './migrations/ensureV110Schema.js';
import { ensureV120Schema } from './migrations/ensureV120Schema.js';

try {
  await testDatabaseConnection();
  await ensureV110Schema();
  await ensureV120Schema();
  console.log('SRSB Work Management 1.2.0 migration completed.');
  await pool.end();
  process.exit(0);
} catch (error) {
  console.error('Version 1.2.0 migration failed:', error.message);
  await pool.end().catch(() => {});
  process.exit(1);
}
