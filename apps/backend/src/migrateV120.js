import { env } from './config/env.js';
import {
  getTenantPool,
  testDatabaseConnection
} from './config/database.js';
import { ensureV110Schema } from './migrations/ensureV110Schema.js';
import { ensureV120Schema } from './migrations/ensureV120Schema.js';

const pool = getTenantPool(env.dbName);

try {
  await testDatabaseConnection(pool);
  await ensureV110Schema({ pool, dbName: env.dbName });
  await ensureV120Schema({
    pool,
    dbName: env.dbName,
    forceSrsbInvoiceProfile: true
  });
  console.log('SRSB Work Management 1.2.0 migration completed.');
  await pool.end();
  process.exit(0);
} catch (error) {
  console.error('Version 1.2.0 migration failed:', error.message);
  await pool.end().catch(() => {});
  process.exit(1);
}
