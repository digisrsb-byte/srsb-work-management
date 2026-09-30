import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  myAttendance,
  myAttendanceCalendar,
  myAttendanceHistory,
  MAX_HISTORY_DAYS,
  punchIn,
  punchOut,
  listEmployeeAttendance,
  attendanceCalendar,
  attendanceDayOverview,
  adminAdjustAttendance
} from '../controllers/attendanceController.js';
import {
  todayAttendanceSummary,
  startAttendanceBreak,
  endAttendanceBreak,
  adminAttendanceBreaks
} from '../controllers/attendanceBreakController.js';
import {
  createAttendanceCorrection,
  listMyAttendanceCorrections,
  cancelAttendanceCorrection,
  listAttendanceCorrections,
  approveAttendanceCorrection,
  rejectAttendanceCorrection,
  manualAttendanceOverride
} from '../controllers/attendanceCorrectionWorkflowController.js';

const router = Router();
const reviewRoles = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
const overrideRoles = ['SUPER_ADMIN', 'ADMIN', 'HR'];

router.use(authenticate);

router.post('/punch-in', punchIn);
router.post('/punch-out', punchOut);

router.get(
  '/today-summary',
  todayAttendanceSummary
);

router.post(
  '/break/start',
  startAttendanceBreak
);

router.post(
  '/break/end',
  endAttendanceBreak
);

router.get('/my-records', myAttendance);
router.get('/calendar', attendanceCalendar);

router.get(
  '/day-overview',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  attendanceDayOverview
);

router.get(
  '/admin-breaks',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  adminAttendanceBreaks
);

router.put(
  '/admin-adjust',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  adminAdjustAttendance
);

router.get(
  '/my-calendar',
  [
    query('month')
      .optional()
      .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
      .withMessage('Month must be in YYYY-MM format.')
  ],
  validate,
  myAttendanceCalendar
);
router.get(
  '/my-history',
  [
    query('days')
      .optional()
      .isInt({ min: 1, max: MAX_HISTORY_DAYS })
      .withMessage(`Days must be between 1 and ${MAX_HISTORY_DAYS}.`)
  ],
  validate,
  myAttendanceHistory
);

router.get(
  '/',
  allowRoles(...reviewRoles),
  listEmployeeAttendance
);

router.post(
  '/corrections',
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Valid date required (YYYY-MM-DD)'),
    body('reason').trim().notEmpty(),
    body('requestedPunchIn').notEmpty(),
    body('requestedPunchOut').notEmpty(),
    body('requestedStatus').optional().isIn(['PRESENT', 'HALF_DAY'])
  ],
  validate,
  createAttendanceCorrection
);

router.get('/corrections/mine', listMyAttendanceCorrections);

router.post(
  '/corrections/:id/cancel',
  [param('id').isInt({ min: 1 })],
  validate,
  cancelAttendanceCorrection
);

router.get(
  '/corrections',
  allowRoles(...reviewRoles),
  listAttendanceCorrections
);

router.post(
  '/corrections/:id/approve',
  allowRoles(...reviewRoles),
  [param('id').isInt({ min: 1 })],
  validate,
  approveAttendanceCorrection
);

router.post(
  '/corrections/:id/reject',
  allowRoles(...reviewRoles),
  [param('id').isInt({ min: 1 }), body('reason').trim().notEmpty()],
  validate,
  rejectAttendanceCorrection
);

router.post(
  '/override',
  allowRoles(...overrideRoles),
  [
    body('employeeId').isInt({ min: 1 }),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/),
    body('status').isIn(['PRESENT', 'HALF_DAY', 'ABSENT']),
    body('reason').trim().notEmpty()
  ],
  validate,
  manualAttendanceOverride
);

export default router;
