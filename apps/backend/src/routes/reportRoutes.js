import { Router } from 'express';
import { query } from 'express-validator';
import {
  getCompanyReport
} from '../controllers/reportController.js';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  [
    query('startDate')
      .isISO8601()
      .withMessage('A valid start date is required.'),

    query('endDate')
      .isISO8601()
      .withMessage('A valid end date is required.'),

    validate
  ],
  getCompanyReport
);

export default router;