import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { backfillApprovedLeaveAttendance } from '../utils/leaveAttendance.js';

const allowedStatuses = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'WEEK_OFF',
  'HOLIDAY',
  'MISSING_PUNCH'
];
const INDIA_NOW_SQL = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)';
const INDIA_DATE_SQL = 'DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE))';

function indiaDateNow() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeWallClockDateTime(value, label = 'Date/time') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) throw new AppError(`${label} is invalid.`, 400);
  return `${match[1]} ${match[2]}:${match[3]}:${match[4] || '00'}`;
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


function ensureEmployeeAccount(req) {
  if (req.user.accountType === 'SYSTEM') {
    throw new AppError(
      'Head Admin system accounts do not use employee attendance.',
      403
    );
  }
}

export const punchIn = asyncHandler(async (req, res) => {
  ensureEmployeeAccount(req);

  const employeeId = req.user.id;

  const [[employee]] = await pool.query(
    `SELECT id, status, account_type
     FROM employees
     WHERE id = ?
     LIMIT 1`,
    [employeeId]
  );

  if (!employee || employee.status !== 'ACTIVE') {
    throw new AppError(
      'Your employee account is not active.',
      403
    );
  }

  if (employee.account_type === 'SYSTEM') {
    throw new AppError(
      'Head Admin system accounts do not use employee attendance.',
      403
    );
  }

  const [existing] = await pool.query(
    `SELECT id, punch_in
     FROM attendance
     WHERE employee_id = ?
       AND attendance_date = ${INDIA_DATE_SQL}
     LIMIT 1`,
    [employeeId]
  );

  if (existing[0]?.punch_in) {
    throw new AppError(
      'You have already punched in today.',
      409
    );
  }

  if (existing.length) {
    await pool.query(
      `UPDATE attendance
       SET
         punch_in = ${INDIA_NOW_SQL},
         punch_out = NULL,
         total_work_minutes = 0,
         status = 'PRESENT'
       WHERE id = ?`,
      [existing[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO attendance (
         employee_id,
         attendance_date,
         punch_in,
         total_work_minutes,
         status
       )
       VALUES (?, ${INDIA_DATE_SQL}, ${INDIA_NOW_SQL}, 0, 'PRESENT')`,
      [employeeId]
    );
  }

  const [[record]] = await pool.query(
    `SELECT
       id,
       attendance_date,
       punch_in,
       punch_out,
       total_work_minutes,
       status
     FROM attendance
     WHERE employee_id = ?
       AND attendance_date = ${INDIA_DATE_SQL}
     LIMIT 1`,
    [employeeId]
  );

  res.json({
    success: true,
    message: 'Punch-in recorded.',
    data: record
  });
});

export const punchOut = asyncHandler(async (req, res) => {
  ensureEmployeeAccount(req);

  const employeeId = req.user.id;

  const [rows] = await pool.query(
    `SELECT
       id,
       punch_in,
       punch_out
     FROM attendance
     WHERE employee_id = ?
       AND attendance_date = ${INDIA_DATE_SQL}
     LIMIT 1`,
    [employeeId]
  );

  const attendance = rows[0];

  if (!attendance?.punch_in) {
    throw new AppError(
      'Punch in before punching out.',
      400
    );
  }

  if (attendance.punch_out) {
    throw new AppError(
      'You have already punched out today.',
      409
    );
  }

  await pool.query(
    `UPDATE attendance
     SET
       punch_out = ${INDIA_NOW_SQL},
       total_work_minutes =
         GREATEST(TIMESTAMPDIFF(MINUTE, punch_in, ${INDIA_NOW_SQL}), 0),
       status = CASE
         WHEN GREATEST(TIMESTAMPDIFF(MINUTE, punch_in, ${INDIA_NOW_SQL}), 0) < 480
         THEN 'HALF_DAY'

         ELSE 'PRESENT'
       END
     WHERE id = ?`,
    [attendance.id]
  );

  const [[record]] = await pool.query(
    `SELECT
       id,
       attendance_date,
       punch_in,
       punch_out,
       total_work_minutes,
       status
     FROM attendance
     WHERE id = ?`,
    [attendance.id]
  );

  res.json({
    success: true,
    message: 'Punch-out recorded.',
    data: record
  });
});

export const myAttendance = asyncHandler(
  async (req, res) => {
    ensureEmployeeAccount(req);

    const [rows] = await pool.query(
      `SELECT
         attendance_date,
         punch_in,
         punch_out,
         CASE
           WHEN punch_in IS NOT NULL
             AND punch_out IS NULL
             AND attendance_date = ${INDIA_DATE_SQL}
           THEN GREATEST(TIMESTAMPDIFF(MINUTE, punch_in, ${INDIA_NOW_SQL}), 0)
           ELSE GREATEST(COALESCE(total_work_minutes, 0), 0)
         END AS total_work_minutes,
         status,
         remarks
       FROM attendance
       WHERE employee_id = ?
       ORDER BY attendance_date DESC
       LIMIT 60`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: rows
    });
  }
);

export const listEmployeeAttendance = asyncHandler(
  async (req, res) => {
    const {
      date,
      employeeId,
      status,
      search
    } = req.query;

    const conditions = [
      "COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'"
    ];
    const values = [];

    if (date) {
      conditions.push('a.attendance_date = ?');
      values.push(date);
    }

    if (employeeId) {
      const parsedEmployeeId = Number(employeeId);

      if (
        !Number.isInteger(parsedEmployeeId) ||
        parsedEmployeeId <= 0
      ) {
        throw new AppError('Invalid employee filter.', 400);
      }

      conditions.push('a.employee_id = ?');
      values.push(parsedEmployeeId);
    }

    if (status) {
      if (!allowedStatuses.includes(status)) {
        throw new AppError('Invalid attendance status.', 400);
      }

      conditions.push('a.status = ?');
      values.push(status);
    }

    const keyword = String(search || '').trim();

    if (keyword) {
      conditions.push(
        `LOWER(CONCAT_WS(
           ' ',
           e.full_name,
           e.employee_id,
           e.username,
           e.designation,
           d.name,
           a.status
         )) LIKE ?`
      );
      values.push(`%${keyword.toLowerCase()}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.employee_id,
         e.employee_id AS employee_code,
         e.full_name AS employee_name,
         e.designation,
         d.name AS department,
         a.attendance_date,
         a.punch_in,
         a.punch_out,
         CASE
           WHEN a.punch_in IS NOT NULL
             AND a.punch_out IS NULL
             AND a.attendance_date = ${INDIA_DATE_SQL}
           THEN GREATEST(TIMESTAMPDIFF(MINUTE, a.punch_in, ${INDIA_NOW_SQL}), 0)
           ELSE COALESCE(
             a.total_work_minutes,
             0
           )
         END AS total_work_minutes,
         a.status,
         a.remarks
       FROM attendance a
       JOIN employees e
         ON e.id = a.employee_id
       LEFT JOIN departments d
         ON d.id = e.department_id
       ${whereClause}
       ORDER BY
         a.attendance_date DESC,
         a.punch_in DESC
       LIMIT 1000`,
      values
    );

    res.json({
      success: true,
      data: rows,
      meta: {
        count: rows.length,
        filters: {
          date: date || null,
          employeeId: employeeId || null,
          status: status || null,
          search: keyword || null
        }
      }
    });
  }
);


function attendanceDateValue(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError('Select a valid attendance date.', 400);
  }
  return date;
}

export const attendanceDayOverview = asyncHandler(async (req, res) => {
  const selectedDate = attendanceDateValue(
    req.query.date || indiaDateNow()
  );

  const [[context]] = await pool.query(
    `SELECT
       DATE_FORMAT(${INDIA_DATE_SQL}, '%Y-%m-%d') AS today,
       UPPER(DAYNAME(?)) AS weekday`,
    [selectedDate]
  );

  const [rows] = await pool.query(
    `SELECT
       e.id AS employee_id,
       e.employee_id AS employee_code,
       e.full_name AS employee_name,
       e.designation,
       e.weekly_off_day,
       d.name AS department,
       a.id AS attendance_id,
       a.punch_in,
       a.punch_out,
       CASE
         WHEN a.punch_in IS NOT NULL
           AND a.punch_out IS NULL
           AND ? = ${INDIA_DATE_SQL}
         THEN GREATEST(TIMESTAMPDIFF(MINUTE, a.punch_in, ${INDIA_NOW_SQL}), 0)
         ELSE GREATEST(COALESCE(a.total_work_minutes, 0), 0)
       END AS total_work_minutes,
       a.status AS stored_status,
       a.remarks,
       lr.id AS leave_id,
       lr.leave_type,
       h.id AS holiday_id,
       h.holiday_name
     FROM employees e
     LEFT JOIN departments d
       ON d.id = e.department_id
     LEFT JOIN attendance a
       ON a.employee_id = e.id
      AND a.attendance_date = ?
     LEFT JOIN leave_requests lr
       ON lr.id = (
         SELECT lr2.id
         FROM leave_requests lr2
         WHERE lr2.employee_id = e.id
           AND lr2.status = 'APPROVED'
           AND ? BETWEEN lr2.start_date AND lr2.end_date
         ORDER BY lr2.id DESC
         LIMIT 1
       )
     LEFT JOIN holidays h
       ON h.id = (
         SELECT h2.id
         FROM holidays h2
         WHERE h2.holiday_date = ?
           AND (h2.department_id IS NULL OR h2.department_id = e.department_id)
         ORDER BY (h2.department_id IS NOT NULL) DESC, h2.id DESC
         LIMIT 1
       )
     WHERE COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'
       AND e.status = 'ACTIVE'
     ORDER BY e.full_name ASC`,
    [selectedDate, selectedDate, selectedDate, selectedDate]
  );

  const today = context.today;
  const weekday = context.weekday;
  const isFutureDate = selectedDate > today;
  const isToday = selectedDate === today;

  const summary = {
    totalEmployees: rows.length,
    present: 0,
    absent: 0,
    leave: 0,
    holiday: 0,
    workedOnHoliday: 0,
    notMarked: 0,
    future: 0,
    halfDay: 0,
    missingPunch: 0,
    totalWorkMinutes: 0
  };

  const employees = rows.map((row) => {
    const hasPunch = Boolean(row.punch_in);
    const isWeeklyOff =
      weekday === 'SATURDAY' ||
      weekday === String(row.weekly_off_day || 'SUNDAY').toUpperCase();
    const isHoliday = Boolean(row.holiday_id) || isWeeklyOff;
    let displayStatus;

    if (hasPunch) {
      if (row.stored_status === 'HALF_DAY') {
        displayStatus = 'HALF_DAY';
      } else if (row.stored_status === 'MISSING_PUNCH') {
        displayStatus = 'MISSING_PUNCH';
      } else if (isHoliday) {
        displayStatus = 'WORKED_ON_HOLIDAY';
      } else {
        displayStatus = 'PRESENT';
      }
    } else if (isFutureDate) {
      displayStatus = 'FUTURE';
    } else if (row.stored_status) {
      displayStatus = row.stored_status === 'WEEK_OFF'
        ? 'HOLIDAY'
        : row.stored_status;
    } else if (isHoliday) {
      displayStatus = 'HOLIDAY';
    } else if (row.leave_id) {
      displayStatus = 'LEAVE';
    } else if (isToday) {
      displayStatus = 'NOT_MARKED';
    } else {
      displayStatus = 'ABSENT';
    }

    const minutes = hasPunch
      ? Number(row.total_work_minutes || 0)
      : 0;

    if (displayStatus === 'PRESENT') summary.present += 1;
    if (displayStatus === 'ABSENT') summary.absent += 1;
    if (displayStatus === 'LEAVE') summary.leave += 1;
    if (displayStatus === 'HOLIDAY') summary.holiday += 1;
    if (displayStatus === 'WORKED_ON_HOLIDAY') {
      summary.present += 1;
      summary.workedOnHoliday += 1;
    }
    if (displayStatus === 'NOT_MARKED') summary.notMarked += 1;
    if (displayStatus === 'FUTURE') summary.future += 1;
    if (displayStatus === 'HALF_DAY') {
      summary.present += 1;
      summary.halfDay += 1;
    }
    if (displayStatus === 'MISSING_PUNCH') {
      summary.present += 1;
      summary.missingPunch += 1;
    }

    summary.totalWorkMinutes += minutes;

    return {
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      department: row.department,
      designation: row.designation,
      attendanceId: row.attendance_id,
      date: selectedDate,
      punchIn: row.punch_in,
      punchOut: row.punch_out,
      totalWorkMinutes: minutes,
      status: displayStatus,
      storedStatus: row.stored_status,
      remarks: row.remarks,
      leaveType: row.leave_type,
      isHoliday,
      holidayName:
        row.holiday_name ||
        (isWeeklyOff
          ? weekday === 'SATURDAY'
            ? 'Saturday Holiday'
            : 'Weekly Holiday'
          : null)
    };
  });

  res.json({
    success: true,
    data: {
      selectedDate,
      today,
      weekday,
      isFutureDate,
      employees,
      summary
    }
  });
});

function monthRange(monthValue) {
  const month = String(monthValue || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError('Month must be in YYYY-MM format.', 400);
  }
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new AppError('Invalid calendar month.', 400);
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const end = `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { month, year, monthNumber, start, end, lastDay };
}

const dayNames = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

export const attendanceCalendar = asyncHandler(async (req, res) => {
  const range = monthRange(req.query.month || indiaDateNow().slice(0, 7));
  const isAdmin = ['SUPER_ADMIN','ADMIN','HR','MANAGER'].includes(req.user.role);
  let employeeId = req.user.id;
  if (req.query.employeeId) {
    if (!isAdmin && Number(req.query.employeeId) !== Number(req.user.id)) {
      throw new AppError('You can view only your attendance calendar.', 403);
    }
    employeeId = Number(req.query.employeeId);
  }
  if (!Number.isInteger(Number(employeeId)) || Number(employeeId) <= 0) {
    throw new AppError('Select a valid employee.', 400);
  }

  const [[employee]] = await pool.query(
    `SELECT e.id, e.employee_id, e.full_name, e.designation, e.department_id,
       e.weekly_off_day, d.name AS department
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = ? AND COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'`,
    [employeeId]
  );
  if (!employee) throw new AppError('Employee not found.', 404);

  // Persist approved leave into attendance so employee calendar matches admin.
  await backfillApprovedLeaveAttendance(pool, employeeId, range.start, range.end);

  const [records] = await pool.query(
    `SELECT id,
       DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
       punch_in,
       punch_out,
       CASE
         WHEN punch_in IS NOT NULL AND punch_out IS NULL AND attendance_date = ${INDIA_DATE_SQL}
         THEN GREATEST(TIMESTAMPDIFF(MINUTE, punch_in, ${INDIA_NOW_SQL}), 0)
         ELSE GREATEST(COALESCE(total_work_minutes, 0), 0)
       END AS total_work_minutes,
       status, remarks
     FROM attendance
     WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?`,
    [employeeId, range.start, range.end]
  );

  const [holidays] = await pool.query(
    `SELECT id, holiday_name,
       DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
       holiday_type, description
     FROM holidays
     WHERE holiday_date BETWEEN ? AND ?
       AND (department_id IS NULL OR department_id = ?)`,
    [range.start, range.end, employee.department_id]
  );

  const [approvedLeaves] = await pool.query(
    `SELECT id, leave_type, duration_type,
       DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
       DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
     FROM leave_requests
     WHERE employee_id = ?
       AND status = 'APPROVED'
       AND start_date <= ?
       AND end_date >= ?`,
    [employeeId, range.end, range.start]
  );

  const [[todayRow]] = await pool.query(`SELECT DATE_FORMAT(${INDIA_DATE_SQL}, "%Y-%m-%d") AS today`);
  const today = todayRow.today;
  const recordMap = new Map(
    records.map((record) => [record.attendance_date, record])
  );
  const holidayMap = new Map(
    holidays.map((holiday) => [holiday.holiday_date, holiday])
  );
  const leaveDateMap = new Map();
  for (const leave of approvedLeaves) {
    const cursor = new Date(`${leave.start_date}T00:00:00Z`);
    const last = new Date(`${leave.end_date}T00:00:00Z`);
    while (cursor <= last) {
      const leaveDate = cursor.toISOString().slice(0, 10);
      if (leaveDate >= range.start && leaveDate <= range.end) {
        leaveDateMap.set(leaveDate, leave);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const calendar = [];
  const summary = {
    PRESENT: 0,
    ABSENT: 0,
    HOLIDAY: 0,
    LEAVE: 0,
    HALF_DAY: 0,
    WEEK_OFF: 0,
    MISSING_PUNCH: 0,
    NOT_MARKED: 0,
    totalWorkMinutes: 0
  };

  for (let day = 1; day <= range.lastDay; day += 1) {
    const date = `${range.year}-${String(range.monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = dayNames[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const record = recordMap.get(date);
    const holiday = holidayMap.get(date);
    const approvedLeave = leaveDateMap.get(date);

    // Saturday is always a company weekly holiday. The employee's configured
    // weekly off is also respected, so existing Sunday/off-day settings remain valid.
    const isWeeklyOff =
      weekday === 'SATURDAY' ||
      weekday === employee.weekly_off_day;
    const isHoliday = Boolean(holiday) || isWeeklyOff;
    const workedOnHoliday =
      Boolean(record?.punch_in) &&
      isHoliday;

    let status = record?.status || null;
    let remarks = record?.remarks || null;

    // A real punch record always takes priority over a stale manually stored
    // absent/holiday value. This keeps the calendar, summary and work-time cards aligned.
    if (
      record?.punch_in &&
      !['HALF_DAY', 'MISSING_PUNCH'].includes(status)
    ) {
      status = 'PRESENT';
    }

    if (!status && approvedLeave) {
      status = ['FIRST_HALF', 'SECOND_HALF'].includes(approvedLeave.duration_type)
        ? 'HALF_DAY'
        : 'LEAVE';
      remarks = `Approved leave (${String(approvedLeave.leave_type || '')
        .replaceAll('_', ' ')
        .toLowerCase()})`;
    } else if (!status && holiday) {
      status = 'HOLIDAY';
      remarks = holiday.holiday_name;
    } else if (!status && isWeeklyOff) {
      status = 'HOLIDAY';
      remarks =
        weekday === 'SATURDAY'
          ? 'Saturday Holiday'
          : 'Weekly Holiday';
    } else if (!status && date <= today) {
      status = 'NOT_MARKED';
      remarks = 'No punch recorded';
    } else if (!status) {
      status = 'FUTURE';
    }

    if (workedOnHoliday) {
      remarks =
        record?.remarks ||
        `Worked on ${
          holiday?.holiday_name ||
          (weekday === 'SATURDAY'
            ? 'Saturday holiday'
            : 'weekly holiday')
        }`;
    }

    if (summary[status] !== undefined) {
      summary[status] += 1;
    }

    if (record?.punch_in) {
      summary.totalWorkMinutes += Number(
        record.total_work_minutes || 0
      );
    }

    calendar.push({
      date,
      weekday,
      status,
      attendanceId: record?.id || null,
      punchIn: record?.punch_in || null,
      punchOut: record?.punch_out || null,
      totalWorkMinutes: Number(record?.total_work_minutes || 0),
      remarks,
      holiday: holiday || null,
      isWeeklyOff,
      workedOnHoliday,
      holidayLabel:
        holiday?.holiday_name ||
        (isWeeklyOff
          ? weekday === 'SATURDAY'
            ? 'Saturday Holiday'
            : 'Weekly Holiday'
          : null)
    });
  }

  res.json({ success: true, data: { employee, month: range.month, today, calendar, summary } });
});

export const adminAdjustAttendance = asyncHandler(async (req, res) => {
  const employeeId = Number(req.body.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) throw new AppError('Select a valid employee.', 400);
  const date = String(req.body.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('Select a valid attendance date.', 400);
  const status = String(req.body.status || '').toUpperCase();
  if (!allowedStatuses.includes(status)) throw new AppError('Select a valid attendance status.', 400);
  const punchInSql = req.body.punchIn ? normalizeWallClockDateTime(req.body.punchIn, 'Punch-in time') : null;
  const punchOutSql = req.body.punchOut ? normalizeWallClockDateTime(req.body.punchOut, 'Punch-out time') : null;
  if (punchInSql && punchInSql.slice(0, 10) !== date) throw new AppError('Punch-in must belong to the selected attendance date.', 400);
  if (punchOutSql && punchOutSql.slice(0, 10) !== date) throw new AppError('Punch-out must belong to the selected attendance date.', 400);
  const diffMinutes = punchInSql && punchOutSql ? wallClockMinutes(punchInSql, punchOutSql) : 0;
  if (punchInSql && punchOutSql && (!Number.isFinite(diffMinutes) || diffMinutes <= 0)) throw new AppError('Punch-out must be after punch-in.', 400);
  const minutes = punchInSql && punchOutSql ? Math.max(diffMinutes, 0) : 0;
  const remarks = String(req.body.remarks || '').trim() || `Adjusted by ${req.user.fullName || 'Admin'}`;

  const [[employee]] = await pool.query(
    `SELECT id FROM employees WHERE id = ? AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'`,
    [employeeId]
  );
  if (!employee) throw new AppError('Employee not found.', 404);

  await pool.query(
    `INSERT INTO attendance (
       employee_id, attendance_date, punch_in, punch_out, total_work_minutes, status, remarks
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE punch_in = VALUES(punch_in), punch_out = VALUES(punch_out),
       total_work_minutes = VALUES(total_work_minutes), status = VALUES(status),
       remarks = VALUES(remarks), updated_at = CURRENT_TIMESTAMP`,
    [employeeId, date, punchInSql, punchOutSql, minutes, status, remarks]
  );
  res.json({ success: true, message: 'Attendance updated successfully.' });
});
