import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // The submitted value is left out so it is never echoed back or written to logs.
    const details = errors.array().map(({ value, ...rest }) => rest);
    return next(new AppError('Please correct the highlighted fields.', 422, details));
  }
  next();
}
