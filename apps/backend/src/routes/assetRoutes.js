import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getAssetSummary,
  listAssets,
  createAsset,
  getAsset,
  assignAsset,
  assignAssetsBulk,
  acknowledgeAsset,
  returnAsset,
  transferAsset,
  createServiceRecord,
  resolveServiceRecord,
  listRepairs,
  retireAsset,
  listMyAssets,
  listEmployeeAssetRecords,
  listEmployeeAssets,
  offboardingAssetReturns
} from '../controllers/assetController.js';

const router = Router();
const adminRoles = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
const manageRoles = ['SUPER_ADMIN', 'ADMIN', 'HR'];

router.use(authenticate);

router.get('/mine', listMyAssets);

router.get('/summary', allowRoles(...adminRoles), getAssetSummary);

router.get('/employee-records', allowRoles(...adminRoles), listEmployeeAssetRecords);

router.get('/repairs', allowRoles(...adminRoles), listRepairs);

router.get(
  '/employee/:employeeId',
  allowRoles(...adminRoles),
  [param('employeeId').isInt({ min: 1 })],
  validate,
  listEmployeeAssets
);

router.get(
  '/offboarding/:employeeId',
  allowRoles(...adminRoles),
  [param('employeeId').isInt({ min: 1 })],
  validate,
  offboardingAssetReturns
);

router.get('/', allowRoles(...adminRoles), listAssets);

router.post(
  '/',
  allowRoles(...manageRoles),
  [
    body('companyId').isInt({ min: 1 }),
    body('category').trim().notEmpty(),
    body('assetTag').trim().notEmpty()
  ],
  validate,
  createAsset
);

router.post(
  '/assign-bulk',
  allowRoles(...manageRoles),
  [
    body('employeeId').isInt({ min: 1 }),
    body('assetIds').isArray({ min: 1 })
  ],
  validate,
  assignAssetsBulk
);

router.get(
  '/:assetId',
  allowRoles(...adminRoles),
  [param('assetId').isInt({ min: 1 })],
  validate,
  getAsset
);

router.post(
  '/:assetId/assign',
  allowRoles(...manageRoles),
  [param('assetId').isInt({ min: 1 }), body('employeeId').isInt({ min: 1 })],
  validate,
  assignAsset
);

router.post(
  '/:assetId/transfer',
  allowRoles(...manageRoles),
  [param('assetId').isInt({ min: 1 }), body('employeeId').isInt({ min: 1 })],
  validate,
  transferAsset
);

router.post(
  '/:assetId/return',
  allowRoles(...manageRoles),
  [param('assetId').isInt({ min: 1 })],
  validate,
  returnAsset
);

router.post(
  '/:assetId/retire',
  allowRoles(...manageRoles),
  [param('assetId').isInt({ min: 1 })],
  validate,
  retireAsset
);

router.post(
  '/:assetId/service',
  [param('assetId').isInt({ min: 1 })],
  validate,
  createServiceRecord
);

router.patch(
  '/:assetId/service/:serviceId/resolve',
  allowRoles(...manageRoles),
  [
    param('assetId').isInt({ min: 1 }),
    param('serviceId').isInt({ min: 1 })
  ],
  validate,
  resolveServiceRecord
);

router.post(
  '/assignments/:assignmentId/acknowledge',
  [param('assignmentId').isInt({ min: 1 })],
  validate,
  acknowledgeAsset
);

export default router;
