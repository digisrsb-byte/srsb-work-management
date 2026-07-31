import { Router } from 'express';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';
import {
  myAttendance,
  punchIn,
  punchOut,
  listEmployeeAttendance
} from '../controllers/attendanceController.js';

const router = Router();

router.use(authenticate);

router.post('/punch-in', punchIn);
router.post('/punch-out', punchOut);
router.get('/my-records', myAttendance);

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