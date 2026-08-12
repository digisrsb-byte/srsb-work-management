import { Router } from 'express';
import { body } from 'express-validator';
import {
  getMyTenantSettings,
  getPublicTenantBranding,
  updateMyTenantSettings
} from '../controllers/tenantController.js';
import {
  allowRoles,
  authenticate
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Public and safe: used on the login screen after a user enters Company Code.
router.get(
  '/public/:tenantCode',
  getPublicTenantBranding
);

router.use(authenticate);

router.get(
  '/me',
  getMyTenantSettings
);

router.put(
  '/me',
  allowRoles('SUPER_ADMIN'),
  [
    body('companyName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage(
        'Company name cannot be empty.'
      ),
    body('legalName')
      .optional({
        nullable: true
      })
      .trim(),
    body('invoiceEmail')
      .optional({
        nullable: true,
        checkFalsy: true
      })
      .trim()
      .isEmail()
      .withMessage(
        'Invoice email must be a valid email address.'
      ),
    body('logoDataUrl')
      .optional({
        nullable: true
      }),
    body('primaryColor')
      .optional({
        nullable: true
      })
      .trim(),
    body('secondaryColor')
      .optional({
        nullable: true
      })
      .trim(),
    validate
  ],
  updateMyTenantSettings
);

export default router;
