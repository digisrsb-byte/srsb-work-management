import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const adminRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER'
];

const allowedStatuses = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED'
];

async function createNotification({
  recipientId,
  actorId,
  type,
  title,
  message,
  referenceId
}) {
  if (!recipientId || recipientId === actorId) {
    return;
  }

  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     VALUES (?, ?, ?, ?, ?, 'TASK', ?)`,
    [
      recipientId,
      actorId || null,
      type,
      title,
      message,
      referenceId
    ]
  );
}

async function notifyAdmins({
  actorId,
  type,
  title,
  message,
  referenceId
}) {
  const [adminRows] = await pool.query(
    `SELECT id
     FROM employees
     WHERE role IN (
       'SUPER_ADMIN',
       'ADMIN',
       'HR',
       'MANAGER'
     )
       AND status = 'ACTIVE'
       AND id <> ?`,
    [actorId]
  );

  for (const admin of adminRows) {
    await createNotification({
      recipientId: admin.id,
      actorId,
      type,
      title,
      message,
      referenceId
    });
  }
}

export const listTasks = asyncHandler(async (req, res) => {
  const isAdmin = adminRoles.includes(req.user.role);
  const {
    search,
    status,
    assignedTo
  } = req.query;

  const conditions = [];
  const values = [];

  if (!isAdmin) {
    conditions.push('t.assigned_to = ?');
    values.push(req.user.id);
  } else if (assignedTo) {
    const parsedAssignedTo = Number(assignedTo);

    if (!Number.isInteger(parsedAssignedTo) || parsedAssignedTo <= 0) {
      throw new AppError('Invalid employee filter.', 400);
    }

    conditions.push('t.assigned_to = ?');
    values.push(parsedAssignedTo);
  }

  if (status && status !== 'ALL') {
    if (!allowedStatuses.includes(status)) {
      throw new AppError('Invalid task status.', 400);
    }

    conditions.push('t.status = ?');
    values.push(status);
  }

  const keyword = String(search || '').trim();

  if (keyword) {
    conditions.push(
      `LOWER(CONCAT_WS(
         ' ',
         t.title,
         t.description,
         t.status,
         t.priority,
         e.full_name,
         e.employee_id,
         e.designation,
         d.name,
         a.full_name
       )) LIKE ?`
    );
    values.push(`%${keyword.toLowerCase()}%`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const [rows] = await pool.query(
    `SELECT
       t.*,
       e.employee_id AS assignee_code,
       e.full_name AS assignee_name,
       e.designation AS assignee_designation,
       d.name AS assignee_department,
       a.full_name AS assigned_by_name
     FROM tasks t
     JOIN employees e
       ON e.id = t.assigned_to
     LEFT JOIN departments d
       ON d.id = e.department_id
     LEFT JOIN employees a
       ON a.id = t.assigned_by
     ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows,
    meta: {
      count: rows.length,
      search: keyword || null,
      status: status || 'ALL',
      assignedTo: assignedTo || null
    }
  });
});

export const createTask = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    assignedTo,
    dueDate,
    priority
  } = req.body;

  if (!title?.trim() || !assignedTo) {
    throw new AppError(
      'Task title and assignee are required.',
      400
    );
  }

  const [[assignee]] = await pool.query(
    `SELECT id, full_name
     FROM employees
     WHERE id = ?
       AND status = 'ACTIVE'
     LIMIT 1`,
    [assignedTo]
  );

  if (!assignee) {
    throw new AppError(
      'Assigned employee not found.',
      404
    );
  }

  const [result] = await pool.query(
    `INSERT INTO tasks
      (
        title,
        description,
        assigned_to,
        assigned_by,
        due_date,
        priority,
        status,
        progress
      )
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
    [
      title.trim(),
      description?.trim() || null,
      assignedTo,
      req.user.id,
      dueDate || null,
      priority || 'MEDIUM'
    ]
  );

  await createNotification({
    recipientId: Number(assignedTo),
    actorId: req.user.id,
    type: 'TASK_ASSIGNED',
    title: 'New Task Assigned',
    message: `A new task "${title.trim()}" has been assigned to you.${
      dueDate ? ` Due date: ${dueDate}.` : ''
    }`,
    referenceId: result.insertId
  });

  res.status(201).json({
    success: true,
    message: 'Task created successfully.',
    data: {
      id: result.insertId
    }
  });
});

export const updateTaskStatus = asyncHandler(
  async (req, res) => {
    const taskId = Number(req.params.id);
    const status = req.body.status;
    const progress = Number(req.body.progress);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new AppError('Invalid task ID.', 400);
    }

    if (!allowedStatuses.includes(status)) {
      throw new AppError(
        'Status must be Pending, In Progress or Completed.',
        400
      );
    }

    if (
      !Number.isInteger(progress) ||
      progress < 0 ||
      progress > 100
    ) {
      throw new AppError(
        'Progress must be between 0 and 100.',
        400
      );
    }

    if (status === 'PENDING' && progress > 0) {
      throw new AppError(
        'Pending tasks must have 0% progress.',
        400
      );
    }

    if (
      status === 'IN_PROGRESS' &&
      (progress <= 0 || progress >= 100)
    ) {
      throw new AppError(
        'In-progress tasks must have progress between 1% and 99%.',
        400
      );
    }

    if (status === 'COMPLETED' && progress !== 100) {
      throw new AppError(
        'Completed tasks must have 100% progress.',
        400
      );
    }

    const [[task]] = await pool.query(
      `SELECT
         t.id,
         t.title,
         t.status,
         t.progress,
         t.assigned_to,
         t.assigned_by,
         e.full_name AS assignee_name
       FROM tasks t
       JOIN employees e
         ON e.id = t.assigned_to
       WHERE t.id = ?
       LIMIT 1`,
      [taskId]
    );

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    const isAdmin = adminRoles.includes(req.user.role);
    const isAssignedEmployee =
      task.assigned_to === req.user.id;

    if (!isAdmin && !isAssignedEmployee) {
      throw new AppError(
        'You can update only tasks assigned to you.',
        403
      );
    }

    await pool.query(
      `UPDATE tasks
       SET
         status = ?,
         progress = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, progress, taskId]
    );

    const statusLabel = status.replaceAll('_', ' ');

    if (isAssignedEmployee && !isAdmin) {
      await notifyAdmins({
        actorId: req.user.id,
        type:
          status === 'COMPLETED'
            ? 'TASK_COMPLETED'
            : 'TASK_STATUS_UPDATED',
        title:
          status === 'COMPLETED'
            ? 'Task Completed'
            : 'Task Progress Updated',
        message: `${task.assignee_name} changed "${task.title}" to ${statusLabel} with ${progress}% progress.`,
        referenceId: taskId
      });
    }

    if (isAdmin && task.assigned_to !== req.user.id) {
      await createNotification({
        recipientId: task.assigned_to,
        actorId: req.user.id,
        type: 'TASK_STATUS_UPDATED',
        title: 'Task Status Updated',
        message: `Your task "${task.title}" was changed to ${statusLabel} with ${progress}% progress.`,
        referenceId: taskId
      });
    }

    res.json({
      success: true,
      message: 'Task status updated successfully.'
    });
  }
);