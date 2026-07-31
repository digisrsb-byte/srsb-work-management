import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { sendPasswordResetOtp } from '../utils/mailer.js';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);
const MAX_OTP_ATTEMPTS = 5;

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier || req.body.employeeId);
  if (!identifier) throw new AppError('Employee ID, username or email is required.', 400);

  const [rows] = await pool.query(
    `SELECT id, employee_id, username, full_name, email, recovery_email, role, status
       FROM employees
      WHERE LOWER(COALESCE(employee_id, '')) = ?
         OR LOWER(COALESCE(username, '')) = ?
         OR LOWER(COALESCE(email, '')) = ?
      LIMIT 1`,
    [identifier, identifier, identifier]
  );
  const account = rows[0];

  // Neutral response prevents account discovery.
  if (!account || account.status !== 'ACTIVE') {
    return res.json({
      success: true,
      recoveryType: 'REQUEST',
      message: 'If the account is valid, the recovery process has been started.'
    });
  }

  if (PRIVILEGED_ROLES.has(account.role)) {
    const destination = account.recovery_email || account.email;
    if (!destination) {
      throw new AppError('No recovery email is registered. Contact the Super Admin.', 400);
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60 * 1000);

    await pool.query(
      `DELETE FROM password_reset_otps
        WHERE employee_id = ? OR expires_at < NOW() OR used_at IS NOT NULL`,
      [account.id]
    );
    await pool.query(
      `INSERT INTO password_reset_otps (employee_id, otp_hash, expires_at)
       VALUES (?, ?, ?)`,
      [account.id, otpHash, expiresAt]
    );

    try {
      await sendPasswordResetOtp({ to: destination, employeeName: account.full_name, otp });
    } catch (error) {
      await pool.query('DELETE FROM password_reset_otps WHERE employee_id = ?', [account.id]);
      throw error;
    }

    return res.json({
      success: true,
      recoveryType: 'OTP',
      identifier: req.body.identifier || req.body.employeeId,
      message: 'An OTP was sent to the registered recovery email.'
    });
  }

  await pool.query(
    `INSERT INTO password_reset_requests (employee_id, status)
     VALUES (?, 'PENDING')
     ON DUPLICATE KEY UPDATE status='PENDING', requested_at=CURRENT_TIMESTAMP,
       resolved_at=NULL, resolved_by=NULL`,
    [account.id]
  );

  res.json({
    success: true,
    recoveryType: 'REQUEST',
    message: 'Your password reset request was sent to Admin/Super Admin.'
  });
});

export const resetPrivilegedPasswordWithOtp = asyncHandler(async (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier || req.body.employeeId);
  const otp = String(req.body.otp || '').trim();
  const newPassword = String(req.body.newPassword || '');

  if (!identifier || !/^\d{6}$/.test(otp) || newPassword.length < 8) {
    throw new AppError('A valid account, 6-digit OTP and password of at least 8 characters are required.', 400);
  }

  const [rows] = await pool.query(
    `SELECT id, role, status FROM employees
      WHERE LOWER(COALESCE(employee_id, '')) = ?
         OR LOWER(COALESCE(username, '')) = ?
         OR LOWER(COALESCE(email, '')) = ?
      LIMIT 1`,
    [identifier, identifier, identifier]
  );
  const account = rows[0];
  if (!account || account.status !== 'ACTIVE' || !PRIVILEGED_ROLES.has(account.role)) {
    throw new AppError('Invalid or expired OTP.', 400);
  }

  const [otpRows] = await pool.query(
    `SELECT id, otp_hash, expires_at, attempts
       FROM password_reset_otps
      WHERE employee_id = ? AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [account.id]
  );
  const record = otpRows[0];
  if (!record) throw new AppError('Invalid or expired OTP.', 400);

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await pool.query('DELETE FROM password_reset_otps WHERE id = ?', [record.id]);
    throw new AppError('Too many attempts. Request a new OTP.', 429);
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    await pool.query('DELETE FROM password_reset_otps WHERE id = ?', [record.id]);
    throw new AppError('OTP expired. Request a new OTP.', 400);
  }

  const valid = await bcrypt.compare(otp, record.otp_hash);
  if (!valid) {
    await pool.query('UPDATE password_reset_otps SET attempts=attempts+1 WHERE id=?', [record.id]);
    throw new AppError('Invalid or expired OTP.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE employees SET password_hash=?, must_change_password=FALSE,
       password_changed_at=CURRENT_TIMESTAMP WHERE id=?`,
      [passwordHash, account.id]
    );
    await connection.query(
      'UPDATE password_reset_otps SET used_at=CURRENT_TIMESTAMP WHERE id=?',
      [record.id]
    );
    await connection.query(
      'DELETE FROM password_reset_otps WHERE employee_id=? AND id<>?',
      [account.id, record.id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json({ success: true, message: 'Password reset successfully. Sign in with your new password.' });
});
