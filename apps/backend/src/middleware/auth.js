import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { runWithTenant } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { findCompanyById, findCompanyByCode } from '../services/tenantProvisioner.js';
import {
  assertPermission,
  assertCompanyAccess
} from '../services/permissionService.js';

// A joiner who is not yet activated holds an onboarding-only session: it reaches their own
// onboarding case, notifications and password change, and nothing else.
const ONBOARDING_ONLY_ROUTES = [
  { methods: ['GET', 'POST'], pattern: /^\/api\/onboarding(\/|\?|$)/ },
  { methods: ['GET', 'PUT'], pattern: /^\/api\/notifications(\/|\?|$)/ },
  { methods: ['GET'], pattern: /^\/api\/auth\/me(\?|$)/ },
  { methods: ['GET'], pattern: /^\/api\/profile\/me(\?|$)/ },
  { methods: ['PUT'], pattern: /^\/api\/profile\/password(\?|$)/ }
];

function isAllowedForOnboardingOnly(req) {
  const url = req.originalUrl || '';
  return ONBOARDING_ONLY_ROUTES.some(
    (route) => route.methods.includes(req.method) && route.pattern.test(url)
  );
}

/**
 * Verify JWT and bind the request to the company tenant pool via ALS.
 * Onboarding / public routes should not use this middleware.
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return next(new AppError('Authentication required.', 401));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return next(
      new AppError('Invalid or expired login session.', 401)
    );
  }

  if (payload.onboardingOnly && !isAllowedForOnboardingOnly(req)) {
    return next(
      new AppError(
        'Your account is limited to onboarding until HR activates it. Complete your onboarding checklist, then sign in again after activation.',
        403
      )
    );
  }

  const companyCode =
    payload.companyCode || env.defaultCompanyCode;
  const dbName = payload.dbName || env.dbName;
  const companyId = payload.companyId || null;

  req.user = {
    ...payload,
    companyId,
    companyCode,
    dbName
  };

  // Re-check company status so suspended tenants lose access immediately.
  Promise.resolve()
    .then(async () => {
      let company = null;
      if (companyId) {
        company = await findCompanyById(companyId);
      } else if (companyCode) {
        company = await findCompanyByCode(companyCode);
      }

      if (!company) {
        throw new AppError(
          'Company workspace was not found for this session.',
          401
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
          'This company workspace is not active.',
          403
        );
      }

      // Prefer live registry values over stale JWT claims.
      req.user.companyId = company.id;
      req.user.companyCode = company.code;
      req.user.dbName = company.db_name;

      runWithTenant(
        {
          companyId: company.id,
          companyCode: company.code,
          dbName: company.db_name,
          status: company.status
        },
        () => next()
      );
    })
    .catch(next);
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have permission for this action.',
          403
        )
      );
    }
    next();
  };
}

/**
 * Only the platform head Super Admin on the default company (SRSB)
 * may manage activation codes from the app UI.
 */
export function requireSrsbHeadAdmin(req, res, next) {
  const email = String(req.user?.email || '')
    .trim()
    .toLowerCase();
  const companyCode = String(req.user?.companyCode || '')
    .trim()
    .toUpperCase();
  const expectedEmail = String(env.superAdminEmail || '')
    .trim()
    .toLowerCase();

  const allowed =
    req.user?.role === 'SUPER_ADMIN' &&
    companyCode === env.defaultCompanyCode &&
    email &&
    expectedEmail &&
    email === expectedEmail;

  if (!allowed) {
    return next(
      new AppError(
        'Only the SRSB Head Super Admin can manage activation codes.',
        403
      )
    );
  }

  return next();
}

export function requirePermission(module, action) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }
      await assertPermission(req.user, module, action);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * `companyId` here is an employer entity inside the tenant DB
 * (`companies` table), not the master registry id on `req.user.companyId`.
 */
export function requireCompanyAccess(getCompanyId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }
      const companyId =
        typeof getCompanyId === 'function'
          ? await getCompanyId(req)
          : req.params.companyId || req.body.companyId;
      await assertCompanyAccess(req.user, Number(companyId));
      next();
    } catch (error) {
      next(error);
    }
  };
}
