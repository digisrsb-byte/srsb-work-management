import { Router } from 'express';

import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
} from '../controllers/notificationController.js';

import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', listNotifications);

router.get('/unread-count', getUnreadCount);

router.put('/:id/read', markNotificationRead);

router.put('/read-all', markAllNotificationsRead);

export default router;