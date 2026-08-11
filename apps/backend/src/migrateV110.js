import { env } from './config/env.js';
import {
  getTenantPool,
  testDatabaseConnection
} from './config/database.js';
import { ensureV110Schema } from './migrations/ensureV110Schema.js';

const pool = getTenantPool(env.dbName);

try {
  await testDatabaseConnection(pool);
  await ensureV110Schema({ pool, dbName: env.dbName });
  console.log('Version 1.1.0 migration completed successfully.');
  await pool.end();
  process.exit(0);
} catch (error) {
  console.error('Version 1.1.0 migration failed:', error);
  await pool.end().catch(() => {});
  process.exit(1);
}
