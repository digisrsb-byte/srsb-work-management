import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createAccessRequest,
  listAccessRequests,
  decideAccessRequest
} from '../controllers/accessRequestController.js';

const router = Router();

router.use(authenticate);

router.get('/', listAccessRequests);

router.post(
  '/',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'RECRUITER'),
  [body('requestedAction').trim().notEmpty()],
  validate,
  createAccessRequest
);

router.patch(
  '/:requestId/decision',
  allowRoles('SUPER_ADMIN'),
  [
    param('requestId').isInt({ min: 1 }),
    body('decision').isIn(['APPROVED', 'REJECTED'])
  ],
  validate,
  decideAccessRequest
);

export default router;
