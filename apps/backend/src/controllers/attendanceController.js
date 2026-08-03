import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE'
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
