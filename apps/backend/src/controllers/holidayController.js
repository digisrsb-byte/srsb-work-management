import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const holidayTypes = ['NATIONAL','COMPANY','OPTIONAL','REGIONAL','WEEKEND'];

function idFrom(value, label = 'holiday ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

async function syncHolidayAttendance(connection, holidayDate, departmentId) {
  const condition = departmentId ? 'AND e.department_id = ?' : '';
  const values = departmentId ? [holidayDate, departmentId] : [holidayDate];

  await connection.query(
    `INSERT INTO attendance (employee_id, attendance_date, status, remarks)
     SELECT e.id, ?, 'HOLIDAY', 'Company holiday'
     FROM employees e
     WHERE e.status = 'ACTIVE'
       AND COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'
       ${condition}
     ON DUPLICATE KEY UPDATE
       status = IF(punch_in IS NULL AND punch_out IS NULL AND status NOT IN ('LEAVE'), 'HOLIDAY', status),
       remarks = IF(punch_in IS NULL AND punch_out IS NULL AND status NOT IN ('LEAVE'), 'Company holiday', remarks)`,
    values
  );
}

export const listHolidays = asyncHandler(async (req, res) => {
  const conditions = [];
  const values = [];
  if (req.query.from) {
    conditions.push('h.holiday_date >= ?');
    values.push(req.query.from);
  }
  if (req.query.to) {
    conditions.push('h.holiday_date <= ?');
    values.push(req.query.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT h.id, h.holiday_name, h.holiday_date, h.holiday_type, h.description,
       h.department_id, h.created_at, d.name AS department_name,
       e.full_name AS created_by_name
     FROM holidays h
     LEFT JOIN departments d ON d.id = h.department_id
     LEFT JOIN employees e ON e.id = h.created_by
     ${where}
     ORDER BY h.holiday_date DESC, h.id DESC`,
    values
  );
  res.json({ success: true, data: rows });
});

function validatePayload(body) {
  const holidayName = String(body.holidayName || '').trim();
  const holidayDate = String(body.holidayDate || '').trim();
  const holidayType = body.holidayType || 'COMPANY';
  if (!holidayName) throw new AppError('Holiday name is required.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) throw new AppError('Select a valid holiday date.', 400);
  if (!holidayTypes.includes(holidayType)) throw new AppError('Invalid holiday type.', 400);
  const departmentId = body.departmentId ? idFrom(body.departmentId, 'department') : null;
  return { holidayName, holidayDate, holidayType, departmentId };
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
      `INSERT INTO holidays (holiday_name, holiday_date, holiday_type, description, department_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.holidayName, data.holidayDate, data.holidayType,
        String(req.body.description || '').trim() || null, data.departmentId, req.user.id]
    );
    await syncHolidayAttendance(connection, data.holidayDate, data.departmentId);
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
    const [[oldHoliday]] = await connection.query('SELECT holiday_date, department_id FROM holidays WHERE id = ? FOR UPDATE', [id]);
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
      `UPDATE attendance a
       JOIN employees e ON e.id = a.employee_id
       SET a.status = 'ABSENT', a.remarks = 'Holiday removed or changed'
       WHERE a.attendance_date = ? AND a.status = 'HOLIDAY'
         AND (? IS NULL OR e.department_id = ?)`,
      [oldHoliday.holiday_date, oldHoliday.department_id, oldHoliday.department_id]
    );

    await connection.query(
      `UPDATE holidays SET holiday_name = ?, holiday_date = ?, holiday_type = ?,
       description = ?, department_id = ? WHERE id = ?`,
      [data.holidayName, data.holidayDate, data.holidayType,
        String(req.body.description || '').trim() || null, data.departmentId, id]
    );
    await syncHolidayAttendance(connection, data.holidayDate, data.departmentId);
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
    const [[holiday]] = await connection.query('SELECT holiday_date, department_id FROM holidays WHERE id = ? FOR UPDATE', [id]);
    if (!holiday) throw new AppError('Holiday not found.', 404);
    await connection.query(
      `UPDATE attendance a
       JOIN employees e ON e.id = a.employee_id
       SET a.status = 'ABSENT', a.remarks = 'Holiday removed'
       WHERE a.attendance_date = ? AND a.status = 'HOLIDAY'
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
