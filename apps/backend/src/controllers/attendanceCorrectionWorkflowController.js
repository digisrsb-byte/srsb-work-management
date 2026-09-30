import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  assertCompanyAccess,
  getCompanyIdsForUser
} from '../services/permissionService.js';
import { createNotification } from '../services/notificationService.js';
import { DAY_OFF_CORRECTION_MESSAGE, isValidDateKey } from '../services/attendanceDayRules.js';
import { resolveEmployeeDay } from '../services/attendanceScheduleService.js';
import { assertAttendanceDateEditable } from '../services/attendancePeriodService.js';

function toMysqlDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  // timeStr expected HH:mm or HH:mm:ss
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return toMysqlDateTime(`${dateStr}T${t}`);
}

function minutesBetween(punchIn, punchOut) {
  if (!punchIn || !punchOut) return 0;
  const a = new Date(punchIn).getTime();
  const b = new Date(punchOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

export async function upsertAttendanceForDate({
  employeeId,
  date,
  status,
  punchIn,
  punchOut,
  remarks = null
}) {
  await assertAttendanceDateEditable(employeeId, date);
  const workMinutes = minutesBetween(punchIn, punchOut);
  const [existing] = await pool.query(
    `SELECT id, status, punch_in, punch_out
     FROM attendance
     WHERE employee_id = ? AND attendance_date = ?
     LIMIT 1`,
    [employeeId, date]
  );

  if (existing.length) {
    await pool.query(
      `UPDATE attendance
       SET punch_in = ?, punch_out = ?, total_work_minutes = ?, status = ?, remarks = ?
       WHERE id = ?`,
      [punchIn, punchOut, workMinutes, status, remarks, existing[0].id]
    );
    return { id: existing[0].id, previous: existing[0] };
  }

  const [result] = await pool.query(
    `INSERT INTO attendance (
       employee_id, attendance_date, punch_in, punch_out, total_work_minutes, status, remarks
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [employeeId, date, punchIn, punchOut, workMinutes, status, remarks]
  );
  return {
    id: result.insertId,
    previous: { status: 'NOT_PUNCHED', punch_in: null, punch_out: null }
  };
}

async function getEmployeeScoped(req, employeeId) {
  const [rows] = await pool.query(
    `SELECT id, employee_id, full_name, company_id, status
     FROM employees WHERE id = ? LIMIT 1`,
    [employeeId]
  );
  if (!rows.length) throw new AppError('Employee not found.', 404);
  await assertCompanyAccess(req.user, rows[0].company_id);
  return rows[0];
}

export const createAttendanceCorrection = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;
  const {
    date,
    requestedStatus = 'PRESENT',
    requestedPunchIn,
    requestedPunchOut,
    reason
  } = req.body;

  if (!date || !reason?.trim()) {
    throw new AppError('Date and reason are required.', 400);
  }
  if (!['PRESENT', 'HALF_DAY'].includes(requestedStatus)) {
    throw new AppError('Requested status must be Present or Half Day.', 400);
  }
  if (!isValidDateKey(date)) {
    throw new AppError('Valid date required (YYYY-MM-DD)', 400);
  }

  const { schedule, day } = await resolveEmployeeDay(employeeId, date);
  if (day.isDayOff) {
    throw new AppError(DAY_OFF_CORRECTION_MESSAGE, 400);
  }
  if (day.isFuture) {
    throw new AppError('Corrections can only be requested for today or earlier dates.', 400);
  }
  if (schedule.joiningDate && date < schedule.joiningDate) {
    throw new AppError('Corrections cannot be requested for dates before your joining date.', 400);
  }
  await assertAttendanceDateEditable(employeeId, date);

  if (!requestedPunchIn || !requestedPunchOut) {
    throw new AppError('Requested punch in and punch out are required.', 400);
  }

  const punchIn = combineDateAndTime(date, requestedPunchIn);
  const punchOut = combineDateAndTime(date, requestedPunchOut);
  if (!punchIn || !punchOut) {
    throw new AppError('Invalid punch in / punch out time.', 400);
  }
  if (new Date(punchOut) <= new Date(punchIn)) {
    throw new AppError('Punch out must be after punch in.', 400);
  }

  const [pending] = await pool.query(
    `SELECT id FROM attendance_correction_requests
     WHERE employee_id = ? AND correction_date = ? AND status = 'PENDING'
     LIMIT 1`,
    [employeeId, date]
  );
  if (pending.length) {
    throw new AppError('A pending correction already exists for this date.', 409);
  }

  const [att] = await pool.query(
    `SELECT id, status, punch_in, punch_out
     FROM attendance
     WHERE employee_id = ? AND attendance_date = ?
     LIMIT 1`,
    [employeeId, date]
  );
  const current = att[0];
  const currentStatus = current?.status || 'NOT_PUNCHED';

  const [result] = await pool.query(
    `INSERT INTO attendance_correction_requests (
       employee_id, attendance_id, correction_date, current_status, requested_status,
       requested_punch_in, requested_punch_out, previous_punch_in, previous_punch_out,
       reason, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      employeeId,
      current?.id || null,
      date,
      currentStatus,
      requestedStatus,
      punchIn,
      punchOut,
      current?.punch_in || null,
      current?.punch_out || null,
      reason.trim()
    ]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ATTENDANCE_CORRECTION_SUBMITTED',
    entityType: 'attendance_correction_requests',
    entityId: result.insertId,
    newValues: { date, requestedStatus, punchIn, punchOut, reason: reason.trim() },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: 'Attendance correction request submitted.',
    data: { id: result.insertId }
  });
});

export const listMyAttendanceCorrections = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       acr.*,
       rev.full_name AS reviewed_by_name
     FROM attendance_correction_requests acr
     LEFT JOIN employees rev ON rev.id = acr.reviewed_by
     WHERE acr.employee_id = ?
     ORDER BY acr.correction_date DESC, acr.id DESC
     LIMIT 100`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

export const cancelAttendanceCorrection = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query(
    `SELECT * FROM attendance_correction_requests WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw new AppError('Correction request not found.', 404);
  if (Number(rows[0].employee_id) !== Number(req.user.id)) {
    throw new AppError('You can only cancel your own requests.', 403);
  }
  if (rows[0].status !== 'PENDING') {
    throw new AppError('Only pending requests can be cancelled.', 400);
  }

  await pool.query(
    `UPDATE attendance_correction_requests
     SET status = 'CANCELLED', updated_at = NOW()
     WHERE id = ?`,
    [id]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ATTENDANCE_CORRECTION_CANCELLED',
    entityType: 'attendance_correction_requests',
    entityId: id,
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Correction request cancelled.' });
});

export const listAttendanceCorrections = asyncHandler(async (req, res) => {
  const companyIds = await getCompanyIdsForUser(req.user);
  const status = req.query.status || null;

  let sql = `
    SELECT
      acr.*,
      e.full_name AS employee_name,
      e.employee_id AS employee_code,
      e.company_id,
      rev.full_name AS reviewed_by_name
    FROM attendance_correction_requests acr
    INNER JOIN employees e ON e.id = acr.employee_id
    LEFT JOIN employees rev ON rev.id = acr.reviewed_by
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) return res.json({ success: true, data: [] });
    sql += ' AND e.company_id IN (?)';
    params.push(companyIds);
  }
  if (status) {
    sql += ' AND acr.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY FIELD(acr.status, \'PENDING\',\'APPROVED\',\'REJECTED\',\'CANCELLED\'), acr.created_at DESC LIMIT 200';

  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

export const approveAttendanceCorrection = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query(
    `SELECT acr.*, e.company_id, e.full_name
     FROM attendance_correction_requests acr
     INNER JOIN employees e ON e.id = acr.employee_id
     WHERE acr.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw new AppError('Correction request not found.', 404);
  const request = rows[0];
  await assertCompanyAccess(req.user, request.company_id);
  if (request.status !== 'PENDING') {
    throw new AppError('Only pending requests can be approved.', 400);
  }

  const applied = await upsertAttendanceForDate({
    employeeId: request.employee_id,
    date: String(request.correction_date).slice(0, 10),
    status: request.requested_status,
    punchIn: request.requested_punch_in,
    punchOut: request.requested_punch_out,
    remarks: `Corrected via request #${id}`
  });

  await pool.query(
    `UPDATE attendance_correction_requests
     SET status = 'APPROVED',
         reviewed_by = ?,
         reviewed_at = NOW(),
         reviewer_comment = ?,
         attendance_id = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [req.user.id, req.body.comment || 'Approved', applied.id, id]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ATTENDANCE_CORRECTION_APPROVED',
    entityType: 'attendance_correction_requests',
    entityId: id,
    oldValues: {
      status: request.current_status,
      punch_in: request.previous_punch_in,
      punch_out: request.previous_punch_out
    },
    newValues: {
      status: request.requested_status,
      punch_in: request.requested_punch_in,
      punch_out: request.requested_punch_out,
      reviewedByRole: req.user.role
    },
    ipAddress: req.ip
  });

  await createNotification({
    recipientId: request.employee_id,
    actorId: req.user.id,
    type: 'ATTENDANCE_CORRECTION_APPROVED',
    title: 'Attendance correction approved',
    message: `Your correction for ${String(request.correction_date).slice(0, 10)} was approved.`,
    referenceType: 'ATTENDANCE',
    referenceId: id
  });

  res.json({
    success: true,
    message: 'Correction approved. Attendance updated.'
  });
});

export const rejectAttendanceCorrection = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new AppError('Rejection reason is required.', 400);

  const [rows] = await pool.query(
    `SELECT acr.*, e.company_id
     FROM attendance_correction_requests acr
     INNER JOIN employees e ON e.id = acr.employee_id
     WHERE acr.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw new AppError('Correction request not found.', 404);
  const request = rows[0];
  await assertCompanyAccess(req.user, request.company_id);
  if (request.status !== 'PENDING') {
    throw new AppError('Only pending requests can be rejected.', 400);
  }

  await pool.query(
    `UPDATE attendance_correction_requests
     SET status = 'REJECTED',
         reviewed_by = ?,
         reviewed_at = NOW(),
         reviewer_comment = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [req.user.id, reason, id]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ATTENDANCE_CORRECTION_REJECTED',
    entityType: 'attendance_correction_requests',
    entityId: id,
    newValues: { reason, reviewedByRole: req.user.role },
    ipAddress: req.ip
  });

  await createNotification({
    recipientId: request.employee_id,
    actorId: req.user.id,
    type: 'ATTENDANCE_CORRECTION_REJECTED',
    title: 'Attendance correction rejected',
    message: `Your correction for ${String(request.correction_date).slice(0, 10)} was rejected: ${reason}`,
    referenceType: 'ATTENDANCE',
    referenceId: id
  });

  res.json({ success: true, message: 'Correction rejected. Attendance unchanged.' });
});

export const manualAttendanceOverride = asyncHandler(async (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(req.user.role)) {
    throw new AppError('Only Admin/HR/Super Admin can override attendance.', 403);
  }

  const employeeId = Number(req.body.employeeId);
  const date = req.body.date;
  const status = req.body.status;
  const reason = String(req.body.reason || '').trim();
  const punchInTime = req.body.punchIn;
  const punchOutTime = req.body.punchOut;

  if (!employeeId || !date || !status || !reason) {
    throw new AppError('Employee, date, status and reason are required.', 400);
  }
  if (!['PRESENT', 'HALF_DAY', 'ABSENT'].includes(status)) {
    throw new AppError('Status must be Present, Half Day or Absent.', 400);
  }

  const employee = await getEmployeeScoped(req, employeeId);

  let punchIn = null;
  let punchOut = null;
  if (status !== 'ABSENT') {
    if (!punchInTime || !punchOutTime) {
      throw new AppError('Punch in and punch out are required for Present/Half Day.', 400);
    }
    punchIn = combineDateAndTime(date, punchInTime);
    punchOut = combineDateAndTime(date, punchOutTime);
    if (!punchIn || !punchOut || new Date(punchOut) <= new Date(punchIn)) {
      throw new AppError('Invalid punch times.', 400);
    }
  }

  const applied = await upsertAttendanceForDate({
    employeeId,
    date,
    status,
    punchIn,
    punchOut,
    remarks: `Manual override: ${reason}`
  });

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'MANUAL_ATTENDANCE_OVERRIDE',
    entityType: 'attendance',
    entityId: applied.id,
    oldValues: {
      employeeId,
      date,
      status: applied.previous.status,
      punch_in: applied.previous.punch_in,
      punch_out: applied.previous.punch_out
    },
    newValues: {
      status,
      punch_in: punchIn,
      punch_out: punchOut,
      reason,
      changedByRole: req.user.role,
      employeeName: employee.full_name
    },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: 'Attendance override saved.',
    data: { attendanceId: applied.id }
  });
});
