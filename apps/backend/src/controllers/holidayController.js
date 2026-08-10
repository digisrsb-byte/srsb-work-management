import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const holidayTypes = ['NATIONAL','COMPANY','OPTIONAL','REGIONAL','WEEKEND'];

function idFrom(value, label = 'holiday ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function validDate(value, label) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(`Select a valid ${label}.`, 400);
  return text;
}

async function syncHolidayAttendance(connection, holidayDate, departmentId, holidayName) {
  const condition = departmentId ? 'AND e.department_id = ?' : '';
  const values = departmentId
    ? [holidayDate, holidayName, departmentId]
    : [holidayDate, holidayName];

  await connection.query(
    `INSERT INTO attendance (employee_id, attendance_date, status, remarks)
     SELECT e.id, ?, 'HOLIDAY', ?
     FROM employees e
     WHERE e.status = 'ACTIVE'
       AND COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'
       ${condition}
     ON DUPLICATE KEY UPDATE
       status = IF(
         attendance.punch_in IS NULL
         AND attendance.punch_out IS NULL
         AND attendance.status NOT IN ('LEAVE'),
         'HOLIDAY',
         attendance.status
       ),
       remarks = IF(
         attendance.punch_in IS NULL
         AND attendance.punch_out IS NULL
         AND attendance.status NOT IN ('LEAVE'),
         VALUES(remarks),
         attendance.remarks
       )`,
    values
  );
}

export const listHolidays = asyncHandler(async (req, res) => {
  const conditions = [];
  const values = [];
  if (req.query.from) {
    conditions.push('h.holiday_date >= ?');
    values.push(validDate(req.query.from, 'start date'));
  }
  if (req.query.to) {
    conditions.push('h.holiday_date <= ?');
    values.push(validDate(req.query.to, 'end date'));
  }

  const isPrivileged = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(req.user.role);
  if (!isPrivileged) {
    const [[employee]] = await pool.query(
      'SELECT department_id FROM employees WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    conditions.push('(h.department_id IS NULL OR h.department_id = ?)');
    values.push(employee?.department_id || null);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT h.id, h.holiday_name, h.holiday_date, h.holiday_type, h.description,
       h.department_id, h.show_greeting, h.greeting_message,
       h.greeting_start_date, h.greeting_end_date, h.created_at,
       d.name AS department_name, e.full_name AS created_by_name
     FROM holidays h
     LEFT JOIN departments d ON d.id = h.department_id
     LEFT JOIN employees e ON e.id = h.created_by
     ${where}
     ORDER BY h.holiday_date ASC, h.id ASC`,
    values
  );
  res.json({ success: true, data: rows });
});

function validatePayload(body) {
  const holidayName = String(body.holidayName || '').trim();
  const holidayDate = validDate(body.holidayDate, 'holiday date');
  const holidayType = String(body.holidayType || 'COMPANY').toUpperCase();
  if (!holidayName) throw new AppError('Holiday name is required.', 400);
  if (!holidayTypes.includes(holidayType)) throw new AppError('Invalid holiday type.', 400);
  const departmentId = body.departmentId ? idFrom(body.departmentId, 'department') : null;
  const showGreeting = body.showGreeting === false || body.showGreeting === 'false' ? false : true;
  const greetingStartDate = body.greetingStartDate
    ? validDate(body.greetingStartDate, 'greeting start date')
    : holidayDate;
  const greetingEndDate = body.greetingEndDate
    ? validDate(body.greetingEndDate, 'greeting end date')
    : holidayDate;
  if (greetingEndDate < greetingStartDate) {
    throw new AppError('Greeting end date cannot be before the start date.', 400);
  }
  return {
    holidayName,
    holidayDate,
    holidayType,
    departmentId,
    showGreeting,
    greetingMessage: String(body.greetingMessage || '').trim() || `Wishing you a Happy ${holidayName}!`,
    greetingStartDate,
    greetingEndDate,
    description: String(body.description || '').trim() || null
  };
}

export const createHoliday = asyncHandler(async (req, res) => {
  const data = validatePayload(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[duplicate]] = await connection.query(
      `SELECT id FROM holidays
       WHERE holiday_date = ?
         AND ((department_id IS NULL AND ? IS NULL) OR department_id = ?)
       LIMIT 1`,
      [data.holidayDate, data.departmentId, data.departmentId]
    );
    if (duplicate) throw new AppError('A holiday already exists for this date and department.', 409);
    const [result] = await connection.query(
      `INSERT INTO holidays (
         holiday_name, holiday_date, holiday_type, description, department_id,
         show_greeting, greeting_message, greeting_start_date, greeting_end_date, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.holidayName, data.holidayDate, data.holidayType, data.description,
        data.departmentId, data.showGreeting, data.greetingMessage,
        data.greetingStartDate, data.greetingEndDate, req.user.id]
    );
    await syncHolidayAttendance(connection, data.holidayDate, data.departmentId, data.holidayName);
    await connection.commit();
    res.status(201).json({ success: true, message: 'Holiday added successfully.', data: { id: result.insertId } });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('A holiday already exists for this date and department.', 409);
    throw error;
  } finally {
    connection.release();
  }
});

export const updateHoliday = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const data = validatePayload(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[oldHoliday]] = await connection.query(
      'SELECT holiday_date, department_id FROM holidays WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!oldHoliday) throw new AppError('Holiday not found.', 404);
    const [[duplicate]] = await connection.query(
      `SELECT id FROM holidays
       WHERE id <> ? AND holiday_date = ?
         AND ((department_id IS NULL AND ? IS NULL) OR department_id = ?)
       LIMIT 1`,
      [id, data.holidayDate, data.departmentId, data.departmentId]
    );
    if (duplicate) throw new AppError('A holiday already exists for this date and department.', 409);

    await connection.query(
      `DELETE a FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       WHERE a.attendance_date = ? AND a.status = 'HOLIDAY'
         AND a.punch_in IS NULL AND a.punch_out IS NULL
         AND (? IS NULL OR e.department_id = ?)`,
      [oldHoliday.holiday_date, oldHoliday.department_id, oldHoliday.department_id]
    );

    await connection.query(
      `UPDATE holidays SET holiday_name = ?, holiday_date = ?, holiday_type = ?,
       description = ?, department_id = ?, show_greeting = ?, greeting_message = ?,
       greeting_start_date = ?, greeting_end_date = ? WHERE id = ?`,
      [data.holidayName, data.holidayDate, data.holidayType, data.description,
        data.departmentId, data.showGreeting, data.greetingMessage,
        data.greetingStartDate, data.greetingEndDate, id]
    );
    await syncHolidayAttendance(connection, data.holidayDate, data.departmentId, data.holidayName);
    await connection.commit();
    res.json({ success: true, message: 'Holiday updated successfully.' });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('A holiday already exists for this date and department.', 409);
    throw error;
  } finally {
    connection.release();
  }
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[holiday]] = await connection.query(
      'SELECT holiday_date, department_id FROM holidays WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!holiday) throw new AppError('Holiday not found.', 404);
    await connection.query(
      `DELETE a FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       WHERE a.attendance_date = ? AND a.status = 'HOLIDAY'
         AND a.punch_in IS NULL AND a.punch_out IS NULL
         AND (? IS NULL OR e.department_id = ?)`,
      [holiday.holiday_date, holiday.department_id, holiday.department_id]
    );
    await connection.query('DELETE FROM holidays WHERE id = ?', [id]);
    await connection.commit();
    res.json({ success: true, message: 'Holiday deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
