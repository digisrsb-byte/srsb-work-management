import { Router } from 'express';
import { body } from 'express-validator';
import {
  listCandidates,
  createCandidate,
  updateCandidateStage
} from '../controllers/candidateController.js';
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
  listCandidates
);

router.post(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER',
    'EMPLOYEE'
  ),
  [
    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Candidate name is required.'),

    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage('Enter a valid email address.'),

    body('phone')
      .optional({ checkFalsy: true })
      .trim(),

    body('openingId')
      .optional({ checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage('Select a valid job opening.'),

    body('stage')
      .optional()
      .isIn([
        'SOURCED',
        'SCREENING',
        'SHORTLISTED',
        'INTERVIEW',
        'OFFERED',
        'JOINED',
        'REJECTED',
        'WITHDRAWN'
      ])
      .withMessage('Select a valid candidate stage.'),

    validate
  ],
  createCandidate
);

router.put(
  '/applications/:applicationId/stage',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER',
    'EMPLOYEE'
  ),
  [
    body('stage')
      .isIn([
        'SOURCED',
        'SCREENING',
        'SHORTLISTED',
        'INTERVIEW',
        'OFFERED',
        'JOINED',
        'REJECTED',
        'WITHDRAWN'
      ])
      .withMessage('Select a valid candidate stage.'),

    validate
  ],
  updateCandidateStage
);

export default router;