import { Router } from 'express';
import {
  applyLeave,
  getMyLeaves,
  cancelMyLeave,
  listLeaveRequests,
  reviewLeaveRequest
} from '../controllers/leaveController.js';
import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/my', getMyLeaves);
router.post('/', applyLeave);
router.patch('/:id/cancel', cancelMyLeave);

router.get(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  listLeaveRequests
);

router.patch(
  '/:id/review',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  reviewLeaveRequest
);

export default router;