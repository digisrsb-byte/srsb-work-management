import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const INDIA_NOW_SQL =
  'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)';
const INDIA_DATE_SQL =
  'DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE))';

const LUNCH_INCLUDED_MINUTES = 30;
const BREAK_TYPES = [
  'LUNCH',
  'TEA',
  'PERSONAL',
  'OTHER'
];

function indiaDateNow() {
  return new Date(Date.now() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function attendanceDateValue(value) {
  const date = String(value || '').slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(
      'Select a valid attendance date.',
      400
    );
  }

  return date;
}

function ensureEmployeeAccount(req) {
  if (req.user.accountType === 'SYSTEM') {
    throw new AppError(
      'Head Admin system accounts do not use employee attendance.',
      403
    );
  }
}

function normalizeBreakType(value) {
  const type = String(value || '')
    .trim()
    .toUpperCase();

  if (!BREAK_TYPES.includes(type)) {
    throw new AppError(
      'Select Lunch, Tea, Personal or Other break.',
      400
    );
  }

  return type;
}

function breakTypeLabel(type) {
  return String(type || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

async function getBreakSummary(employeeId, date) {
  const [rows] = await pool.query(
    `SELECT
       id,
       attendance_id,
       employee_id,
       DATE_FORMAT(
         attendance_date,
         '%Y-%m-%d'
       ) AS attendance_date,
       break_type,
       started_at,
       ended_at,
       CASE
         WHEN ended_at IS NOT NULL
           THEN GREATEST(
             TIMESTAMPDIFF(
               MINUTE,
               started_at,
               ended_at
             ),
             0
           )
         WHEN attendance_date = ${INDIA_DATE_SQL}
           THEN GREATEST(
             TIMESTAMPDIFF(
               MINUTE,
               started_at,
               ${INDIA_NOW_SQL}
             ),
             0
           )
         ELSE GREATEST(
           COALESCE(duration_minutes, 0),
           0
         )
       END AS calculated_minutes,
       source
     FROM attendance_breaks
     WHERE employee_id = ?
       AND attendance_date = ?
     ORDER BY started_at ASC, id ASC`,
    [employeeId, date]
  );

  let lunchIncludedRemaining =
    LUNCH_INCLUDED_MINUTES;

  let totalBreakMinutes = 0;
  let includedBreakMinutes = 0;
  let deductedBreakMinutes = 0;

  const breaks = rows.map((row) => {
    const durationMinutes = Math.max(
      Number(row.calculated_minutes || 0),
      0
    );

    let includedMinutes = 0;

    if (
      row.break_type === 'LUNCH' &&
      lunchIncludedRemaining > 0
    ) {
      includedMinutes = Math.min(
        durationMinutes,
        lunchIncludedRemaining
      );

      lunchIncludedRemaining -= includedMinutes;
    }

    const deductedMinutes = Math.max(
      durationMinutes - includedMinutes,
      0
    );

    totalBreakMinutes += durationMinutes;
    includedBreakMinutes += includedMinutes;
    deductedBreakMinutes += deductedMinutes;

    return {
      id: row.id,
      attendanceId: row.attendance_id,
      employeeId: row.employee_id,
      date: row.attendance_date,
      breakType: row.break_type,
      breakTypeLabel:
        breakTypeLabel(row.break_type),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationMinutes,
      includedMinutes,
      deductedMinutes,
      source: row.source || 'APP',
      isActive: !row.ended_at
    };
  });

  return {
    breaks,
    activeBreak:
      breaks.find((item) => item.isActive) || null,
    breakCount: breaks.length,
    totalBreakMinutes,
    includedBreakMinutes,
    deductedBreakMinutes,
    lunchIncludedLimitMinutes:
      LUNCH_INCLUDED_MINUTES
  };
}

async function getGrossWorkedMinutes(attendanceId) {
  const [[row]] = await pool.query(
    `SELECT GREATEST(
       TIMESTAMPDIFF(
         MINUTE,
         punch_in,
         ${INDIA_NOW_SQL}
       ),
       0
     ) AS gross_minutes
     FROM attendance
     WHERE id = ?
     LIMIT 1`,
    [attendanceId]
  );

  return Math.max(
    Number(row?.gross_minutes || 0),
    0
  );
}

async function syncAttendanceBreakTotals(
  attendanceId,
  employeeId,
  date
) {
  const summary = await getBreakSummary(
    employeeId,
    date
  );

  const grossMinutes =
    await getGrossWorkedMinutes(attendanceId);

  const effectiveWorkMinutes = Math.max(
    grossMinutes - summary.deductedBreakMinutes,
    0
  );

  await pool.query(
    `UPDATE attendance
     SET
       total_work_minutes = ?,
       total_break_minutes = ?,
       included_break_minutes = ?,
       deducted_break_minutes = ?
     WHERE id = ?`,
    [
      effectiveWorkMinutes,
      summary.totalBreakMinutes,
      summary.includedBreakMinutes,
      summary.deductedBreakMinutes,
      attendanceId
    ]
  );

  return {
    ...summary,
    effectiveWorkMinutes
  };
}

export const todayAttendanceSummary =
  asyncHandler(async (req, res) => {
    ensureEmployeeAccount(req);

    const employeeId = req.user.id;
    const date = indiaDateNow();

    const [[attendance]] = await pool.query(
      `SELECT
       id,
       DATE_FORMAT(
         attendance_date,
         '%Y-%m-%d'
       ) AS attendance_date,
       punch_in,
       punch_out,
       total_work_minutes,
       status,
       remarks
       FROM attendance
       WHERE employee_id = ?
         AND attendance_date = ${INDIA_DATE_SQL}
       LIMIT 1`,
      [employeeId]
    );

    const summary = await getBreakSummary(
      employeeId,
      date
    );

    let effectiveWorkMinutes = Number(
      attendance?.total_work_minutes || 0
    );

    if (
      attendance?.punch_in &&
      !attendance?.punch_out
    ) {
      const grossMinutes =
        await getGrossWorkedMinutes(attendance.id);

      effectiveWorkMinutes = Math.max(
        grossMinutes -
          summary.deductedBreakMinutes,
        0
      );
    }

    res.json({
      success: true,
      data: {
        attendance: attendance
          ? {
              ...attendance,
              effectiveWorkMinutes
            }
          : null,
        ...summary
      }
    });
  });

export const startAttendanceBreak =
  asyncHandler(async (req, res) => {
    ensureEmployeeAccount(req);

    const employeeId = req.user.id;
    const type =
      normalizeBreakType(req.body.breakType);

    const [[attendance]] = await pool.query(
      `SELECT id, punch_in, punch_out
       FROM attendance
       WHERE employee_id = ?
         AND attendance_date = ${INDIA_DATE_SQL}
       LIMIT 1`,
      [employeeId]
    );

    if (!attendance?.punch_in) {
      throw new AppError(
        'Punch in before starting a break.',
        400
      );
    }

    if (attendance.punch_out) {
      throw new AppError(
        'Attendance is already punched out for today.',
        409
      );
    }

    const current = await getBreakSummary(
      employeeId,
      indiaDateNow()
    );

    if (current.activeBreak) {
      throw new AppError(
        `You are already on ${
          current.activeBreak.breakTypeLabel
        }.`,
        409
      );
    }

    await pool.query(
      `INSERT INTO attendance_breaks (
       attendance_id,
       employee_id,
       attendance_date,
       break_type,
       started_at,
       source
       ) VALUES (
         ?,
         ?,
         ${INDIA_DATE_SQL},
         ?,
         ${INDIA_NOW_SQL},
         'APP'
       )`,
      [
        attendance.id,
        employeeId,
        type
      ]
    );

    res.json({
      success: true,
      message:
        `${breakTypeLabel(type)} started.`,
      data: await getBreakSummary(
        employeeId,
        indiaDateNow()
      )
    });
  });

export const endAttendanceBreak =
  asyncHandler(async (req, res) => {
    ensureEmployeeAccount(req);

    const employeeId = req.user.id;
    const date = indiaDateNow();

    const [[activeBreak]] = await pool.query(
      `SELECT
       id,
       attendance_id,
       break_type
       FROM attendance_breaks
       WHERE employee_id = ?
         AND attendance_date = ${INDIA_DATE_SQL}
         AND ended_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [employeeId]
    );

    if (!activeBreak) {
      throw new AppError(
        'There is no active break to end.',
        409
      );
    }

    await pool.query(
      `UPDATE attendance_breaks
       SET
         ended_at = ${INDIA_NOW_SQL},
         duration_minutes = GREATEST(
           TIMESTAMPDIFF(
             MINUTE,
             started_at,
             ${INDIA_NOW_SQL}
           ),
           0
         )
       WHERE id = ?`,
      [activeBreak.id]
    );

    const summary =
      await syncAttendanceBreakTotals(
        activeBreak.attendance_id,
        employeeId,
        date
      );

    res.json({
      success: true,
      message:
        `${breakTypeLabel(
          activeBreak.break_type
        )} ended.`,
      data: summary
    });
  });

export const adminAttendanceBreaks =
  asyncHandler(async (req, res) => {
    const employeeId =
      Number(req.query.employeeId);

    if (
      !Number.isInteger(employeeId) ||
      employeeId <= 0
    ) {
      throw new AppError(
        'Select a valid employee.',
        400
      );
    }

    const date = attendanceDateValue(
      req.query.date || indiaDateNow()
    );

    const [[employee]] = await pool.query(
      `SELECT id, full_name
       FROM employees
       WHERE id = ?
         AND COALESCE(
           account_type,
           'EMPLOYEE'
         ) = 'EMPLOYEE'
       LIMIT 1`,
      [employeeId]
    );

    if (!employee) {
      throw new AppError(
        'Employee not found.',
        404
      );
    }

    res.json({
      success: true,
      data: {
        employeeId,
        employeeName: employee.full_name,
        date,
        ...(await getBreakSummary(
          employeeId,
          date
        ))
      }
    });
  });
