import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'WEEK_OFF',
  'HOLIDAY',
  'MISSING_PUNCH'
];

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
       AND attendance_date = CURDATE()
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
         punch_in = NOW(),
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
       VALUES (?, CURDATE(), NOW(), 0, 'PRESENT')`,
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
       AND attendance_date = CURDATE()
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
       AND attendance_date = CURDATE()
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
       punch_out = NOW(),
       total_work_minutes =
         TIMESTAMPDIFF(MINUTE, punch_in, NOW()),
       status = CASE
         WHEN TIMESTAMPDIFF(
           MINUTE,
           punch_in,
           NOW()
         ) < 180
         THEN 'ABSENT'

         WHEN TIMESTAMPDIFF(
           MINUTE,
           punch_in,
           NOW()
         ) < 480
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
             AND attendance_date = CURDATE()
           THEN TIMESTAMPDIFF(
             MINUTE,
             punch_in,
             NOW()
           )
           ELSE COALESCE(total_work_minutes, 0)
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
             AND a.attendance_date = CURDATE()
           THEN TIMESTAMPDIFF(
             MINUTE,
             a.punch_in,
             NOW()
           )
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
  const range = monthRange(req.query.month || new Date().toISOString().slice(0, 7));
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

  const [records] = await pool.query(
    `SELECT id, attendance_date, punch_in, punch_out,
       CASE
         WHEN punch_in IS NOT NULL AND punch_out IS NULL AND attendance_date = CURDATE()
         THEN TIMESTAMPDIFF(MINUTE, punch_in, NOW())
         ELSE COALESCE(total_work_minutes, 0)
       END AS total_work_minutes,
       status, remarks
     FROM attendance
     WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?`,
    [employeeId, range.start, range.end]
  );

  const [holidays] = await pool.query(
    `SELECT id, holiday_name, holiday_date, holiday_type, description
     FROM holidays
     WHERE holiday_date BETWEEN ? AND ?
       AND (department_id IS NULL OR department_id = ?)`,
    [range.start, range.end, employee.department_id]
  );
  const [[todayRow]] = await pool.query('SELECT DATE_FORMAT(CURDATE(), "%Y-%m-%d") AS today');
  const today = todayRow.today;
  const recordMap = new Map(records.map((record) => [String(record.attendance_date).slice(0, 10), record]));
  const holidayMap = new Map(holidays.map((holiday) => [String(holiday.holiday_date).slice(0, 10), holiday]));

  const calendar = [];
  const summary = { PRESENT: 0, ABSENT: 0, HOLIDAY: 0, LEAVE: 0, HALF_DAY: 0, WEEK_OFF: 0, MISSING_PUNCH: 0 };
  for (let day = 1; day <= range.lastDay; day += 1) {
    const date = `${range.year}-${String(range.monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = dayNames[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const record = recordMap.get(date);
    const holiday = holidayMap.get(date);
    let status = record?.status || null;
    let remarks = record?.remarks || null;
    if (!status && holiday) {
      status = 'HOLIDAY';
      remarks = holiday.holiday_name;
    } else if (!status && weekday === employee.weekly_off_day) {
      status = 'WEEK_OFF';
      remarks = 'Weekly off';
    } else if (!status && date < today) {
      status = 'ABSENT';
      remarks = 'Attendance not recorded';
    } else if (!status && date === today) {
      status = 'NOT_MARKED';
      remarks = 'Attendance not marked yet';
    } else if (!status) {
      status = 'FUTURE';
    }
    if (summary[status] !== undefined) summary[status] += 1;
    calendar.push({
      date,
      weekday,
      status,
      attendanceId: record?.id || null,
      punchIn: record?.punch_in || null,
      punchOut: record?.punch_out || null,
      totalWorkMinutes: Number(record?.total_work_minutes || 0),
      remarks,
      holiday: holiday || null
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
  const punchIn = req.body.punchIn ? new Date(req.body.punchIn) : null;
  const punchOut = req.body.punchOut ? new Date(req.body.punchOut) : null;
  if (punchIn && Number.isNaN(punchIn.getTime())) throw new AppError('Punch-in time is invalid.', 400);
  if (punchOut && Number.isNaN(punchOut.getTime())) throw new AppError('Punch-out time is invalid.', 400);
  if (punchIn && punchOut && punchOut <= punchIn) throw new AppError('Punch-out must be after punch-in.', 400);
  const punchInSql = punchIn ? punchIn.toISOString().slice(0, 19).replace('T', ' ') : null;
  const punchOutSql = punchOut ? punchOut.toISOString().slice(0, 19).replace('T', ' ') : null;
  const minutes = punchIn && punchOut ? Math.max(Math.round((punchOut - punchIn) / 60000), 0) : 0;
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
