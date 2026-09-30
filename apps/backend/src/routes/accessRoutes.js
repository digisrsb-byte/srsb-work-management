import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listCompanies,
  createCompany,
  listAdmins,
  getAdminScopes,
  updateAdminScopes,
  getRolePermissionMatrix,
  updateRolePermission
} from '../controllers/companyController.js';

const router = Router();

router.use(authenticate);

router.get(
  '/companies',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'),
  listCompanies
);

router.post(
  '/companies',
  allowRoles('SUPER_ADMIN'),
  [
    body('code').trim().notEmpty(),
    body('name').trim().notEmpty()
  ],
  validate,
  createCompany
);

router.get(
  '/admins',
  allowRoles('SUPER_ADMIN'),
  listAdmins
);

router.get(
  '/admins/:id/scopes',
  allowRoles('SUPER_ADMIN'),
  [param('id').isInt({ min: 1 })],
  validate,
  getAdminScopes
);

router.put(
  '/admins/:id/scopes',
  allowRoles('SUPER_ADMIN'),
  [param('id').isInt({ min: 1 })],
  validate,
  updateAdminScopes
);

router.get(
  '/permissions',
  allowRoles('SUPER_ADMIN'),
  getRolePermissionMatrix
);

router.get(
  '/permissions/:role',
  allowRoles('SUPER_ADMIN'),
  getRolePermissionMatrix
);

router.put(
  '/permissions/:role',
  allowRoles('SUPER_ADMIN'),
  [
    param('role').notEmpty(),
    body('module').trim().notEmpty()
  ],
  validate,
  updateRolePermission
);

export default router;
