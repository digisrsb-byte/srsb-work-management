import { pool } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function periodBounds(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
}

export function periodLabel(year, month) {
  return `${pad2(month)}/${year}`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export async function getAttendancePeriodLock(companyId, year, month, db = pool) {
  const [rows] = await db.query(
    `SELECT apl.*, fb.full_name AS finalized_by_name, rb.full_name AS reopened_by_name
     FROM attendance_period_locks apl
     LEFT JOIN employees fb ON fb.id = apl.finalized_by
     LEFT JOIN employees rb ON rb.id = apl.reopened_by
     WHERE apl.company_id = ? AND apl.period_year = ? AND apl.period_month = ?
     LIMIT 1`,
    [companyId, year, month]
  );
  return rows[0] || null;
}

export async function isAttendancePeriodFinalized(companyId, year, month, db = pool) {
  const lock = await getAttendancePeriodLock(companyId, year, month, db);
  return lock?.status === 'FINALIZED';
}

/**
 * Throws when the employee's company has finalized attendance for the month of `date`.
 * Every attendance write that is not a live punch must pass through this guard.
 */
export async function assertAttendanceDateEditable(employeeId, date, db = pool) {
  const key = String(date).slice(0, 10);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const [emps] = await db.query(`SELECT company_id FROM employees WHERE id = ? LIMIT 1`, [employeeId]);
  const companyId = emps[0]?.company_id;
  if (!companyId) return;
  if (await isAttendancePeriodFinalized(companyId, year, month, db)) {
    throw new AppError(
      `Attendance for ${periodLabel(year, month)} is finalized for payroll. An Admin must reopen the month before it can be changed.`,
      409
    );
  }
}

/**
 * Month-level attendance readiness for a company, using the same employee set as payroll
 * (active, non Super Admin) and the same status buckets as the salary engine.
 */
export async function getAttendancePeriodSummary(companyId, year, month) {
  const { start, end } = periodBounds(year, month);

  const [[employeeRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM employees
     WHERE company_id = ? AND status = 'ACTIVE' AND role <> 'SUPER_ADMIN'`,
    [companyId]
  );

  const [statusRows] = await pool.query(
    `SELECT a.status, COUNT(*) AS cnt
     FROM attendance a
     INNER JOIN employees e ON e.id = a.employee_id
     WHERE e.company_id = ? AND e.status = 'ACTIVE' AND e.role <> 'SUPER_ADMIN'
       AND a.attendance_date BETWEEN ? AND ?
     GROUP BY a.status`,
    [companyId, start, end]
  );
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.cnt)]));

  const [openRows] = await pool.query(
    `SELECT a.employee_id, e.employee_id AS emp_code, e.full_name, a.attendance_date, a.punch_in
     FROM attendance a
     INNER JOIN employees e ON e.id = a.employee_id
     WHERE e.company_id = ? AND e.status = 'ACTIVE' AND e.role <> 'SUPER_ADMIN'
       AND a.attendance_date BETWEEN ? AND ?
       AND a.attendance_date < CURDATE()
       AND a.punch_in IS NOT NULL AND a.punch_out IS NULL
     ORDER BY a.attendance_date, e.full_name`,
    [companyId, start, end]
  );
  const openRow = {
    cnt: openRows.length,
    employees: new Set(openRows.map((r) => r.employee_id)).size
  };

  const [[pendingRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM attendance_correction_requests acr
     INNER JOIN employees e ON e.id = acr.employee_id
     WHERE e.company_id = ? AND acr.status = 'PENDING'
       AND acr.correction_date BETWEEN ? AND ?`,
    [companyId, start, end]
  );

  const [[employeesWithRecords]] = await pool.query(
    `SELECT COUNT(DISTINCT a.employee_id) AS cnt
     FROM attendance a
     INNER JOIN employees e ON e.id = a.employee_id
     WHERE e.company_id = ? AND e.status = 'ACTIVE' AND e.role <> 'SUPER_ADMIN'
       AND a.attendance_date BETWEEN ? AND ?`,
    [companyId, start, end]
  );

  const lock = await getAttendancePeriodLock(companyId, year, month);
  const [runs] = await pool.query(
    `SELECT id, status FROM payroll_runs
     WHERE company_id = ? AND period_year = ? AND period_month = ?
     LIMIT 1`,
    [companyId, year, month]
  );

  const monthEnded = end < todayKey();
  const openPunches = Number(openRow.cnt || 0);
  const pendingCorrections = Number(pendingRow.cnt || 0);

  const blockers = [];
  if (!monthEnded) {
    blockers.push({ code: 'MONTH_NOT_ENDED', message: `${periodLabel(year, month)} has not ended yet.` });
  }
  if (pendingCorrections > 0) {
    blockers.push({
      code: 'PENDING_CORRECTIONS',
      message: `${pendingCorrections} attendance correction request${pendingCorrections === 1 ? '' : 's'} still pending review.`
    });
  }
  if (openPunches > 0) {
    blockers.push({
      code: 'OPEN_PUNCHES',
      message: `${openPunches} day${openPunches === 1 ? '' : 's'} with a punch-in but no punch-out. Resolve them with a correction or override.`
    });
  }

  return {
    companyId: Number(companyId),
    periodYear: Number(year),
    periodMonth: Number(month),
    start,
    end,
    monthEnded,
    employees: Number(employeeRow.total || 0),
    employeesWithRecords: Number(employeesWithRecords.cnt || 0),
    present: byStatus.PRESENT || 0,
    halfDay: byStatus.HALF_DAY || 0,
    absent: byStatus.ABSENT || 0,
    leave: byStatus.LEAVE || 0,
    holiday: (byStatus.HOLIDAY || 0) + (byStatus.WEEK_OFF || 0),
    missingPunch: byStatus.MISSING_PUNCH || 0,
    openPunches,
    openPunchEmployees: Number(openRow.employees || 0),
    openPunchDays: openRows.slice(0, 50).map((r) => ({
      employeeId: r.employee_id,
      empCode: r.emp_code,
      fullName: r.full_name,
      date: String(r.attendance_date).slice(0, 10),
      punchIn: String(r.punch_in || '').match(/\d{2}:\d{2}/)?.[0] || null
    })),
    pendingCorrections,
    blockers,
    canFinalize: !blockers.length && lock?.status !== 'FINALIZED',
    status: lock?.status === 'FINALIZED' ? 'FINALIZED' : lock?.status === 'REOPENED' ? 'REOPENED' : 'OPEN',
    lock: lock
      ? {
          status: lock.status,
          finalizedAt: lock.finalized_at,
          finalizedByName: lock.finalized_by_name,
          reopenedAt: lock.reopened_at,
          reopenedByName: lock.reopened_by_name,
          reopenReason: lock.reopen_reason
        }
      : null,
    payrollRun: runs[0] ? { id: runs[0].id, status: runs[0].status } : null
  };
}
