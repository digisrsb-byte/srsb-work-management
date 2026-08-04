import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { listHolidays, createHoliday, updateHoliday, deleteHoliday } from '../controllers/holidayController.js';

const router = Router();
router.use(authenticate);
router.get('/', listHolidays);
router.post('/', allowRoles('SUPER_ADMIN','ADMIN'), createHoliday);
router.put('/:id', allowRoles('SUPER_ADMIN','ADMIN'), updateHoliday);
router.delete('/:id', allowRoles('SUPER_ADMIN','ADMIN'), deleteHoliday);
export default router;
