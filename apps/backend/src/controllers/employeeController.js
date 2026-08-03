import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const listEmployees = asyncHandler(async (req, res) => {
  const visibilityClause =
    req.user.role === 'SUPER_ADMIN'
      ? "WHERE e.account_type = 'EMPLOYEE'"
      : req.user.role === 'ADMIN'
        ? "WHERE e.account_type = 'EMPLOYEE' AND e.role <> 'SUPER_ADMIN'"
        : "WHERE e.account_type = 'EMPLOYEE' AND e.role NOT IN ('SUPER_ADMIN','ADMIN')";

  const [rows] = await pool.query(
    `SELECT
       e.id,
       e.employee_id,
       e.username,
       e.full_name,
       e.email,
       e.recovery_email,
       e.phone,
       e.date_of_birth,
       e.role,
       e.designation,
       e.status,
       e.joining_date,
       e.department_id,
       e.password_changed_at,
       e.must_change_password,
       d.name AS department
     FROM employees e
     LEFT JOIN departments d
       ON d.id = e.department_id
     ${visibilityClause}
     ORDER BY e.created_at DESC`
  );

  res.json({
    success: true,
    data: rows
  });
});

export const createEmployee = asyncHandler(async (req, res) => {
  const employeeId = req.body.employeeId?.trim() || null;
  const username = req.body.username?.trim() || null;
  const fullName = req.body.fullName.trim();
  const email = req.body.email?.trim() || null;
  const recoveryEmail = req.body.recoveryEmail?.trim() || null;
  const phone = req.body.phone?.trim() || null;
  const dateOfBirth = req.body.dateOfBirth || null;
  const password = req.body.password;
  const role = req.body.role || 'EMPLOYEE';

  if (req.user.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    throw new AppError('Only Super Admin can create Admin or Super Admin accounts.', 403);
  }
  if (!employeeId && !username) {
    throw new AppError('Employee ID or username is required.', 400);
  }
  const designation =
    req.body.designation?.trim() || null;
  const departmentId =
    req.body.departmentId || null;

  const [existing] = await pool.query(
    `SELECT id
     FROM employees
     WHERE (? IS NOT NULL AND employee_id = ?)
        OR (? IS NOT NULL AND username = ?)
        OR (? IS NOT NULL AND email = ?)`,
    [employeeId, employeeId, username, username, email, email]
  );

  if (existing.length) {
    throw new AppError(
      'Employee ID, username or email already exists.',
      409
    );
  }

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const [result] = await pool.query(
    `INSERT INTO employees (
       employee_id,
       username,
       full_name,
       email,
       recovery_email,
       phone,
       date_of_birth,
       password_hash,
       role,
       designation,
       department_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId,
      username,
      fullName,
      email,
      recoveryEmail,
      phone,
      dateOfBirth,
      passwordHash,
      role,
      designation,
      departmentId
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Employee created successfully.',
    data: {
      id: result.insertId
    }
  });
});

export const updateEmployee = asyncHandler(
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(
        'Invalid employee ID.',
        400
      );
    }

    const [targets] = await pool.query(
      `SELECT id, role FROM employees WHERE id = ? LIMIT 1`,
      [id]
    );
    const target = targets[0];
    if (!target) throw new AppError('Employee not found.', 404);

    const requestedRole = req.body.role || target.role;
    if (req.user.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'ADMIN'].includes(target.role)) {
      throw new AppError('Only Super Admin can manage Admin or Super Admin accounts.', 403);
    }
    if (req.user.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'ADMIN'].includes(requestedRole)) {
      throw new AppError('Only Super Admin can assign Admin or Super Admin roles.', 403);
    }

    const recoveryEmail = req.body.recoveryEmail?.trim() || null;

    const [result] = await pool.query(
      `UPDATE employees
       SET
         full_name = ?,
         email = ?,
         recovery_email = ?,
         username = ?,
         phone = ?,
         date_of_birth = ?,
         role = ?,
         designation = ?,
         department_id = ?,
         status = ?
       WHERE id = ?`,
      [
        req.body.fullName?.trim(),
        req.body.email?.trim() || null,
        recoveryEmail,
        req.body.username?.trim() || null,
        req.body.phone?.trim() || null,
        req.body.dateOfBirth || null,
        req.body.role,
        req.body.designation?.trim() || null,
        req.body.departmentId || null,
        req.body.status,
        id
      ]
    );

    if (!result.affectedRows) {
      throw new AppError(
        'Employee not found.',
        404
      );
    }

    res.json({
      success: true,
      message: 'Employee updated successfully.'
    });
  }
);

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
