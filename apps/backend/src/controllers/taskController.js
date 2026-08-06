import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const taskViewerRoles = ['SUPER_ADMIN','ADMIN','HR','MANAGER'];
const taskAdminRoles = ['SUPER_ADMIN','ADMIN'];
const allowedStatuses = ['PENDING','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED'];
const allowedPriorities = ['LOW','MEDIUM','HIGH','URGENT'];

function positiveId(value, label = 'task ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function dateTimeOrNull(value, label = 'date') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`Select a valid ${label}.`, 400);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normaliseTaskField(field, value) {
  if (value === null || value === undefined || value === '') return '';
  if (field === 'start_date' || field === 'due_date') {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(value);
}

function parseAttachment(file) {
  if (!file?.data) return null;
  const name = String(file.name || 'task-attachment').slice(0, 255);
  const mime = String(file.type || 'application/octet-stream').slice(0, 120);
  const raw = String(file.data);
  const buffer = Buffer.from(raw.includes(',') ? raw.split(',').pop() : raw, 'base64');
  if (!buffer.length) throw new AppError('Task attachment could not be read.', 400);
  if (buffer.length > 5 * 1024 * 1024) throw new AppError('Task attachment must be 5 MB or smaller.', 400);
  return { name, mime, data: buffer };
}

async function createNotification({ recipientId, actorId, type, title, message, referenceId }) {
  if (!recipientId || Number(recipientId) === Number(actorId)) return;
  await pool.query(
    `INSERT INTO notifications (
       recipient_id, actor_id, type, title, message, reference_type, reference_id
     ) VALUES (?, ?, ?, ?, ?, 'TASK', ?)`,
    [recipientId, actorId || null, type, title, message, referenceId]
  );
}

async function notifyAdmins({ actorId, type, title, message, referenceId }) {
  const [admins] = await pool.query(
    `SELECT id FROM employees
     WHERE role IN ('SUPER_ADMIN','ADMIN','HR','MANAGER')
       AND status = 'ACTIVE' AND id <> ?`,
    [actorId]
  );
  for (const admin of admins) {
    await createNotification({ recipientId: admin.id, actorId, type, title, message, referenceId });
  }
}

async function recordHistory(connection, taskId, changedBy, changeType, fieldName, oldValue, newValue, reason = null) {
  await connection.query(
    `INSERT INTO task_change_history (
       task_id, changed_by, change_type, field_name, old_value, new_value, reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [taskId, changedBy || null, changeType, fieldName || null,
      oldValue === undefined || oldValue === null ? null : String(oldValue),
      newValue === undefined || newValue === null ? null : String(newValue),
      reason ? String(reason).trim() : null]
  );
}

async function saveAttachment(connection, taskId, file, userId) {
  const attachment = parseAttachment(file);
  if (!attachment) return null;
  const [result] = await connection.query(
    `INSERT INTO task_attachments (task_id, file_name, mime_type, file_data, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    [taskId, attachment.name, attachment.mime, attachment.data, userId]
  );
  return result.insertId;
}

export const listTasks = asyncHandler(async (req, res) => {
  const isAdmin = taskViewerRoles.includes(req.user.role);
  const conditions = [];
  const values = [];
  if (!isAdmin) {
    conditions.push('t.assigned_to = ?');
    values.push(req.user.id);
  } else if (req.query.assignedTo) {
    conditions.push('t.assigned_to = ?');
    values.push(positiveId(req.query.assignedTo, 'employee filter'));
  }
  if (req.query.status && req.query.status !== 'ALL') {
    const status = String(req.query.status).toUpperCase();
    if (!allowedStatuses.includes(status)) throw new AppError('Invalid task status.', 400);
    conditions.push('t.status = ?');
    values.push(status);
  }
  const keyword = String(req.query.search || '').trim().toLowerCase();
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', t.title, t.description, t.remarks, t.status,
      t.priority, e.full_name, e.employee_id, e.designation, d.name, a.full_name)) LIKE ?`);
    values.push(`%${keyword}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT t.*, e.employee_id AS assignee_code, e.full_name AS assignee_name,
       e.designation AS assignee_designation, d.name AS assignee_department,
       a.full_name AS assigned_by_name,
       (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count,
       er.id AS extension_request_id, er.requested_due_date, er.reason AS extension_reason,
       er.status AS extension_status, er.created_at AS extension_requested_at,
       requester.full_name AS extension_requested_by_name
     FROM tasks t
     JOIN employees e ON e.id = t.assigned_to
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN task_extension_requests er ON er.id = (
       SELECT er2.id FROM task_extension_requests er2
       WHERE er2.task_id = t.id ORDER BY er2.id DESC LIMIT 1
     )
     LEFT JOIN employees requester ON requester.id = er.requested_by
     ${where}
     ORDER BY CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END,
       COALESCE(t.due_date, '9999-12-31') ASC, t.created_at DESC
     LIMIT 1000`,
    values
  );
  res.json({
    success: true,
    data: rows.map((row) => ({ ...row, attachment_count: Number(row.attachment_count || 0) })),
    meta: { count: rows.length }
  });
});

export const createTask = asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const assignedTo = positiveId(req.body.assignedTo, 'assignee');
  const priority = String(req.body.priority || 'MEDIUM').toUpperCase();
  if (!title) throw new AppError('Task title is required.', 400);
  if (!allowedPriorities.includes(priority)) throw new AppError('Invalid task priority.', 400);
  const [[assignee]] = await pool.query(
    `SELECT id, full_name FROM employees
     WHERE id = ? AND status = 'ACTIVE' AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'`,
    [assignedTo]
  );
  if (!assignee) throw new AppError('Assigned employee not found.', 404);
  const startDate = dateTimeOrNull(req.body.startDate, 'start date');
  const dueDate = dateTimeOrNull(req.body.dueDate, 'due date');
  if (startDate && dueDate && dueDate < startDate) throw new AppError('Due date cannot be before the start date.', 400);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO tasks (
         title, description, assigned_to, assigned_by, start_date, due_date,
         original_due_date, priority, status, progress, remarks
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)`,
      [title, String(req.body.description || '').trim() || null, assignedTo, req.user.id,
        startDate, dueDate, dueDate, priority, String(req.body.remarks || '').trim() || null]
    );
    await recordHistory(connection, result.insertId, req.user.id, 'CREATED', null, null, 'Task created');
    await saveAttachment(connection, result.insertId, req.body.attachment, req.user.id);
    await connection.commit();
    await createNotification({
      recipientId: assignedTo,
      actorId: req.user.id,
      type: 'TASK_ASSIGNED',
      title: 'New Task Assigned',
      message: `A new task "${title}" has been assigned to you.${dueDate ? ` Due: ${dueDate}.` : ''}`,
      referenceId: result.insertId
    });
    res.status(201).json({ success: true, message: 'Task assigned successfully.', data: { id: result.insertId } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

function validateStatusProgress(statusValue, progressValue) {
  const status = String(statusValue || '').toUpperCase();
  const progress = Number(progressValue);
  if (!allowedStatuses.includes(status)) throw new AppError('Invalid task status.', 400);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new AppError('Progress must be between 0 and 100.', 400);
  }
  if (status === 'PENDING' && progress !== 0) throw new AppError('Pending tasks must have 0% progress.', 400);
  if (status === 'IN_PROGRESS' && (progress <= 0 || progress >= 100)) {
    throw new AppError('In-progress tasks must have progress between 1% and 99%.', 400);
  }
  if (status === 'COMPLETED' && progress !== 100) throw new AppError('Completed tasks must have 100% progress.', 400);
  if (status === 'CANCELLED' && progress !== 0) throw new AppError('Cancelled tasks must have 0% progress.', 400);
  return { status, progress };
}

export const updateTask = asyncHandler(async (req, res) => {
  const taskId = positiveId(req.params.id);
  if (!taskAdminRoles.includes(req.user.role)) throw new AppError('Only Admin or Super Admin can edit assigned work.', 403);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[task]] = await connection.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (!task) throw new AppError('Task not found.', 404);
    const title = String(req.body.title || '').trim();
    if (!title) throw new AppError('Task title is required.', 400);
    const assignedTo = positiveId(req.body.assignedTo, 'assignee');
    const [[assignee]] = await connection.query(
      `SELECT id, full_name FROM employees WHERE id = ? AND status = 'ACTIVE'
         AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'`,
      [assignedTo]
    );
    if (!assignee) throw new AppError('Assigned employee not found.', 404);
    const priority = String(req.body.priority || 'MEDIUM').toUpperCase();
    if (!allowedPriorities.includes(priority)) throw new AppError('Invalid task priority.', 400);
    const startDate = dateTimeOrNull(req.body.startDate, 'start date');
    const dueDate = dateTimeOrNull(req.body.dueDate, 'due date');
    if (startDate && dueDate && dueDate < startDate) throw new AppError('Due date cannot be before the start date.', 400);
    const statusProgress = validateStatusProgress(req.body.status || task.status, req.body.progress ?? task.progress);
    const previousDueDate = task.due_date
      ? new Date(task.due_date).toISOString().slice(0, 19).replace('T', ' ')
      : null;
    const dueDateChanged = String(previousDueDate || '') !== String(dueDate || '');
    const dueDateChangeReason = String(req.body.extensionReason || req.body.editReason || '').trim();
    if (dueDateChanged && !dueDateChangeReason) {
      throw new AppError('Enter a reason when changing the task due date.', 400);
    }
    const next = {
      title,
      description: String(req.body.description || '').trim() || null,
      assigned_to: assignedTo,
      start_date: startDate,
      due_date: dueDate,
      priority,
      status: statusProgress.status,
      progress: statusProgress.progress,
      remarks: String(req.body.remarks || '').trim() || null
    };
    const fieldLabels = {
      title: 'Title', description: 'Description', assigned_to: 'Assignee', start_date: 'Start Date',
      due_date: 'Due Date', priority: 'Priority', status: 'Status', progress: 'Progress', remarks: 'Remarks'
    };
    for (const [field, value] of Object.entries(next)) {
      const normalizedOld = normaliseTaskField(field, task[field]);
      const normalizedNew = normaliseTaskField(field, value);
      if (normalizedOld !== normalizedNew) {
        await recordHistory(
          connection,
          taskId,
          req.user.id,
          field === 'due_date' ? 'DUE_DATE_CHANGED' : 'EDITED',
          fieldLabels[field],
          normalizedOld,
          normalizedNew,
          field === 'due_date' ? dueDateChangeReason : null
        );
      }
    }
    await connection.query(
      `UPDATE tasks SET title = ?, description = ?, assigned_to = ?, start_date = ?, due_date = ?,
       priority = ?, status = ?, progress = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [next.title, next.description, next.assigned_to, next.start_date, next.due_date,
        next.priority, next.status, next.progress, next.remarks, taskId]
    );
    await saveAttachment(connection, taskId, req.body.attachment, req.user.id);
    await connection.commit();
    if (Number(task.assigned_to) !== Number(assignedTo)) {
      await createNotification({
        recipientId: assignedTo, actorId: req.user.id, type: 'TASK_REASSIGNED',
        title: 'Task Assigned to You', message: `The task "${title}" was assigned to you.`, referenceId: taskId
      });
    } else {
      await createNotification({
        recipientId: assignedTo, actorId: req.user.id, type: 'TASK_UPDATED',
        title: 'Task Updated', message: `Your task "${title}" was updated.`, referenceId: taskId
      });
    }
    res.json({ success: true, message: 'Task details updated successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const taskId = positiveId(req.params.id);
  const { status, progress } = validateStatusProgress(req.body.status, req.body.progress);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[task]] = await connection.query(
      `SELECT t.*, e.full_name AS assignee_name FROM tasks t
       JOIN employees e ON e.id = t.assigned_to WHERE t.id = ? FOR UPDATE`,
      [taskId]
    );
    if (!task) throw new AppError('Task not found.', 404);
    const isAdmin = taskViewerRoles.includes(req.user.role);
    if (!isAdmin && Number(task.assigned_to) !== Number(req.user.id)) {
      throw new AppError('You can update only tasks assigned to you.', 403);
    }
    await connection.query(
      `UPDATE tasks SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, progress, taskId]
    );
    if (task.status !== status) {
      await recordHistory(connection, taskId, req.user.id, 'STATUS_CHANGED', 'Status', task.status, status);
    }
    if (Number(task.progress) !== progress) {
      await recordHistory(connection, taskId, req.user.id, 'PROGRESS_CHANGED', 'Progress', task.progress, progress);
    }
    await connection.commit();
    if (!isAdmin) {
      await notifyAdmins({
        actorId: req.user.id,
        type: status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STATUS_UPDATED',
        title: status === 'COMPLETED' ? 'Task Completed' : 'Task Progress Updated',
        message: `${task.assignee_name} changed "${task.title}" to ${status.replaceAll('_', ' ')} with ${progress}% progress.`,
        referenceId: taskId
      });
    } else {
      await createNotification({
        recipientId: task.assigned_to, actorId: req.user.id, type: 'TASK_STATUS_UPDATED',
        title: 'Task Status Updated',
        message: `Your task "${task.title}" was changed to ${status.replaceAll('_', ' ')}.`,
        referenceId: taskId
      });
    }
    res.json({ success: true, message: 'Task status updated successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const requestTaskExtension = asyncHandler(async (req, res) => {
  const taskId = positiveId(req.params.id);
  const requestedDueDate = dateTimeOrNull(req.body.requestedDueDate, 'requested due date');
  if (!requestedDueDate) throw new AppError('New requested due date is required.', 400);
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new AppError('Reason for extension is required.', 400);
  const [[task]] = await pool.query('SELECT id, title, assigned_to, due_date FROM tasks WHERE id = ?', [taskId]);
  if (!task) throw new AppError('Task not found.', 404);
  const isAdmin = taskViewerRoles.includes(req.user.role);
  if (!isAdmin && Number(task.assigned_to) !== Number(req.user.id)) {
    throw new AppError('You can request an extension only for your assigned task.', 403);
  }
  const currentDue = task.due_date ? new Date(task.due_date).toISOString().slice(0, 19).replace('T', ' ') : null;
  if (currentDue && requestedDueDate <= currentDue) {
    throw new AppError('Requested due date must be later than the current due date.', 400);
  }
  const [[pending]] = await pool.query(
    `SELECT id FROM task_extension_requests WHERE task_id = ? AND status = 'PENDING' LIMIT 1`,
    [taskId]
  );
  if (pending) throw new AppError('An extension request is already pending for this task.', 409);
  const [result] = await pool.query(
    `INSERT INTO task_extension_requests (
       task_id, requested_by, current_due_date, requested_due_date, reason
     ) VALUES (?, ?, ?, ?, ?)`,
    [taskId, req.user.id, currentDue, requestedDueDate, reason]
  );
  await recordHistory(pool, taskId, req.user.id, 'EXTENSION_REQUESTED', 'Due Date', currentDue, requestedDueDate, reason);
  await notifyAdmins({
    actorId: req.user.id,
    type: 'TASK_EXTENSION_REQUESTED',
    title: 'Task Extension Requested',
    message: `An extension was requested for "${task.title}" until ${requestedDueDate}.`,
    referenceId: taskId
  });
  res.status(201).json({ success: true, message: 'Due-date extension requested.', data: { id: result.insertId } });
});

export const reviewTaskExtension = asyncHandler(async (req, res) => {
  const extensionId = positiveId(req.params.extensionId, 'extension request');
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['APPROVED','REJECTED'].includes(decision)) throw new AppError('Decision must be Approved or Rejected.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query(
      `SELECT er.*, t.title, t.assigned_to, t.due_date
       FROM task_extension_requests er JOIN tasks t ON t.id = er.task_id
       WHERE er.id = ? FOR UPDATE`,
      [extensionId]
    );
    if (!request) throw new AppError('Extension request not found.', 404);
    if (request.status !== 'PENDING') throw new AppError('This extension request has already been reviewed.', 409);
    if (Number(request.requested_by) === Number(req.user.id)) {
      throw new AppError('You cannot approve or reject your own extension request.', 403);
    }
    const comment = String(req.body.reviewerComment || '').trim() || null;
    await connection.query(
      `UPDATE task_extension_requests SET status = ?, reviewed_by = ?, reviewer_comment = ?,
       reviewed_at = NOW() WHERE id = ?`,
      [decision, req.user.id, comment, extensionId]
    );
    if (decision === 'APPROVED') {
      await connection.query('UPDATE tasks SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [request.requested_due_date, request.task_id]);
      await recordHistory(
        connection, request.task_id, req.user.id, 'EXTENSION_APPROVED', 'Due Date',
        request.due_date, request.requested_due_date, request.reason
      );
    } else {
      await recordHistory(connection, request.task_id, req.user.id, 'EXTENSION_REJECTED', 'Due Date', request.due_date, request.due_date, comment || request.reason);
    }
    await connection.commit();
    await createNotification({
      recipientId: request.requested_by,
      actorId: req.user.id,
      type: `TASK_EXTENSION_${decision}`,
      title: `Task Extension ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: `Your extension request for "${request.title}" was ${decision.toLowerCase()}.`,
      referenceId: request.task_id
    });
    res.json({ success: true, message: `Extension request ${decision.toLowerCase()}.` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const getTaskHistory = asyncHandler(async (req, res) => {
  const taskId = positiveId(req.params.id);
  const [[task]] = await pool.query('SELECT assigned_to FROM tasks WHERE id = ?', [taskId]);
  if (!task) throw new AppError('Task not found.', 404);
  if (!taskViewerRoles.includes(req.user.role) && Number(task.assigned_to) !== Number(req.user.id)) {
    throw new AppError('You cannot view this task history.', 403);
  }
  const [history, extensions, attachments] = await Promise.all([
    pool.query(
      `SELECT h.*, e.full_name AS changed_by_name FROM task_change_history h
       LEFT JOIN employees e ON e.id = h.changed_by
       WHERE h.task_id = ? ORDER BY h.created_at DESC, h.id DESC`,
      [taskId]
    ),
    pool.query(
      `SELECT er.*, requester.full_name AS requested_by_name, reviewer.full_name AS reviewed_by_name
       FROM task_extension_requests er
       LEFT JOIN employees requester ON requester.id = er.requested_by
       LEFT JOIN employees reviewer ON reviewer.id = er.reviewed_by
       WHERE er.task_id = ? ORDER BY er.created_at DESC, er.id DESC`,
      [taskId]
    ),
    pool.query(
      `SELECT ta.id, ta.file_name, ta.mime_type, ta.created_at,
         e.full_name AS uploaded_by_name
       FROM task_attachments ta LEFT JOIN employees e ON e.id = ta.uploaded_by
       WHERE ta.task_id = ? ORDER BY ta.created_at DESC`,
      [taskId]
    )
  ]);
  res.json({ success: true, data: { history: history[0], extensions: extensions[0], attachments: attachments[0] } });
});

export const uploadTaskAttachment = asyncHandler(async (req, res) => {
  const taskId = positiveId(req.params.id);
  const [[task]] = await pool.query('SELECT assigned_to FROM tasks WHERE id = ?', [taskId]);
  if (!task) throw new AppError('Task not found.', 404);
  if (!taskViewerRoles.includes(req.user.role) && Number(task.assigned_to) !== Number(req.user.id)) {
    throw new AppError('You cannot upload an attachment to this task.', 403);
  }
  const attachment = parseAttachment(req.body.attachment);
  if (!attachment) throw new AppError('Select a file to upload.', 400);
  const [result] = await pool.query(
    `INSERT INTO task_attachments (task_id, file_name, mime_type, file_data, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    [taskId, attachment.name, attachment.mime, attachment.data, req.user.id]
  );
  await recordHistory(pool, taskId, req.user.id, 'ATTACHMENT_ADDED', 'Attachment', null, attachment.name);
  res.status(201).json({ success: true, message: 'Task attachment uploaded.', data: { id: result.insertId } });
});

export const downloadTaskAttachment = asyncHandler(async (req, res) => {
  const attachmentId = positiveId(req.params.attachmentId, 'attachment');
  const [[attachment]] = await pool.query(
    `SELECT ta.*, t.assigned_to FROM task_attachments ta
     JOIN tasks t ON t.id = ta.task_id WHERE ta.id = ?`,
    [attachmentId]
  );
  if (!attachment) throw new AppError('Attachment not found.', 404);
  if (!taskViewerRoles.includes(req.user.role) && Number(attachment.assigned_to) !== Number(req.user.id)) {
    throw new AppError('You cannot download this attachment.', 403);
  }
  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${String(attachment.file_name).replaceAll('"', '')}"`);
  res.send(attachment.file_data);
});

export const deleteTaskAttachment = asyncHandler(async (req, res) => {
  const attachmentId = positiveId(req.params.attachmentId, 'attachment');
  const [[attachment]] = await pool.query('SELECT task_id, file_name, uploaded_by FROM task_attachments WHERE id = ?', [attachmentId]);
  if (!attachment) throw new AppError('Attachment not found.', 404);
  if (!taskViewerRoles.includes(req.user.role) && Number(attachment.uploaded_by) !== Number(req.user.id)) {
    throw new AppError('You cannot delete this attachment.', 403);
  }
  await pool.query('DELETE FROM task_attachments WHERE id = ?', [attachmentId]);
  await recordHistory(pool, attachment.task_id, req.user.id, 'ATTACHMENT_DELETED', 'Attachment', attachment.file_name, null);
  res.json({ success: true, message: 'Task attachment deleted.' });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const taskId = positiveId(req.params.id);

  if (!taskAdminRoles.includes(req.user.role)) {
    throw new AppError(
      'Only Admin or Super Admin can delete assigned work.',
      403
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[task]] = await connection.query(
      `SELECT
         id,
         title,
         description,
         assigned_to,
         assigned_by,
         priority,
         status,
         progress,
         start_date,
         due_date,
         remarks
       FROM tasks
       WHERE id = ?
       FOR UPDATE`,
      [taskId]
    );

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    await connection.query(
      `INSERT INTO audit_logs (
         employee_id,
         action,
         entity_type,
         entity_id,
         old_values,
         new_values,
         ip_address
       )
       VALUES (?, 'TASK_DELETED', 'TASK', ?, ?, NULL, ?)`,
      [
        req.user.id,
        String(taskId),
        JSON.stringify(task),
        req.ip || null
      ]
    );

    await connection.query(
      'DELETE FROM tasks WHERE id = ?',
      [taskId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: `Assigned work "${task.title}" deleted successfully.`
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
