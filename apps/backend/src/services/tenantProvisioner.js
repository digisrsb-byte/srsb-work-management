import {
  ensureDatabaseExists,
  getMasterPool,
  getTenantPool
} from '../config/database.js';
import { ensureTenantBaseSchema } from '../migrations/ensureTenantBaseSchema.js';
import { ensureSecuritySchema } from '../migrations/ensureSecuritySchema.js';
import { ensureEmployeeProfileSchema } from '../migrations/ensureEmployeeProfileSchema.js';
import { ensureV110Schema } from '../migrations/ensureV110Schema.js';
import { ensureV120Schema } from '../migrations/ensureV120Schema.js';

import { env } from '../config/env.js';

const DB_NAME_PREFIX = 'company_';

/**
 * Build a safe MySQL database name from a company code.
 * Example: ACME → company_acme
 */
export function buildTenantDbName(companyCode) {
  const normalized = String(companyCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  if (!normalized) {
    throw new Error('Company code is required to build a database name');
  }

  return `${DB_NAME_PREFIX}${normalized}`;
}

/**
 * Run additive schema ensures against an existing tenant database.
 */
export async function migrateTenantDatabase(
  dbName,
  { forceSrsbInvoiceProfile = false } = {}
) {
  const pool = getTenantPool(dbName);

  await ensureTenantBaseSchema({ pool, dbName });
  await ensureSecuritySchema({ pool, dbName });
  await ensureEmployeeProfileSchema({ pool, dbName });
  await ensureV110Schema({ pool, dbName });
  await ensureV120Schema({
    pool,
    dbName,
    forceSrsbInvoiceProfile
  });

  return pool;
}

/**
 * Migrate every ACTIVE company tenant DB from the master registry.
 * Keeps newly onboarded companies in sync when schema ensures are added later.
 */
export async function migrateAllActiveTenants() {
  const master = getMasterPool();
  const [rows] = await master.query(
    `SELECT code, db_name FROM companies
     WHERE status = 'ACTIVE' AND db_name IS NOT NULL AND db_name <> ''
     ORDER BY id ASC`
  );

  for (const row of rows) {
    const isDefault =
      row.db_name === env.dbName ||
      row.code === env.defaultCompanyCode;
    console.log(
      `Migrating tenant schema: ${row.code} → ${row.db_name}`
    );
    await migrateTenantDatabase(row.db_name, {
      forceSrsbInvoiceProfile: Boolean(isDefault)
    });
  }

  return rows.length;
}

/**
 * Create a new company database and apply the full tenant schema.
 * Does not insert the master `companies` row — callers (onboarding) own that.
 */
export async function provisionTenantDatabase({
  companyCode,
  dbName: explicitDbName
} = {}) {
  const dbName =
    explicitDbName || buildTenantDbName(companyCode);

  await ensureDatabaseExists(dbName);
  const pool = await migrateTenantDatabase(dbName, {
    forceSrsbInvoiceProfile: false
  });

  return { dbName, pool };
}

/**
 * Look up a company in the master registry by code.
 */
export async function findCompanyByCode(companyCode) {
  const code = String(companyCode || '')
    .trim()
    .toUpperCase();
  if (!code) {
    return null;
  }

  const master = getMasterPool();
  const [rows] = await master.query(
    `SELECT id, code, name, display_name, db_name, status, created_at, updated_at
     FROM companies
     WHERE code = ?
     LIMIT 1`,
    [code]
  );

  return rows[0] || null;
}

/**
 * Look up a company in the master registry by id.
 */
export async function findCompanyById(companyId) {
  const master = getMasterPool();
  const [rows] = await master.query(
    `SELECT id, code, name, display_name, db_name, status, created_at, updated_at
     FROM companies
     WHERE id = ?
     LIMIT 1`,
    [companyId]
  );

  return rows[0] || null;
}
