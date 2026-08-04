import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import {
  createCorrectionRequest,
  getMyCorrectionRequests,
  listCorrectionRequests,
  reviewCorrectionRequest,
  adminUpsertAttendance
} from '../controllers/attendanceCorrectionController.js';

const router = Router();
router.use(authenticate);
router.get('/my', getMyCorrectionRequests);
router.post('/', createCorrectionRequest);
router.get('/', allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), listCorrectionRequests);
router.patch('/:id/review', allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), reviewCorrectionRequest);
router.put('/manual/:employeeId/:date', allowRoles('SUPER_ADMIN','ADMIN','HR'), adminUpsertAttendance);
export default router;
