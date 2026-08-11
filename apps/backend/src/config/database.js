import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import { env } from './env.js';

const tenantContext = new AsyncLocalStorage();
const poolsByDbName = new Map();

let serverPool;
let masterPool;

function buildPoolOptions(database) {
  const options = {
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
    // HRMS dates and punch times are business wall-clock values. Returning
    // DATE/DATETIME as strings prevents Node/MySQL timezone inflation from
    // silently shifting values by +05:30 or -05:30 between environments.
    dateStrings: ['DATE', 'DATETIME']
  };

  if (database) {
    options.database = database;
  }

  return options;
}

function createPoolForDatabase(dbName) {
  return mysql.createPool(buildPoolOptions(dbName));
}

/** Server-level pool (no default database) for CREATE DATABASE / admin DDL. */
export function getServerPool() {
  if (!serverPool) {
    serverPool = mysql.createPool(buildPoolOptions(null));
  }
  return serverPool;
}

/** Master / platform registry pool. */
export function getMasterPool() {
  if (!masterPool) {
    masterPool = createPoolForDatabase(env.masterDbName);
    poolsByDbName.set(env.masterDbName, masterPool);
  }
  return masterPool;
}

/** Cached pool for a specific tenant database name. */
export function getTenantPool(dbName) {
  const name = String(dbName || env.dbName).trim();
  if (!name) {
    throw new Error('Tenant database name is required');
  }

  if (!poolsByDbName.has(name)) {
    poolsByDbName.set(name, createPoolForDatabase(name));
  }

  return poolsByDbName.get(name);
}

/**
 * Active request/tenant pool.
 * Falls back to the default legacy DB (DB_NAME) when no tenant context is set,
 * so existing single-tenant behaviour is unchanged.
 */
export function getPool() {
  const store = tenantContext.getStore();
  if (store?.pool) {
    return store.pool;
  }
  if (store?.dbName) {
    return getTenantPool(store.dbName);
  }
  return getTenantPool(env.dbName);
}

export function getTenantContext() {
  return tenantContext.getStore() || null;
}

/**
 * Run work bound to a tenant database.
 * Controllers that import `pool` will automatically resolve to this tenant.
 */
export function runWithTenant(tenant, fn) {
  if (!tenant?.dbName && !tenant?.pool) {
    throw new Error('runWithTenant requires dbName or pool');
  }

  const pool =
    tenant.pool || getTenantPool(tenant.dbName);

  return tenantContext.run(
    {
      companyId: tenant.companyId ?? null,
      companyCode: tenant.companyCode ?? null,
      dbName: tenant.dbName || null,
      status: tenant.status ?? null,
      pool
    },
    fn
  );
}

/**
 * Backward-compatible pool export.
 * Forwards every access to the ALS-resolved tenant pool (or default DB).
 */
export const pool = new Proxy(
  {},
  {
    get(_target, prop) {
      // Avoid accidental thenable detection on the proxy.
      if (prop === 'then') {
        return undefined;
      }
      const active = getPool();
      const value = active[prop];
      return typeof value === 'function'
        ? value.bind(active)
        : value;
    }
  }
);

export async function testDatabaseConnection(
  targetPool = getPool()
) {
  const connection = await targetPool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function ensureDatabaseExists(dbName) {
  const name = String(dbName || '').trim();
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      `Invalid database name "${dbName}". Use letters, numbers, and underscores only.`
    );
  }

  const admin = getServerPool();
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}
