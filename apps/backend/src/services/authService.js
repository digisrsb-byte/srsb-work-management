import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const HEAD_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL ||
  'info@srsbworkforcesolutions.com'
).trim().toLowerCase();

function invalidLogin() {
  throw new AppError(
    'Invalid login ID or password.',
    401
  );
}

export async function login(loginId, password) {
  const normalizedLogin = String(
    loginId || ''
  ).trim().toLowerCase();

  const [rows] = await pool.query(
    `SELECT
       e.id,
       e.employee_id,
       e.username,
       e.full_name,
       e.email,
       e.recovery_email,
       e.password_hash,
       e.role,
       e.account_type,
       e.designation,
       e.status,
       d.name AS department
     FROM employees e
     LEFT JOIN departments d
       ON d.id = e.department_id
     WHERE LOWER(COALESCE(e.email, '')) = ?
        OR LOWER(COALESCE(e.employee_id, '')) = ?
        OR LOWER(COALESCE(e.username, '')) = ?
     LIMIT 1`,
    [
      normalizedLogin,
      normalizedLogin,
      normalizedLogin
    ]
  );

  const account = rows[0];

  if (
    !account ||
    account.status !== 'ACTIVE'
  ) {
    invalidLogin();
  }

  const isSystemAccount =
    account.account_type === 'SYSTEM';

  if (isSystemAccount) {
    const accountEmail = String(
      account.email || ''
    ).trim().toLowerCase();

    if (
      account.role !== 'SUPER_ADMIN' ||
      normalizedLogin !== accountEmail ||
      accountEmail !== HEAD_ADMIN_EMAIL
    ) {
      invalidLogin();
    }
  } else if (
    account.role === 'SUPER_ADMIN'
  ) {
    // A normal employee record must never receive
    // Head Admin authority.
    invalidLogin();
  }

  const isValid = await bcrypt.compare(
    String(password || ''),
    account.password_hash
  );

  if (!isValid) {
    invalidLogin();
  }

  const token = jwt.sign(
    {
      id: account.id,
      employeeId: account.employee_id,
      username: account.username,
      email: account.email,
      role: account.role,
      accountType: account.account_type,
      fullName: account.full_name
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn
    }
  );

  delete account.password_hash;

  account.accountType =
    account.account_type;

  delete account.account_type;

  return {
    token,
    user: account
  };
}
