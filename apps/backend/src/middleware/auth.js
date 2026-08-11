import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { runWithTenant } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { findCompanyById, findCompanyByCode } from '../services/tenantProvisioner.js';

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
