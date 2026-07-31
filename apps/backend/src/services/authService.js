import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export async function login(loginId, password) {
  const normalizedLogin = loginId.trim().toLowerCase();
  const [rows] = await pool.query(
    `SELECT e.id, e.employee_id, e.username, e.full_name, e.email,
      e.recovery_email, e.password_hash, e.role, e.designation, e.status,
      d.name AS department
     FROM employees e
     LEFT JOIN departments d ON d.id=e.department_id
     WHERE LOWER(COALESCE(e.email, ''))=?
        OR LOWER(COALESCE(e.employee_id, ''))=?
        OR LOWER(COALESCE(e.username, ''))=?
     LIMIT 1`,
    [normalizedLogin, normalizedLogin, normalizedLogin]
  );
  const employee = rows[0];
  if (!employee || employee.status !== 'ACTIVE') {
    throw new AppError('Invalid login ID or password.', 401);
  }
  const isValid = await bcrypt.compare(password, employee.password_hash);
  if (!isValid) throw new AppError('Invalid login ID or password.', 401);

  const token = jwt.sign({
    id: employee.id,
    employeeId: employee.employee_id,
    username: employee.username,
    email: employee.email,
    role: employee.role,
    fullName: employee.full_name
  }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  delete employee.password_hash;
  return { token, user: employee };
}
