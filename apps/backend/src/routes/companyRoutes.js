import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getCompanySettings,
  getPublicBranding,
  updateCompanySettings
} from '../controllers/companySettingsController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get(
  '/branding',
  [
    query('companyCode')
      .optional()
      .trim()
      .isLength({ max: 40 }),
    query('code').optional().trim().isLength({ max: 40 }),
    validate
  ],
  getPublicBranding
);

router.get(
  '/settings',
  authenticate,
  getCompanySettings
);

router.put(
  '/settings',
  authenticate,
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [
    body('legalName')
      .trim()
      .notEmpty()
      .withMessage('Legal name is required.'),
    body('displayName')
      .optional()
      .trim()
      .isLength({ max: 220 }),
    validate
  ],
  updateCompanySettings
);

export default router;
