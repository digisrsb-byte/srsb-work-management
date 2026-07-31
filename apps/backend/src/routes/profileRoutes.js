import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getMyProfile,
  updateMyProfile,
  saveMyAddress,
  saveMyEmergencyContact,
  changeMyPassword
} from '../controllers/profileController.js';

const router = Router();

router.use(authenticate);

router.get('/me', getMyProfile);

router.put(
  '/me',
  [
    body('fullName')
      .optional({ nullable: true })
      .trim(),

    body('personalEmail')
      .optional({ nullable: true })
      .isEmail()
      .withMessage('Enter a valid personal email address.'),

    body('phone')
      .optional({ nullable: true })
      .trim(),

    body('alternatePhone')
      .optional({ nullable: true })
      .trim(),

    body('dateOfBirth')
      .optional({ nullable: true })
      .isISO8601()
      .withMessage('Enter a valid date of birth.'),

    body('gender')
      .optional({ nullable: true })
      .isIn(['MALE', 'FEMALE', 'OTHER'])
      .withMessage('Select a valid gender.'),

    body('bloodGroup')
      .optional({ nullable: true })
      .trim(),

    body('maritalStatus')
      .optional({ nullable: true })
      .isIn(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'])
      .withMessage('Select a valid marital status.'),

    body('workLocation')
      .optional({ nullable: true })
      .trim(),

    validate
  ],
  updateMyProfile
);

router.put(
  '/address',
  [
    body('addressType')
      .isIn(['CURRENT', 'PERMANENT'])
      .withMessage('Select current or permanent address.'),

    body('addressLine1')
      .trim()
      .notEmpty()
      .withMessage('Address line is required.'),

    body('addressLine2')
      .optional({ nullable: true })
      .trim(),

    body('city')
      .trim()
      .notEmpty()
      .withMessage('City is required.'),

    body('state')
      .trim()
      .notEmpty()
      .withMessage('State is required.'),

    body('postalCode')
      .trim()
      .notEmpty()
      .withMessage('Postal code is required.'),

    body('country')
      .optional({ nullable: true })
      .trim(),

    validate
  ],
  saveMyAddress
);

router.put(
  '/emergency-contact',
  [
    body('contactName')
      .trim()
      .notEmpty()
      .withMessage('Emergency contact name is required.'),

    body('relationship')
      .trim()
      .notEmpty()
      .withMessage('Relationship is required.'),

    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Emergency contact phone is required.'),

    body('alternatePhone')
      .optional({ nullable: true })
      .trim(),

    validate
  ],
  saveMyEmergencyContact
);

router.put(
  '/password',
 allowRoles(
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER',
  'RECRUITER',
  'EMPLOYEE'
),
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required.'),

    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters.'),

    validate
  ],
  changeMyPassword
);
export default router;