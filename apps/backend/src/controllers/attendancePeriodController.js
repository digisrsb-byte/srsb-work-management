import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { writeAuditLog } from '../services/auditService.js';
import { assertCompanyAccess, getCompanyIdsForUser } from '../services/permissionService.js';
import {
  getAttendancePeriodLock,
  getAttendancePeriodSummary,
  periodLabel
} from '../services/attendancePeriodService.js';

async function resolveCompanyId(user, requested) {
  if (requested) {
    await assertCompanyAccess(user, Number(requested));
    return Number(requested);
  }
  const ids = await getCompanyIdsForUser(user);
  if (!ids.length) throw new AppError('No company is assigned to your account.', 400);
  return ids[0];
}

function readPeriod(source) {
  const year = Number(source.year);
  const month = Number(source.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError('Valid year required.', 400);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AppError('Valid month required.', 400);
  return { year, month };
}

export const getAttendancePeriod = asyncHandler(async (req, res) => {
  const companyId = await resolveCompanyId(req.user, req.query.companyId);
  const { year, month } = readPeriod(req.query);
  const summary = await getAttendancePeriodSummary(companyId, year, month);
  res.json({ success: true, data: summary });
});

export const finalizeAttendancePeriod = asyncHandler(async (req, res) => {
  const companyId = await resolveCompanyId(req.user, req.body.companyId);
  const { year, month } = readPeriod(req.body);
  const summary = await getAttendancePeriodSummary(companyId, year, month);

  if (summary.status === 'FINALIZED') {
    throw new AppError(`Attendance for ${periodLabel(year, month)} is already finalized.`, 409);
  }
  if (summary.blockers.length) {
    throw new AppError(
      `Attendance cannot be finalized yet: ${summary.blockers.map((b) => b.message).join(' ')}`,
      409
    );
  }

  const snapshot = {
    employees: summary.employees,
    present: summary.present,
    halfDay: summary.halfDay,
    absent: summary.absent,
    leave: summary.leave,
    holiday: summary.holiday,
    missingPunch: summary.missingPunch
  };

  await pool.query(
    `INSERT INTO attendance_period_locks (
       company_id, period_year, period_month, status, summary, finalized_by, finalized_at
     ) VALUES (?, ?, ?, 'FINALIZED', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       status = 'FINALIZED',
       summary = VALUES(summary),
       finalized_by = VALUES(finalized_by),
       finalized_at = NOW()`,
    [companyId, year, month, JSON.stringify(snapshot), req.user.id]
  );

  const lock = await getAttendancePeriodLock(companyId, year, month);
  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ATTENDANCE_PERIOD_FINALIZED',
    entityType: 'attendance_period_locks',
    entityId: lock?.id,
    newValues: { companyId, year, month, ...snapshot },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `Attendance for ${periodLabel(year, month)} finalized. Payroll can now use it.`,
    data: await getAttendancePeriodSummary(companyId, year, month)
  });
});

export const reopenAttendancePeriod = asyncHandler(async (req, res) => {
  const companyId = await resolveCompanyId(req.user, req.body.companyId);
  const { year, month } = readPeriod(req.body);
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new AppError('A reason is required to reopen attendance.', 400);

  const lock = await getAttendancePeriodLock(companyId, year, month);
  if (lock?.status !== 'FINALIZED') {
    throw new AppError(`Attendance for ${periodLabel(year, month)} is not finalized.`, 409);
  }

  const [runs] = await pool.query(
    `SELECT status FROM payroll_runs
     WHERE company_id = ? AND period_year = ? AND period_month = ? LIMIT 1`,
    [companyId, year, month]
  );
  if (runs[0] && ['APPROVED', 'LOCKED', 'PAID'].includes(runs[0].status)) {
    throw new AppError(
      `Payroll for ${periodLabel(year, month)} is ${runs[0].status}. Reopen the payroll run before reopening attendance.`,
      409
    );
  }

  await pool.query(
    `UPDATE attendance_period_locks
     SET status = 'REOPENED', reopened_by = ?, reopened_at = NOW(), reopen_reason = ?
     WHERE id = ?`,
    [req.user.id, reason.slice(0, 500), lock.id]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ATTENDANCE_PERIOD_REOPENED',
    entityType: 'attendance_period_locks',
    entityId: lock.id,
    oldValues: { status: 'FINALIZED' },
    newValues: { status: 'REOPENED', reason, companyId, year, month },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `Attendance for ${periodLabel(year, month)} reopened.`,
    data: await getAttendancePeriodSummary(companyId, year, month)
  });
});
