/**
 * Request-scoped tenant helpers.
 * Prefer importing from here in new code; existing controllers keep using `pool`.
 */
export {
  getPool,
  getMasterPool,
  getTenantPool,
  getServerPool,
  getTenantContext,
  runWithTenant,
  ensureDatabaseExists,
  pool
} from '../config/database.js';

export {
  buildTenantDbName,
  provisionTenantDatabase,
  migrateTenantDatabase,
  findCompanyByCode,
  findCompanyById
} from './tenantProvisioner.js';
