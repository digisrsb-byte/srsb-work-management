import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const listNotifications = asyncHandler(
  async (req, res) => {
    const [rows] = await pool.query(
      `SELECT
         id,
         title,
         message,
         type,
         reference_type,
         reference_id,
         is_read,
         read_at,
         created_at
       FROM notifications
       WHERE recipient_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: rows
    });
  }
);

export const getUnreadCount = asyncHandler(
  async (req, res) => {
    const [[result]] = await pool.query(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE recipient_id = ?
         AND is_read = 0`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        unreadCount: Number(
          result.unread_count || 0
        )
      }
    });
  }
);

export const markNotificationRead = asyncHandler(
  async (req, res) => {
    const notificationId = Number(req.params.id);

    if (
      !Number.isInteger(notificationId) ||
      notificationId <= 0
    ) {
      throw new AppError(
        'Invalid notification ID.',
        400
      );
    }

    const [result] = await pool.query(
      `UPDATE notifications
       SET
         is_read = 1,
         read_at = NOW()
       WHERE id = ?
         AND recipient_id = ?`,
      [notificationId, req.user.id]
    );

    if (!result.affectedRows) {
      throw new AppError(
        'Notification not found.',
        404
      );
    }

    res.json({
      success: true,
      message: 'Notification marked as read.'
    });
  }
);

export const markAllNotificationsRead =
  asyncHandler(async (req, res) => {
    await pool.query(
      `UPDATE notifications
       SET
         is_read = 1,
         read_at = NOW()
       WHERE recipient_id = ?
         AND is_read = 0`,
      [req.user.id]
    );

    res.json({
      success: true,
      message:
        'All notifications marked as read.'
    });
  });