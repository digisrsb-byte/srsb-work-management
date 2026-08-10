import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const issueTypes = [
  'FORGOT_PUNCH_IN',
  'FORGOT_PUNCH_OUT',
  'FORGOT_BOTH',
  'INCORRECT_TIME',
  'ATTENDANCE_MISSING',
  'OTHER'
];

function validId(value, label = 'ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function toSqlDateTime(date, time) {
  if (!date || !time) return null;
  return `${date} ${time.length === 5 ? `${time}:00` : time}`;
}

function indiaDateNow() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function wallClockMinutes(start, end) {
  if (!start || !end) return 0;
  const parse = (value) => {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
  };
  const startMs = parse(start);
  const endMs = parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return NaN;
  return Math.round((endMs - startMs) / 60000);
}

function deriveAttendanceStatus(punchIn, punchOut, forcedStatus = null) {
  if (forcedStatus) return forcedStatus;
  if (!punchIn || !punchOut) return 'MISSING_PUNCH';
  const minutes = Math.max(wallClockMinutes(punchIn, punchOut), 0);
  if (minutes >= 450) return 'PRESENT';
  if (minutes >= 240) return 'HALF_DAY';
  return 'ABSENT';
}

async function notifyAdmins({ actorId, title, message, referenceId }) {
  const [recipients] = await pool.query(
    `SELECT id FROM employees
     WHERE role IN ('SUPER_ADMIN','ADMIN','HR','MANAGER')
       AND status = 'ACTIVE'
       AND id <> ?`,
    [actorId]
  );
  if (!recipients.length) return;

  const placeholders = recipients
    .map(() => `(?, ?, 'ATTENDANCE_CORRECTION', ?, ?, 'ATTENDANCE_CORRECTION', ?)`)
    .join(', ');
  const values = [];
  recipients.forEach((row) => values.push(row.id, actorId, title, message, referenceId));

  try {
    await pool.query(
      `INSERT INTO notifications (
         recipient_id, actor_id, type, title, message, reference_type, reference_id
       ) VALUES ${placeholders}`,
      values
    );
  } catch {
    // Attendance correction should not fail only because notification delivery failed.
  }
}

export const createCorrectionRequest = asyncHandler(async (req, res) => {
  const correctionDate = String(req.body.correctionDate || '').trim();
  const issueType = req.body.issueType || 'OTHER';
  const reason = String(req.body.reason || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(correctionDate)) {
    throw new AppError('Select a valid attendance date.', 400);
  }
  if (correctionDate > indiaDateNow()) {
    throw new AppError('Attendance correction cannot be requested for a future date.', 400);
  }
  if (!issueTypes.includes(issueType)) throw new AppError('Select a valid attendance issue.', 400);
  if (reason.length < 5) throw new AppError('Please provide a reason for the correction.', 400);

  const requestedPunchIn = toSqlDateTime(correctionDate, req.body.requestedPunchIn);
  const requestedPunchOut = toSqlDateTime(correctionDate, req.body.requestedPunchOut);
  if (requestedPunchIn && requestedPunchOut && wallClockMinutes(requestedPunchIn, requestedPunchOut) <= 0) {
    throw new AppError('Punch-out time must be later than punch-in time.', 400);
  }

  const [[employee]] = await pool.query(
    `SELECT id, full_name, employee_id, account_type
     FROM employees WHERE id = ? LIMIT 1`,
    [req.user.id]
  );
  if (!employee || employee.account_type === 'SYSTEM') {
    throw new AppError('System accounts cannot request attendance corrections.', 403);
  }

  const [[attendance]] = await pool.query(
    `SELECT id, punch_in, punch_out
     FROM attendance WHERE employee_id = ? AND attendance_date = ? LIMIT 1`,
    [req.user.id, correctionDate]
  );

  const [[pending]] = await pool.query(
    `SELECT id FROM attendance_correction_requests
     WHERE employee_id = ? AND correction_date = ? AND status = 'PENDING' LIMIT 1`,
    [req.user.id, correctionDate]
  );
  if (pending) throw new AppError('A pending correction request already exists for this date.', 409);

  const [result] = await pool.query(
    `INSERT INTO attendance_correction_requests (
       employee_id, attendance_id, correction_date, issue_type,
       original_punch_in, original_punch_out, requested_punch_in,
       requested_punch_out, reason, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [req.user.id, attendance?.id || null, correctionDate, issueType,
      attendance?.punch_in || null, attendance?.punch_out || null,
      requestedPunchIn, requestedPunchOut, reason]
  );

  await notifyAdmins({
    actorId: req.user.id,
    title: 'Attendance Correction Request',
    message: `${employee.full_name} (${employee.employee_id}) requested an attendance correction for ${correctionDate}.`,
    referenceId: result.insertId
  });

  res.status(201).json({ success: true, message: 'Attendance correction request submitted.', data: { id: result.insertId } });
});

export const getMyCorrectionRequests = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, reviewer.full_name AS reviewed_by_name
     FROM attendance_correction_requests r
     LEFT JOIN employees reviewer ON reviewer.id = r.reviewed_by
     WHERE r.employee_id = ?
     ORDER BY r.created_at DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

export const listCorrectionRequests = asyncHandler(async (req, res) => {
  const conditions = ["COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'"];
  const values = [];
  const status = String(req.query.status || '').trim();
  const keyword = String(req.query.search || '').trim().toLowerCase();

  if (status && status !== 'ALL') {
    if (!['PENDING','APPROVED','REJECTED'].includes(status)) throw new AppError('Invalid correction status.', 400);
    conditions.push('r.status = ?');
    values.push(status);
  }
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', e.full_name, e.employee_id, e.designation,
      r.issue_type, r.correction_date, r.reason, r.status)) LIKE ?`);
    values.push(`%${keyword}%`);
  }
  if (req.user.role === 'MANAGER') {
    // Include direct reports and employees with no manager assigned so lists
    // are not empty when manager_id was never populated.
    conditions.push('(e.manager_id = ? OR e.manager_id IS NULL OR e.id = ?)');
    values.push(req.user.id, req.user.id);
  }

  const [rows] = await pool.query(
    `SELECT r.*, e.full_name AS employee_name, e.employee_id AS employee_code,
       e.designation, d.name AS department, reviewer.full_name AS reviewed_by_name
     FROM attendance_correction_requests r
     JOIN employees e ON e.id = r.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees reviewer ON reviewer.id = r.reviewed_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC`,
    values
  );
  res.json({ success: true, data: rows });
});

export const reviewCorrectionRequest = asyncHandler(async (req, res) => {
  const requestId = validId(req.params.id, 'request ID');
  const decision = req.body.status;
  if (!['APPROVED','REJECTED'].includes(decision)) throw new AppError('Select Approve or Reject.', 400);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query(
      `SELECT r.*,
         DATE_FORMAT(r.correction_date, '%Y-%m-%d') AS correction_date_text,
         DATE_FORMAT(r.requested_punch_in, '%Y-%m-%d %H:%i:%s') AS requested_punch_in_text,
         DATE_FORMAT(r.requested_punch_out, '%Y-%m-%d %H:%i:%s') AS requested_punch_out_text,
         e.full_name, e.employee_id AS employee_code
       FROM attendance_correction_requests r
       JOIN employees e ON e.id = r.employee_id
       WHERE r.id = ? FOR UPDATE`,
      [requestId]
    );
    if (!request) throw new AppError('Correction request not found.', 404);
    if (request.status !== 'PENDING') throw new AppError('This request has already been reviewed.', 409);
    if (Number(request.employee_id) === Number(req.user.id)) {
      throw new AppError('You cannot approve your own attendance correction.', 403);
    }

    const correctionDate = request.correction_date_text || String(request.correction_date).slice(0, 10);
    const [[currentAttendance]] = await connection.query(
      `SELECT
         DATE_FORMAT(punch_in, '%Y-%m-%d %H:%i:%s') AS punch_in_text,
         DATE_FORMAT(punch_out, '%Y-%m-%d %H:%i:%s') AS punch_out_text
       FROM attendance
       WHERE employee_id = ? AND attendance_date = ?
       LIMIT 1 FOR UPDATE`,
      [request.employee_id, correctionDate]
    );

    // Correct only the field(s) requested. Do not erase the other valid punch.
    let punchIn = request.requested_punch_in_text || currentAttendance?.punch_in_text || null;
    let punchOut = request.requested_punch_out_text || currentAttendance?.punch_out_text || null;
    if (req.body.approvedPunchIn) punchIn = toSqlDateTime(correctionDate, req.body.approvedPunchIn);
    if (req.body.approvedPunchOut) punchOut = toSqlDateTime(correctionDate, req.body.approvedPunchOut);

    if (decision === 'APPROVED') {
      if (punchIn && punchOut && wallClockMinutes(punchIn, punchOut) <= 0) {
        throw new AppError('Approved punch-out must be later than punch-in.', 400);
      }
      const totalMinutes = punchIn && punchOut
        ? Math.max(wallClockMinutes(punchIn, punchOut), 0)
        : 0;
      const status = deriveAttendanceStatus(punchIn, punchOut);

      await connection.query(
        `INSERT INTO attendance (
           employee_id, attendance_date, punch_in, punch_out, total_work_minutes, status, remarks
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           punch_in = VALUES(punch_in), punch_out = VALUES(punch_out),
           total_work_minutes = VALUES(total_work_minutes), status = VALUES(status),
           remarks = VALUES(remarks), updated_at = CURRENT_TIMESTAMP`,
        [request.employee_id, correctionDate, punchIn, punchOut, totalMinutes, status,
          `Attendance corrected by ${req.user.role}. ${String(req.body.reviewerComment || '').trim()}`]
      );
    }

    await connection.query(
      `UPDATE attendance_correction_requests
       SET status = ?, reviewed_by = ?, reviewer_comment = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [decision, req.user.id, String(req.body.reviewerComment || '').trim() || null, requestId]
    );

    await connection.query(
      `INSERT INTO audit_logs (employee_id, action, entity_type, entity_id, new_values, ip_address)
       VALUES (?, ?, 'ATTENDANCE_CORRECTION', ?, ?, ?)`,
      [req.user.id, `ATTENDANCE_CORRECTION_${decision}`, String(requestId),
        JSON.stringify({ employeeId: request.employee_id, date: correctionDate, punchIn, punchOut }),
        req.ip || null]
    );

    await connection.query(
      `INSERT INTO notifications (
         recipient_id, actor_id, type, title, message, reference_type, reference_id
       ) VALUES (?, ?, ?, ?, ?, 'ATTENDANCE_CORRECTION', ?)`,
      [
        request.employee_id,
        req.user.id,
        decision === 'APPROVED' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
        decision === 'APPROVED' ? 'Attendance Correction Approved' : 'Attendance Correction Rejected',
        `Your attendance correction for ${correctionDate} was ${decision.toLowerCase()}.${
          String(req.body.reviewerComment || '').trim()
            ? ` Comment: ${String(req.body.reviewerComment).trim()}`
            : ''
        }`,
        requestId
      ]
    );

    await connection.commit();
    res.json({ success: true, message: `Attendance correction ${decision.toLowerCase()} successfully.` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const adminUpsertAttendance = asyncHandler(async (req, res) => {
  const employeeId = validId(req.params.employeeId, 'employee ID');
  const date = String(req.params.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('Invalid attendance date.', 400);
  if (Number(employeeId) === Number(req.user.id) && req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Use your own punch controls or submit a correction request.', 403);
  }

  const punchIn = toSqlDateTime(date, req.body.punchIn);
  const punchOut = toSqlDateTime(date, req.body.punchOut);
  if (punchIn && punchOut && wallClockMinutes(punchIn, punchOut) <= 0) {
    throw new AppError('Punch-out must be later than punch-in.', 400);
  }
  const forcedStatus = req.body.status || null;
  const allowedStatuses = ['PRESENT','HALF_DAY','ABSENT','LEAVE','WEEK_OFF','HOLIDAY','MISSING_PUNCH'];
  if (forcedStatus && !allowedStatuses.includes(forcedStatus)) throw new AppError('Invalid attendance status.', 400);
  const totalMinutes = punchIn && punchOut ? Math.max(wallClockMinutes(punchIn, punchOut), 0) : 0;
  const status = deriveAttendanceStatus(punchIn, punchOut, forcedStatus);

  await pool.query(
    `INSERT INTO attendance (employee_id, attendance_date, punch_in, punch_out, total_work_minutes, status, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE punch_in = VALUES(punch_in), punch_out = VALUES(punch_out),
       total_work_minutes = VALUES(total_work_minutes), status = VALUES(status),
       remarks = VALUES(remarks), updated_at = CURRENT_TIMESTAMP`,
    [employeeId, date, punchIn, punchOut, totalMinutes, status,
      String(req.body.remarks || '').trim() || `Manual attendance by ${req.user.role}`]
  );

  await pool.query(
    `INSERT INTO audit_logs (employee_id, action, entity_type, entity_id, new_values, ip_address)
     VALUES (?, 'MANUAL_ATTENDANCE_UPDATE', 'ATTENDANCE', ?, ?, ?)`,
    [req.user.id, `${employeeId}:${date}`, JSON.stringify({ punchIn, punchOut, status, totalMinutes }), req.ip || null]
  );

  res.json({ success: true, message: 'Attendance updated successfully.' });
});
