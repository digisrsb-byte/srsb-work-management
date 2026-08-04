import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedEmployeeStatuses = ['ACTIVE', 'INACTIVE', 'RESIGNED'];
const allowedEmployeeRoles = ['ADMIN', 'HR', 'MANAGER', 'RECRUITER', 'EMPLOYEE'];

async function validateDepartment(departmentId) {
  const id = Number(departmentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Select a valid department.', 400);
  }

  const [[department]] = await pool.query(
    `SELECT id, name
     FROM departments
     WHERE id = ?
       AND name IN ('Technical', 'HR')
     LIMIT 1`,
    [id]
  );

  if (!department) {
    throw new AppError('Department must be Technical or HR.', 400);
  }

  return department;
}

async function validateManager(managerId, employeeId = null) {
  if (!managerId) return null;

  const id = Number(managerId);
  if (!Number.isInteger(id) || id <= 0 || Number(employeeId) === id) {
    throw new AppError('Select a valid reporting manager.', 400);
  }

  const [[manager]] = await pool.query(
    `SELECT id
     FROM employees
     WHERE id = ?
       AND status = 'ACTIVE'
       AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'
     LIMIT 1`,
    [id]
  );

  if (!manager) throw new AppError('Reporting manager was not found.', 400);
  return id;
}

export const getEmployeeFormMeta = asyncHandler(async (_req, res) => {
  const [departments] = await pool.query(
    `SELECT id, name
     FROM departments
     WHERE name IN ('Technical', 'HR')
     ORDER BY FIELD(name, 'Technical', 'HR')`
  );

  const [managers] = await pool.query(
    `SELECT id, employee_id, full_name, designation, role
     FROM employees
     WHERE status = 'ACTIVE'
       AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'
       AND role IN ('SUPER_ADMIN','ADMIN','HR','MANAGER')
     ORDER BY full_name`
  );

  res.json({ success: true, data: { departments, managers } });
});

export const listEmployees = asyncHandler(async (req, res) => {
  const { search, status, role } = req.query;
  const conditions = ["COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'"];
  const values = [];

  if (req.user.role === 'ADMIN') conditions.push("e.role <> 'SUPER_ADMIN'");
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    conditions.push("e.role NOT IN ('SUPER_ADMIN','ADMIN')");
  }

  if (status) {
    if (!allowedEmployeeStatuses.includes(status)) throw new AppError('Invalid employee status.', 400);
    conditions.push('e.status = ?');
    values.push(status);
  }

  if (role) {
    if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
    conditions.push('e.role = ?');
    values.push(role);
  }

  const keyword = String(search || '').trim().toLowerCase();
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', e.employee_id, e.username, e.full_name, e.email,
      e.phone, e.role, e.designation, d.name, manager.full_name, e.status)) LIKE ?`);
    values.push(`%${keyword}%`);
  }

  const [rows] = await pool.query(
    `SELECT e.id, e.employee_id, e.username, e.full_name, e.email, e.recovery_email,
       e.phone, e.date_of_birth, e.role, e.account_type, e.designation, e.status,
       e.joining_date, e.department_id, e.manager_id, e.password_changed_at,
       e.must_change_password, d.name AS department, manager.full_name AS manager_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees manager ON manager.id = e.manager_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.created_at DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows,
    meta: { count: rows.length, search: keyword || null, status: status || null, role: role || null }
  });
});

export const createEmployee = asyncHandler(async (req, res) => {
  const employeeId = req.body.employeeId?.trim() || null;
  const username = req.body.username?.trim() || null;
  const fullName = req.body.fullName?.trim();
  const email = req.body.email?.trim() || null;
  const recoveryEmail = req.body.recoveryEmail?.trim() || null;
  const phone = req.body.phone?.trim() || null;
  const dateOfBirth = req.body.dateOfBirth || null;
  const password = String(req.body.password || '');
  const role = req.body.role || 'EMPLOYEE';
  const designation = req.body.designation?.trim();
  const joiningDate = req.body.joiningDate || null;

  if (!employeeId && !username) throw new AppError('Employee ID or username is required.', 400);
  if (!fullName) throw new AppError('Full name is required.', 400);
  if (!designation) throw new AppError('Designation is required.', 400);
  if (password.length < 8) throw new AppError('Password must contain at least 8 characters.', 400);
  if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
  if (req.user.role !== 'SUPER_ADMIN' && role === 'ADMIN') {
    throw new AppError('Only Head Admin can create an Admin account.', 403);
  }

  const department = await validateDepartment(req.body.departmentId);
  const managerId = await validateManager(req.body.managerId);

  const [existing] = await pool.query(
    `SELECT id FROM employees
     WHERE (? IS NOT NULL AND employee_id = ?)
        OR (? IS NOT NULL AND username = ?)
        OR (? IS NOT NULL AND email = ?)`,
    [employeeId, employeeId, username, username, email, email]
  );
  if (existing.length) throw new AppError('Employee ID, username or email already exists.', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.query(
    `INSERT INTO employees (
       employee_id, username, full_name, email, recovery_email, phone, date_of_birth,
       password_hash, role, designation, department_id, manager_id, joining_date,
       status, account_type
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'EMPLOYEE')`,
    [employeeId, username, fullName, email, recoveryEmail, phone, dateOfBirth,
      passwordHash, role, designation, department.id, managerId, joiningDate]
  );

  res.status(201).json({ success: true, message: 'Employee created successfully.', data: { id: result.insertId } });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid employee ID.', 400);

  const [[target]] = await pool.query(
    `SELECT id, role FROM employees WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!target) throw new AppError('Employee not found.', 404);

  const role = req.body.role || target.role;
  if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
  if (req.user.role !== 'SUPER_ADMIN' && (target.role === 'ADMIN' || role === 'ADMIN')) {
    throw new AppError('Only Head Admin can manage Admin accounts.', 403);
  }

  const designation = req.body.designation?.trim();
  if (!designation) throw new AppError('Designation is required.', 400);
  const department = await validateDepartment(req.body.departmentId);
  const managerId = await validateManager(req.body.managerId, id);
  const status = req.body.status || 'ACTIVE';
  if (!allowedEmployeeStatuses.includes(status)) throw new AppError('Invalid employee status.', 400);

  const [result] = await pool.query(
    `UPDATE employees SET
       full_name = ?, email = ?, recovery_email = ?, username = ?, phone = ?,
       date_of_birth = ?, role = ?, designation = ?, department_id = ?, manager_id = ?,
       joining_date = ?, status = ?
     WHERE id = ?`,
    [req.body.fullName?.trim(), req.body.email?.trim() || null,
      req.body.recoveryEmail?.trim() || null, req.body.username?.trim() || null,
      req.body.phone?.trim() || null, req.body.dateOfBirth || null, role, designation,
      department.id, managerId, req.body.joiningDate || null, status, id]
  );

  if (!result.affectedRows) throw new AppError('Employee not found.', 404);
  res.json({ success: true, message: 'Employee updated successfully.' });
});

export const deleteEmployee = asyncHandler(
  async (req, res) => {
    const employeeId = Number(req.params.id);
    const loggedInUserId = Number(req.user.id);

    if (
      !Number.isInteger(employeeId) ||
      employeeId <= 0
    ) {
      throw new AppError(
        'Invalid employee ID.',
        400
      );
    }

    if (employeeId === loggedInUserId) {
      throw new AppError(
        'You cannot delete your own account.',
        400
      );
    }

    const [employees] = await pool.query(
      `SELECT
         id,
         full_name,
         role
       FROM employees
       WHERE id = ?
       LIMIT 1`,
      [employeeId]
    );

    const employee = employees[0];

    if (!employee) {
      throw new AppError(
        'Employee not found.',
        404
      );
    }

    if (
      ['SUPER_ADMIN', 'ADMIN'].includes(employee.role) &&
      req.user.role !== 'SUPER_ADMIN'
    ) {
      throw new AppError(
        'Only Super Admin can delete Admin or Super Admin accounts.',
        403
      );
    }

    await pool.query(
      `DELETE FROM employees
       WHERE id = ?`,
      [employeeId]
    );

    res.json({
      success: true,
      message: `${employee.full_name}'s account and related employee data were deleted successfully.`
    });
  }
);
export const listPasswordResetRequests = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       pr.id,
       pr.status,
       pr.requested_at,
       pr.resolved_at,
       e.id AS employee_db_id,
       e.employee_id,
       e.username,
       e.full_name,
       e.email,
       e.recovery_email,
       e.role,
       resolver.full_name AS resolved_by_name
     FROM password_reset_requests pr
     JOIN employees e ON e.id = pr.employee_id
     LEFT JOIN employees resolver ON resolver.id = pr.resolved_by
     ORDER BY
       CASE WHEN pr.status = 'PENDING' THEN 0 ELSE 1 END,
       pr.requested_at DESC`
  );

  res.json({ success: true, data: rows });
});

export const adminResetEmployeePassword = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);
  const newPassword = String(req.body.newPassword || '');

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new AppError('Invalid employee ID.', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('Password must contain at least 8 characters.', 400);
  }

  const [employees] = await pool.query(
    `SELECT id, full_name, role FROM employees WHERE id = ? LIMIT 1`,
    [employeeId]
  );

  const employee = employees[0];
  if (!employee) throw new AppError('Employee not found.', 404);

  if (['SUPER_ADMIN', 'ADMIN'].includes(employee.role) && req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can reset Admin or Super Admin passwords.', 403);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE employees
       SET password_hash = ?, password_changed_at = NOW(), must_change_password = FALSE
       WHERE id = ?`,
      [passwordHash, employeeId]
    );
    await connection.query(
      `UPDATE password_reset_requests
       SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = ?
       WHERE employee_id = ?`,
      [req.user.id, employeeId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json({
    success: true,
    message: `${employee.full_name}'s password was reset successfully.`
  });
});

export const rejectPasswordResetRequest = asyncHandler(async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new AppError('Invalid request ID.', 400);
  }

  const [result] = await pool.query(
    `UPDATE password_reset_requests
     SET status = 'REJECTED', resolved_at = NOW(), resolved_by = ?
     WHERE id = ?`,
    [req.user.id, requestId]
  );

  if (!result.affectedRows) throw new AppError('Request not found.', 404);
  res.json({ success: true, message: 'Password reset request rejected.' });
});
