import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool, runWithTenant } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { findCompanyByCode } from './tenantProvisioner.js';
import { normalizeCompanyCode } from './onboardingService.js';

const HEAD_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL ||
    'info@srsbworkforcesolutions.com'
)
  .trim()
  .toLowerCase();

function invalidLogin() {
  throw new AppError('Invalid login ID or password.', 401);
}

/**
 * Resolve a company from the master registry for login / recovery.
 * Falls back to the default company code when omitted (legacy SRSB clients).
 */
export async function resolveTenantCompany(companyCode) {
  const code =
    normalizeCompanyCode(companyCode) ||
    env.defaultCompanyCode;

  if (!code) {
    throw new AppError('Company code is required.', 400);
  }

  const company = await findCompanyByCode(code);
  if (!company) {
    throw new AppError(
      'Unknown company code. Check the code or complete company setup.',
      404
    );
  }

  if (company.status === 'SUSPENDED') {
    throw new AppError(
      'This company is suspended. Contact the platform administrator.',
      403
    );
  }

  if (company.status !== 'ACTIVE') {
    throw new AppError(
      'This company is not active yet. Complete setup or contact support.',
      403
    );
  }

  return {
    companyId: company.id,
    companyCode: company.code,
    companyName: company.display_name || company.name,
    dbName: company.db_name,
    status: company.status
  };
}

function buildToken(account, tenant) {
  return jwt.sign(
    {
      id: account.id,
      employeeId: account.employee_id,
      username: account.username,
      email: account.email,
      role: account.role,
      accountType: account.account_type,
      fullName: account.full_name,
      companyId: tenant.companyId,
      companyCode: tenant.companyCode,
      dbName: tenant.dbName
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export async function login(loginId, password, companyCode) {
  const tenant = await resolveTenantCompany(companyCode);
  const normalizedLogin = String(loginId || '')
    .trim()
    .toLowerCase();

  return runWithTenant(tenant, async () => {
    const [rows] = await pool.query(
      `SELECT
         e.id,
         e.employee_id,
         e.username,
         e.full_name,
         e.email,
         e.recovery_email,
         e.password_hash,
         e.role,
         e.account_type,
         e.designation,
         e.status,
         d.name AS department
       FROM employees e
       LEFT JOIN departments d
         ON d.id = e.department_id
       WHERE LOWER(COALESCE(e.email, '')) = ?
          OR LOWER(COALESCE(e.employee_id, '')) = ?
          OR LOWER(COALESCE(e.username, '')) = ?
       LIMIT 1`,
      [normalizedLogin, normalizedLogin, normalizedLogin]
    );

    const account = rows[0];

    if (!account || account.status !== 'ACTIVE') {
      invalidLogin();
    }

    const isSystemAccount = account.account_type === 'SYSTEM';

    if (isSystemAccount) {
      const accountEmail = String(account.email || '')
        .trim()
        .toLowerCase();

      // Platform Head Admin (SYSTEM) is only valid for the default tenant
      // and must match the configured SUPER_ADMIN_EMAIL.
      if (
        account.role !== 'SUPER_ADMIN' ||
        normalizedLogin !== accountEmail ||
        accountEmail !== HEAD_ADMIN_EMAIL ||
        tenant.companyCode !== env.defaultCompanyCode
      ) {
        invalidLogin();
      }
    }
    // Company-scoped SUPER_ADMIN (account_type EMPLOYEE) is allowed so each
    // tenant can have a head admin with full in-company privileges.

    const isValid = await bcrypt.compare(
      String(password || ''),
      account.password_hash
    );

    if (!isValid) {
      invalidLogin();
    }

    const token = buildToken(account, tenant);

    delete account.password_hash;
    account.accountType = account.account_type;
    delete account.account_type;

    account.companyId = tenant.companyId;
    account.companyCode = tenant.companyCode;
    account.companyName = tenant.companyName;
    account.dbName = tenant.dbName;

    return {
      token,
      user: account,
      company: {
        id: tenant.companyId,
        code: tenant.companyCode,
        name: tenant.companyName,
        dbName: tenant.dbName
      }
    };
  });
}

/**
 * Run a callback against the tenant DB for the given company code.
 * Used by password recovery and other pre-auth flows.
 */
export async function withTenantByCompanyCode(companyCode, fn) {
  const tenant = await resolveTenantCompany(companyCode);
  return runWithTenant(tenant, () => fn(tenant));
}
