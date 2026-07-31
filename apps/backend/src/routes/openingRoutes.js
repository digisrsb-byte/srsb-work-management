import { Router } from 'express';
import { body } from 'express-validator';
import {
  createOpening,
  listOpenings,
  getOpeningById,
  updateOpening
} from '../controllers/openingController.js';
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
    'MANAGER',
    'RECRUITER',
    'EMPLOYEE'
  ),
  listOpenings
);

router.get(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER',
    'EMPLOYEE'
  ),
  getOpeningById
);

router.post(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER'
  ),
  [
    body('clientId')
      .isInt({ min: 1 })
      .withMessage('Select a valid client.'),

    body('title')
      .trim()
      .notEmpty()
      .withMessage('Job role is required.'),

    body('openingsCount')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Openings count must be at least 1.'),

    body('priority')
      .optional()
      .isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
      .withMessage('Select a valid priority.'),

    body('status')
      .optional()
      .isIn([
        'OPEN',
        'SOURCING',
        'SCREENING',
        'INTERVIEW',
        'OFFERED',
        'JOINED',
        'CLOSED',
        'ON_HOLD'
      ])
      .withMessage('Select a valid status.'),

    validate
  ],
  createOpening
);

router.put(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER'
  ),
  [
    body('clientId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Select a valid client.'),

    body('title')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Job role cannot be empty.'),

    body('openingsCount')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Openings count must be at least 1.'),

    validate
  ],
  updateOpening
);

export default router;