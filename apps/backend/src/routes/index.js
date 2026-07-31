import { Router } from 'express';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import employeeRoutes from './employeeRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import clientRoutes from './clientRoutes.js';
import taskRoutes from './taskRoutes.js';
import profileRoutes from './profileRoutes.js';
import openingRoutes from './openingRoutes.js';
import reportRoutes from './reportRoutes.js';
import leaveRoutes from './leaveRoutes.js';
import candidateRoutes from './candidateRoutes.js';
import notificationRoutes from './notificationRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/clients', clientRoutes);
router.use('/tasks', taskRoutes);
router.use('/profile', profileRoutes);
router.use('/openings', openingRoutes);
router.use('/reports', reportRoutes);
router.use('/leave', leaveRoutes);
router.use('/candidates', candidateRoutes);
router.use('/notifications', notificationRoutes);

export default router;