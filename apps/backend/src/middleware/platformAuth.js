import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Protects platform-ops routes with PLATFORM_ADMIN_KEY.
 * Accepts `X-Platform-Key` header or `Authorization: Bearer <key>`.
 */
export function requirePlatformKey(req, _res, next) {
  if (!env.platformAdminKey) {
    return next(
      new AppError(
        'Platform admin API is disabled. Set PLATFORM_ADMIN_KEY or use the CLI scripts.',
        503
      )
    );
  }

  const headerKey = String(req.headers['x-platform-key'] || '').trim();
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ')
    ? auth.slice(7).trim()
    : '';
  const provided = headerKey || bearer;

  if (!provided || provided !== env.platformAdminKey) {
    return next(new AppError('Invalid platform admin key.', 401));
  }

  return next();
}
