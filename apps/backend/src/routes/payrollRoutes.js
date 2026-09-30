import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getEmployeeSalarySetup,
  upsertEmployeeSalarySetup,
  previewSalaryCalculation,
  getSalaryConfig,
  updateSalaryConfig,
  listPayrollRuns,
  createPayrollRun,
  getPayrollRun,
  getPayrollDashboard,
  calculatePayrollRun,
  submitPayrollRun,
  approvePayrollRun,
  lockPayrollRun,
  markPayrollPaid,
  reopenPayrollRun,
  listMyPayslips,
  listScopedPayslips,
  getPayslip,
  getRunEmployeePayslip,
  getRunEmailDeliveries,
  retryRunEmailDeliveries,
  resendPayslipEmail
} from '../controllers/payrollController.js';

const router = Router();
const adminRoles = ['SUPER_ADMIN', 'ADMIN', 'HR'];
const payslipStaffRoles = ['ADMIN', 'HR', 'MANAGER'];

router.use(authenticate);

router.get('/me/payslips', listMyPayslips);
router.get(
  '/payslips',
  allowRoles('SUPER_ADMIN', ...payslipStaffRoles),
  listScopedPayslips
);
router.get('/payslips/:payslipId', [param('payslipId').isInt({ min: 1 })], validate, getPayslip);

router.get(
  '/config',
  allowRoles(...adminRoles),
  getSalaryConfig
);

router.put(
  '/config',
  allowRoles(...adminRoles),
  [body('companyId').isInt({ min: 1 })],
  validate,
  updateSalaryConfig
);

router.post(
  '/calculate-preview',
  allowRoles(...adminRoles),
  [body('annualCtc').isFloat({ gt: 0 })],
  validate,
  previewSalaryCalculation
);

router.get(
  '/employee/:employeeId/setup',
  allowRoles(...adminRoles, 'MANAGER'),
  [param('employeeId').isInt({ min: 1 })],
  validate,
  getEmployeeSalarySetup
);

router.put(
  '/employee/:employeeId/setup',
  allowRoles(...adminRoles),
  [param('employeeId').isInt({ min: 1 })],
  validate,
  upsertEmployeeSalarySetup
);

router.get('/runs', allowRoles(...adminRoles, 'MANAGER'), listPayrollRuns);

router.get('/dashboard', allowRoles(...adminRoles, 'MANAGER'), getPayrollDashboard);

router.post(
  '/runs',
  allowRoles(...adminRoles),
  [
    body('companyId').isInt({ min: 1 }),
    body('periodYear').isInt({ min: 2000 }),
    body('periodMonth').isInt({ min: 1, max: 12 })
  ],
  validate,
  createPayrollRun
);

router.get(
  '/runs/:runId',
  allowRoles(...adminRoles, 'MANAGER'),
  [param('runId').isInt({ min: 1 })],
  validate,
  getPayrollRun
);

router.post(
  '/runs/:runId/calculate',
  allowRoles(...adminRoles),
  [param('runId').isInt({ min: 1 })],
  validate,
  calculatePayrollRun
);

router.post(
  '/runs/:runId/submit',
  allowRoles(...adminRoles),
  [param('runId').isInt({ min: 1 })],
  validate,
  submitPayrollRun
);

router.post(
  '/runs/:runId/approve',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('runId').isInt({ min: 1 })],
  validate,
  approvePayrollRun
);

router.post(
  '/runs/:runId/lock',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('runId').isInt({ min: 1 })],
  validate,
  lockPayrollRun
);

router.post(
  '/runs/:runId/payment',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('runId').isInt({ min: 1 })],
  validate,
  markPayrollPaid
);

router.post(
  '/runs/:runId/release',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('runId').isInt({ min: 1 })],
  validate,
  markPayrollPaid
);

router.get(
  '/runs/:runId/employees/:employeeId/payslip',
  allowRoles(...adminRoles),
  [param('runId').isInt({ min: 1 }), param('employeeId').isInt({ min: 1 })],
  validate,
  getRunEmployeePayslip
);

router.get(
  '/runs/:runId/email-deliveries',
  allowRoles(...adminRoles),
  [param('runId').isInt({ min: 1 })],
  validate,
  getRunEmailDeliveries
);

router.post(
  '/runs/:runId/email-deliveries/retry',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('runId').isInt({ min: 1 })],
  validate,
  retryRunEmailDeliveries
);

router.post(
  '/runs/:runId/email-deliveries/:deliveryId/resend',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'),
  [param('runId').isInt({ min: 1 }), param('deliveryId').isInt({ min: 1 })],
  validate,
  resendPayslipEmail
);

router.post(
  '/runs/:runId/reopen',
  allowRoles('SUPER_ADMIN'),
  [param('runId').isInt({ min: 1 }), body('reason').trim().notEmpty()],
  validate,
  reopenPayrollRun
);

export default router;
