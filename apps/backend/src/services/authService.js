import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalidCredentials() {
  throw new AppError('Invalid login ID or password.', 401);
}

export async function login(loginId, password) {
  const normalizedLogin = String(loginId || '').trim().toLowerCase();

  const [rows] = await pool.query(
    `SELECT e.id, e.employee_id, e.username, e.full_name, e.email,
      e.recovery_email, e.password_hash, e.role, e.designation, e.status,
      d.name AS department
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE LOWER(COALESCE(e.email, '')) = ?
        OR LOWER(COALESCE(e.employee_id, '')) = ?
        OR LOWER(COALESCE(e.username, '')) = ?
     LIMIT 1`,
    [normalizedLogin, normalizedLogin, normalizedLogin]
  );

  const employee = rows[0];

  if (!employee || employee.status !== 'ACTIVE') {
    invalidCredentials();
  }

  if (employee.role === 'SUPER_ADMIN') {
    const accountEmail = String(employee.email || '').trim().toLowerCase();

    if (
      !EMAIL_PATTERN.test(normalizedLogin) ||
      normalizedLogin !== accountEmail ||
      accountEmail !== env.superAdminEmail
    ) {
      invalidCredentials();
    }
  }

  const isValid = await bcrypt.compare(password, employee.password_hash);

  if (!isValid) {
    invalidCredentials();
  }

  const token = jwt.sign(
    {
      id: employee.id,
      employeeId: employee.employee_id,
      username: employee.username,
      email: employee.email,
      role: employee.role,
      fullName: employee.full_name
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  delete employee.password_hash;

  return {
    token,
    user: employee
  };
}
