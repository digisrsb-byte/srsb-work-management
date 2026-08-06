import { Router } from 'express';
import { body } from 'express-validator';
import {
  listTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  requestTaskExtension,
  reviewTaskExtension,
  getTaskHistory,
  uploadTaskAttachment,
  downloadTaskAttachment,
  deleteTaskAttachment,
  deleteTask
} from '../controllers/taskController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);
router.get('/', listTasks);
router.post(
  '/',
  allowRoles('SUPER_ADMIN','ADMIN'),
  [body('title').trim().notEmpty(), body('assignedTo').isInt(), validate],
  createTask
);
router.put('/:id', allowRoles('SUPER_ADMIN','ADMIN'), updateTask);
router.patch('/:id/status', updateTaskStatus);
router.post('/:id/extensions', requestTaskExtension);
router.patch('/extensions/:extensionId', allowRoles('SUPER_ADMIN','ADMIN'), reviewTaskExtension);
router.get('/:id/history', getTaskHistory);
router.post('/:id/attachments', uploadTaskAttachment);
router.get('/attachments/:attachmentId/download', downloadTaskAttachment);
router.delete('/attachments/:attachmentId', deleteTaskAttachment);
router.delete('/:id', allowRoles('SUPER_ADMIN','ADMIN'), deleteTask);
export default router;
