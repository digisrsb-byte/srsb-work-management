import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getCompanyReport,
  getHeadcountReport,
  getAttendanceReport,
  getPayrollReport,
  getClientWiseReport,
  exportReportAudit,
  getOpsSummary
} from '../controllers/reportController.js';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const reportRoles = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];

router.use(authenticate);

router.get(
  '/',
  allowRoles(...reportRoles),
  [
    query('startDate').isISO8601().withMessage('A valid start date is required.'),
    query('endDate').isISO8601().withMessage('A valid end date is required.'),
    validate
  ],
  getCompanyReport
);

router.get('/ops-summary', allowRoles(...reportRoles), getOpsSummary);

router.get('/headcount', allowRoles(...reportRoles), getHeadcountReport);

router.get(
  '/attendance',
  allowRoles(...reportRoles),
  [
    query('startDate').isISO8601(),
    query('endDate').isISO8601(),
    validate
  ],
  getAttendanceReport
);

router.get('/payroll', allowRoles(...reportRoles), getPayrollReport);

router.get(
  '/clients',
  allowRoles(...reportRoles),
  [
    query('startDate').isISO8601(),
    query('endDate').isISO8601(),
    validate
  ],
  getClientWiseReport
);

router.post(
  '/export',
  allowRoles(...reportRoles),
  [body('reportType').trim().notEmpty()],
  validate,
  exportReportAudit
);

export default router;
