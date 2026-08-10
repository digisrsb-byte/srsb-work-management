import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { syncApprovedLeaveAttendance } from '../utils/leaveAttendance.js';

async function createNotifications({
  recipientIds,
  actorId,
  type,
  title,
  message,
  referenceType,
  referenceId
}) {
  const uniqueRecipientIds = [
    ...new Set(
      recipientIds.filter(
        (recipientId) =>
          recipientId && recipientId !== actorId
      )
    )
  ];

  if (!uniqueRecipientIds.length) {
    return;
  }

  const placeholders = uniqueRecipientIds
    .map(() => '(?, ?, ?, ?, ?, ?, ?)')
    .join(', ');

  const values = [];

  uniqueRecipientIds.forEach((recipientId) => {
    values.push(
      recipientId,
      actorId || null,
      type,
      title,
      message,
      referenceType || null,
      referenceId || null
    );
  });

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
     VALUES ${placeholders}`,
    values
  );
}

export const applyLeave = asyncHandler(async (req, res) => {
  if (req.user.accountType === 'SYSTEM') {
    throw new AppError(
      'Head Admin system accounts do not apply for employee leave.',
      403
    );
  }

  const {
    leaveType,
    startDate,
    endDate,
    durationType = 'FULL_DAY',
    reason
  } = req.body;

  if (!leaveType || !startDate || !endDate || !reason) {
    throw new AppError(
      'Leave type, dates and reason are required.',
      400
    );
  }

  if (new Date(startDate) > new Date(endDate)) {
    throw new AppError(
      'Start date cannot be after end date.',
      400
    );
  }

  const allowedLeaveTypes = [
    'CASUAL',
    'SICK',
    'EARNED',
    'UNPAID',
    'OTHER'
  ];

  const allowedDurationTypes = [
    'FULL_DAY',
    'FIRST_HALF',
    'SECOND_HALF'
  ];

  if (!allowedLeaveTypes.includes(leaveType)) {
    throw new AppError('Invalid leave type.', 400);
  }

  if (!allowedDurationTypes.includes(durationType)) {
    throw new AppError('Invalid duration type.', 400);
  }

  const [overlappingLeaves] = await pool.query(
    `SELECT id
     FROM leave_requests
     WHERE employee_id = ?
       AND status IN ('PENDING', 'APPROVED')
       AND start_date <= ?
       AND end_date >= ?
     LIMIT 1`,
    [req.user.id, endDate, startDate]
  );

  if (overlappingLeaves.length) {
    throw new AppError(
      'A pending or approved leave already exists for these dates.',
      409
    );
  }

  const [employeeRows] = await pool.query(
    `SELECT
       id,
       full_name,
       employee_id,
       role,
       account_type
     FROM employees
     WHERE id = ?
     LIMIT 1`,
    [req.user.id]
  );

  if (!employeeRows.length) {
    throw new AppError('Employee record not found.', 404);
  }

  const employee = employeeRows[0];

  if (employee.account_type === 'SYSTEM') {
    throw new AppError(
      'Head Admin system accounts do not apply for employee leave.',
      403
    );
  }

  const [result] = await pool.query(
    `INSERT INTO leave_requests (
       employee_id,
       leave_type,
       start_date,
       end_date,
       duration_type,
       reason,
       status
     )
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      req.user.id,
      leaveType,
      startDate,
      endDate,
      durationType,
      reason.trim()
    ]
  );

  const approverRoles =
    employee.role === 'ADMIN'
      ? ['SUPER_ADMIN']
      : ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];

  const approverPlaceholders = approverRoles
    .map(() => '?')
    .join(', ');

  const [approverRows] = await pool.query(
    `SELECT id
     FROM employees
     WHERE role IN (${approverPlaceholders})
       AND id <> ?
       AND status = 'ACTIVE'`,
    [...approverRoles, req.user.id]
  );

  await createNotifications({
    recipientIds: approverRows.map(
      (approver) => approver.id
    ),
    actorId: req.user.id,
    type: 'LEAVE_REQUEST',
    title: 'New Leave Request',
    message: `${employee.full_name} (${employee.employee_id}) submitted a ${leaveType.replaceAll(
      '_',
      ' '
    )} leave request from ${startDate} to ${endDate}.`,
    referenceType: 'LEAVE_REQUEST',
    referenceId: result.insertId
  });

  const [rows] = await pool.query(
    `SELECT
       id,
       leave_type,
       start_date,
       end_date,
       duration_type,
       reason,
       status,
       reviewer_comment,
       reviewed_at,
       created_at
     FROM leave_requests
     WHERE id = ?`,
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    message: 'Leave request submitted successfully.',
    data: rows[0]
  });
});

export const getMyLeaves = asyncHandler(
  async (req, res) => {
    const [rows] = await pool.query(
      `SELECT
         lr.id,
         lr.leave_type,
         lr.start_date,
         lr.end_date,
         lr.duration_type,
         lr.reason,
         lr.status,
         lr.reviewer_comment,
         lr.reviewed_at,
         lr.created_at,
         reviewer.full_name AS reviewed_by_name
       FROM leave_requests lr
       LEFT JOIN employees reviewer
         ON reviewer.id = lr.reviewed_by
       WHERE lr.employee_id = ?
       ORDER BY lr.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: rows
    });
  }
);

export const cancelMyLeave = asyncHandler(
  async (req, res) => {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT
         lr.id,
         lr.status,
         lr.employee_id,
         e.full_name,
         e.employee_id AS employee_code
       FROM leave_requests lr
       JOIN employees e
         ON e.id = lr.employee_id
       WHERE lr.id = ?
         AND lr.employee_id = ?
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!rows.length) {
      throw new AppError(
        'Leave request not found.',
        404
      );
    }

    if (rows[0].status !== 'PENDING') {
      throw new AppError(
        'Only pending leave requests can be cancelled.',
        400
      );
    }

    await pool.query(
      `UPDATE leave_requests
       SET status = 'CANCELLED'
       WHERE id = ?`,
      [id]
    );

    const [approverRows] = await pool.query(
      `SELECT id
       FROM employees
       WHERE role IN (
         'SUPER_ADMIN',
         'ADMIN',
         'HR',
         'MANAGER'
       )
         AND id <> ?
         AND status = 'ACTIVE'`,
      [req.user.id]
    );

    await createNotifications({
      recipientIds: approverRows.map(
        (approver) => approver.id
      ),
      actorId: req.user.id,
      type: 'LEAVE_CANCELLED',
      title: 'Leave Request Cancelled',
      message: `${rows[0].full_name} (${rows[0].employee_code}) cancelled a pending leave request.`,
      referenceType: 'LEAVE_REQUEST',
      referenceId: Number(id)
    });

    res.json({
      success: true,
      message: 'Leave request cancelled successfully.'
    });
  }
);

export const listLeaveRequests = asyncHandler(
  async (req, res) => {
    const {
      status,
      search
    } = req.query;

    const conditions = [
      "COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'"
    ];
    const values = [];

    // Admin/HR/Manager cannot process an Admin's leave.
    // An Admin leave request is visible only to the Head Admin.
    if (req.user.role !== 'SUPER_ADMIN') {
      conditions.push(
        "e.role NOT IN ('SUPER_ADMIN', 'ADMIN')"
      );
    }

    if (status && status !== 'ALL') {
      const allowedStatuses = [
        'PENDING',
        'APPROVED',
        'REJECTED',
        'CANCELLED'
      ];

      if (!allowedStatuses.includes(status)) {
        throw new AppError('Invalid leave status.', 400);
      }

      conditions.push('lr.status = ?');
      values.push(status);
    }

    const keyword = String(search || '').trim();

    if (keyword) {
      conditions.push(
        `LOWER(CONCAT_WS(
           ' ',
           e.full_name,
           e.employee_id,
           e.designation,
           e.role,
           lr.leave_type,
           lr.duration_type,
           lr.status,
           lr.reason
         )) LIKE ?`
      );
      values.push(`%${keyword.toLowerCase()}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT
         lr.id,
         lr.employee_id,
         e.employee_id AS employee_code,
         e.full_name AS employee_name,
         e.designation,
         e.role AS employee_role,
         lr.leave_type,
         lr.start_date,
         lr.end_date,
         lr.duration_type,
         lr.reason,
         lr.status,
         lr.reviewer_comment,
         lr.reviewed_at,
         lr.created_at,
         reviewer.full_name AS reviewed_by_name
       FROM leave_requests lr
       JOIN employees e
         ON e.id = lr.employee_id
       LEFT JOIN employees reviewer
         ON reviewer.id = lr.reviewed_by
       ${whereClause}
       ORDER BY
         CASE
           WHEN lr.status = 'PENDING'
           THEN 0
           ELSE 1
         END,
         lr.created_at DESC
       LIMIT 1000`,
      values
    );

    res.json({
      success: true,
      data: rows,
      meta: {
        count: rows.length,
        status: status || 'ALL',
        search: keyword || null
      }
    });
  }
);

export const reviewLeaveRequest = asyncHandler(
  async (req, res) => {
    const { id } = req.params;
    const { status, reviewerComment = '' } =
      req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new AppError(
        'Status must be APPROVED or REJECTED.',
        400
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT
           lr.id,
           lr.employee_id,
           lr.status,
           lr.leave_type,
           lr.duration_type,
           lr.start_date,
           lr.end_date,
           e.full_name AS employee_name,
           e.role AS employee_role,
           e.account_type AS employee_account_type
         FROM leave_requests lr
         JOIN employees e
           ON e.id = lr.employee_id
         WHERE lr.id = ?
         LIMIT 1
         FOR UPDATE`,
        [id]
      );

      if (!rows.length) {
        throw new AppError(
          'Leave request not found.',
          404
        );
      }

      const leaveRequest = rows[0];

      if (leaveRequest.status !== 'PENDING') {
        throw new AppError(
          'This leave request has already been reviewed.',
          400
        );
      }

      if (leaveRequest.employee_id === req.user.id) {
        throw new AppError(
          'You cannot approve or reject your own leave request.',
          403
        );
      }

      if (leaveRequest.employee_account_type === 'SYSTEM') {
        throw new AppError(
          'Head Admin system accounts do not use employee leave.',
          400
        );
      }

      if (
        leaveRequest.employee_role === 'ADMIN' &&
        req.user.role !== 'SUPER_ADMIN'
      ) {
        throw new AppError(
          'Only the Head Admin can approve or reject an Admin leave request.',
          403
        );
      }

      await connection.query(
        `UPDATE leave_requests
         SET
           status = ?,
           reviewed_by = ?,
           reviewer_comment = ?,
           reviewed_at = NOW()
         WHERE id = ?`,
        [
          status,
          req.user.id,
          reviewerComment.trim() || null,
          id
        ]
      );

      if (status === 'APPROVED') {
        await syncApprovedLeaveAttendance(connection, {
          employeeId: leaveRequest.employee_id,
          startDate: leaveRequest.start_date,
          endDate: leaveRequest.end_date,
          durationType: leaveRequest.duration_type,
          leaveType: leaveRequest.leave_type
        });
      }

      await connection.commit();

      const statusText =
        status === 'APPROVED'
          ? 'approved'
          : 'rejected';

      await createNotifications({
        recipientIds: [leaveRequest.employee_id],
        actorId: req.user.id,
        type:
          status === 'APPROVED'
            ? 'LEAVE_APPROVED'
            : 'LEAVE_REJECTED',
        title:
          status === 'APPROVED'
            ? 'Leave Request Approved'
            : 'Leave Request Rejected',
        message: `Your ${leaveRequest.leave_type
          .replaceAll('_', ' ')
          .toLowerCase()} leave request from ${
          leaveRequest.start_date
        } to ${
          leaveRequest.end_date
        } was ${statusText}.${
          reviewerComment.trim()
            ? ` Comment: ${reviewerComment.trim()}`
            : ''
        }`,
        referenceType: 'LEAVE_REQUEST',
        referenceId: Number(id)
      });

      res.json({
        success: true,
        message:
          status === 'APPROVED'
            ? 'Leave request approved successfully.'
            : 'Leave request rejected successfully.'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);