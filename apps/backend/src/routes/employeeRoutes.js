import { Router } from 'express';
import { body } from 'express-validator';
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
  getEmployeeFormMeta,
  listPasswordResetRequests,
  adminResetEmployeePassword,
  rejectPasswordResetRequest
} from '../controllers/employeeController.js';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);


router.get(
  '/form-meta',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'),
  getEmployeeFormMeta
);

router.get(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER'
  ),
  listEmployees
);

router.post(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN'
  ),
  [
    body('employeeId').optional({ checkFalsy: true }).trim(),
    body('username').optional({ checkFalsy: true }).trim().isLength({ min: 3 }),
    body('fullName').trim().isLength({ min: 2 }),
    body('password').isLength({ min: 8 }),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('recoveryEmail').optional({ checkFalsy: true }).isEmail(),
    body('departmentId').isInt({ min: 1 }),
    body('designation').trim().notEmpty(),
    body('managerId').optional({ checkFalsy: true }).isInt({ min: 1 }),
    body('joiningDate').optional({ checkFalsy: true }).isISO8601(),
    validate
  ],
  createEmployee
);

router.put(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN'
  ),
  updateEmployee
);


router.get(
  '/password-reset-requests',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  listPasswordResetRequests
);

router.patch(
  '/:id/reset-password',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [body('newPassword').isLength({ min: 8 }), validate],
  adminResetEmployeePassword
);

router.patch(
  '/password-reset-requests/:requestId/reject',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  rejectPasswordResetRequest
);

router.delete(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN'
  ),
  deleteEmployee
);

export default router;