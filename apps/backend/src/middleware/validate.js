import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Please correct the highlighted fields.', 422, errors.array()));
  }
  next();
}
