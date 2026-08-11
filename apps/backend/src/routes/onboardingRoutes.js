import { Router } from 'express';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
  onboardingStatusController,
  registerCompanyController,
  validateActivationController
} from '../controllers/onboardingController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many onboarding attempts. Please wait and try again.'
  }
});

router.get(
  '/status',
  [
    query('companyCode')
      .optional()
      .trim()
      .isLength({ max: 40 })
      .withMessage('Company code is too long.'),
    query('code')
      .optional()
      .trim()
      .isLength({ max: 40 })
      .withMessage('Company code is too long.'),
    validate
  ],
  onboardingStatusController
);

router.post(
  '/validate-activation',
  onboardingLimiter,
  [
    body('activationCode')
      .customSanitizer((value, { req }) => value || req.body.code)
      .trim()
      .notEmpty()
      .withMessage('Activation code is required.'),
    validate
  ],
  validateActivationController
);

router.post(
  '/register-company',
  onboardingLimiter,
  [
    body('activationCode')
      .trim()
      .notEmpty()
      .withMessage('Activation code is required.'),
    body('companyCode')
      .trim()
      .notEmpty()
      .withMessage('Company code is required.')
      .isLength({ min: 3, max: 20 })
      .withMessage('Company code must be 3–20 characters.'),
    body('legalName')
      .trim()
      .notEmpty()
      .withMessage('Legal name is required.'),
    body('displayName')
      .optional()
      .trim()
      .isLength({ max: 220 })
      .withMessage('Display name is too long.'),
    body('admin.fullName')
      .trim()
      .notEmpty()
      .withMessage('Admin full name is required.'),
    body('admin.email')
      .trim()
      .isEmail()
      .withMessage('A valid admin email is required.'),
    body('admin.password')
      .isLength({ min: 8 })
      .withMessage('Admin password must contain at least 8 characters.'),
    body('admin.username')
      .optional({ nullable: true })
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage('Admin username must be 3–80 characters.'),
    validate
  ],
  registerCompanyController
);

export default router;
