import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError('Authentication required.', 401));

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch {
    next(new AppError('Invalid or expired login session.', 401));
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission for this action.', 403));
    }
    next();
  };
}
