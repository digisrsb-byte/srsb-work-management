import { Router } from 'express';
import { body } from 'express-validator';
import { createTask, listTasks, updateTaskStatus } from '../controllers/taskController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);
router.get('/', listTasks);
router.post(
  '/',
  allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'),
  [body('title').trim().notEmpty(), body('assignedTo').isInt(), validate],
  createTask
);
router.patch('/:id/status', updateTaskStatus);
export default router;
