import { Router } from 'express';
import { adminDashboard, employeeDashboard } from '../controllers/dashboardController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.get('/admin', authenticate, allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), adminDashboard);
router.get('/employee', authenticate, employeeDashboard);
export default router;
