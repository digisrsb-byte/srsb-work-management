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

const router = Router();

router.use(authenticate);

router.post('/punch-in', punchIn);
router.post('/punch-out', punchOut);
router.get('/my-records', myAttendance);

router.get('/calendar', attendanceCalendar);

router.get(
  '/day-overview',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  attendanceDayOverview
);

router.put(
  '/admin-adjust',
  allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'),
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