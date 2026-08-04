import { testDatabaseConnection, pool } from './config/database.js';
import { ensureV110Schema } from './migrations/ensureV110Schema.js';

try {
  await testDatabaseConnection();
  await ensureV110Schema();
  console.log('Version 1.1.0 migration completed successfully.');
  await pool.end();
  process.exit(0);
} catch (error) {
  console.error('Version 1.1.0 migration failed:', error);
  await pool.end().catch(() => {});
  process.exit(1);
}
