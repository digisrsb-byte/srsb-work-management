import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getCompanyProfile,
  updateCompanyProfile,
  listOfficeShifts,
  upsertOfficeShift,
  listHolidays,
  createHoliday,
  deleteHoliday
} from '../controllers/companyConfigController.js';

const router = Router();
const adminRoles = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];

router.use(authenticate);

router.get('/holidays', allowRoles(...adminRoles), listHolidays);
router.post(
  '/holidays',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [body('holidayName').trim().notEmpty(), body('holidayDate').notEmpty()],
  validate,
  createHoliday
);
router.delete(
  '/holidays/:holidayId',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('holidayId').isInt({ min: 1 })],
  validate,
  deleteHoliday
);

router.get(
  '/:companyId/profile',
  allowRoles(...adminRoles),
  [param('companyId').isInt({ min: 1 })],
  validate,
  getCompanyProfile
);

router.put(
  '/:companyId/profile',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('companyId').isInt({ min: 1 }), body('name').trim().notEmpty()],
  validate,
  updateCompanyProfile
);

router.get(
  '/:companyId/shifts',
  allowRoles(...adminRoles),
  [param('companyId').isInt({ min: 1 })],
  validate,
  listOfficeShifts
);

router.post(
  '/:companyId/shifts',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('companyId').isInt({ min: 1 }), body('name').trim().notEmpty()],
  validate,
  upsertOfficeShift
);

export default router;
