import { Router } from 'express';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';
import {
  myAttendance,
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

const router = Router();

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
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  listEmployeeAttendance
);

export default router;
