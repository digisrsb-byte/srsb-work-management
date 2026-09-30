import { Router } from 'express';
import { body } from 'express-validator';
import {
  loginController,
  meController
} from '../controllers/authController.js';
import {
  requestPasswordReset,
  resetPrivilegedPasswordWithOtp
} from '../controllers/passwordResetController.js';
import {
  completeInvitation,
  verifyInvitation
} from '../controllers/invitationController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post(
  '/login',
  [
    body('companyCode')
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 40 })
      .withMessage('Company code is too long.'),
    body('loginId')
      .trim()
      .notEmpty()
      .withMessage('Official email or Employee ID is required.'),
    body('password')
      .notEmpty()
      .withMessage('Password is required.'),
    validate
  ],
  loginController
);

router.post(
  '/forgot-password',
  [
    body('companyCode')
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 40 })
      .withMessage('Company code is too long.'),
    body('identifier')
      .trim()
      .notEmpty()
      .withMessage('Official email or Employee ID is required.'),
    validate
  ],
  requestPasswordReset
);

router.post(
  '/reset-privileged-password',
  [
    body('companyCode')
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 40 })
      .withMessage('Company code is too long.'),
    body('identifier')
      .trim()
      .isEmail()
      .withMessage('A valid Super Admin email is required.'),
    body('otp')
      .trim()
      .matches(/^\d{6}$/)
      .withMessage('A valid 6-digit OTP is required.'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must contain at least 8 characters.'),
    validate
  ],
  resetPrivilegedPasswordWithOtp
);

router.post(
  '/invitations/verify',
  [
    body('token').isString().trim().isLength({ min: 20, max: 200 }).withMessage('This activation link is invalid.'),
    body('companyCode').optional({ nullable: true }).trim().isLength({ max: 40 }).withMessage('Company code is too long.'),
    validate
  ],
  verifyInvitation
);

router.post(
  '/invitations/accept',
  [
    body('token').isString().trim().isLength({ min: 20, max: 200 }).withMessage('This activation link is invalid.'),
    body('companyCode').optional({ nullable: true }).trim().isLength({ max: 40 }).withMessage('Company code is too long.'),
    body('password').isString().isLength({ min: 8, max: 128 }).withMessage('Password must be 8 to 128 characters long.'),
    validate
  ],
  completeInvitation
);

router.get('/me', authenticate, meController);

export default router;
