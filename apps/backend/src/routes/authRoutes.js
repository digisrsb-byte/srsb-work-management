import { Router } from 'express';
import { body } from 'express-validator';
import { loginController, meController } from '../controllers/authController.js';
import { requestPasswordReset, resetPrivilegedPasswordWithOtp } from '../controllers/passwordResetController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.post('/login', [
  body('loginId').trim().notEmpty().withMessage('Employee ID, username or email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
  validate
], loginController);
router.post('/forgot-password', [
  body('identifier').trim().notEmpty().withMessage('Employee ID, username or email is required.'),
  validate
], requestPasswordReset);
router.post('/reset-privileged-password', [
  body('identifier').trim().notEmpty(),
  body('otp').trim().matches(/^\d{6}$/).withMessage('A valid 6-digit OTP is required.'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must contain at least 8 characters.'),
  validate
], resetPrivilegedPasswordWithOtp);
router.get('/me', authenticate, meController);
export default router;
