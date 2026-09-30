import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getTenantContext, pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { sendAccountInvitation } from '../utils/mailer.js';
import { writeAuditLog } from './auditService.js';
import { notifyRoleHolders } from './notificationService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 160 && EMAIL_PATTERN.test(email);
}

export function maskEmail(value) {
  const [local, domain] = String(value || '').split('@');
  if (!domain) return '';
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export function passwordPolicyError(password, employeeCode) {
  const value = String(password || '');
  if (value.length < 8) return 'Password must contain at least 8 characters.';
  if (value.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return 'Password must include an uppercase letter, a lowercase letter and a number.';
  }
  if (employeeCode && value.toLowerCase().includes(String(employeeCode).toLowerCase())) {
    return 'Password must not contain your Employee ID.';
  }
  return null;
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function activationUrl(token) {
  const companyCode = getTenantContext()?.companyCode || env.defaultCompanyCode;
  return `${env.appBaseUrl}/#/activate-account?token=${encodeURIComponent(token)}&company=${encodeURIComponent(companyCode)}`;
}

export function deliveryErrorMessage(error) {
  const text = String(error?.message || 'Unknown email error');
  if (/not configured/i.test(text)) return 'Email service is not configured on the server.';
  if (error?.code === 'EAUTH') return 'The email server rejected the SMTP login.';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(error?.code)) {
    return 'The email server could not be reached.';
  }
  if (error?.responseCode >= 500 && error?.responseCode < 600) {
    return `The email server refused the message: ${text}`.slice(0, 480);
  }
  return text.slice(0, 480);
}

/**
 * Derived invitation state shown to admins:
 * NOT_REQUIRED  existing password login (not created through invitations)
 * NOT_SENT      pending activation but no invitation exists yet
 * FAILED        latest invitation could not be emailed
 * SENT          latest invitation emailed and still valid
 * EXPIRED       latest invitation expired before use
 * ACCEPTED      the employee activated their account
 */
export function invitationState(loginStatus, invitation) {
  if (invitation?.status === 'ACCEPTED' || (loginStatus === 'ACTIVE' && invitation)) return 'ACCEPTED';
  if (loginStatus !== 'PENDING_ACTIVATION') return 'NOT_REQUIRED';
  if (!invitation || invitation.status !== 'PENDING') return 'NOT_SENT';
  if (invitation.delivery_status === 'FAILED') return 'FAILED';
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return 'EXPIRED';
  return invitation.delivery_status === 'SENT' ? 'SENT' : 'NOT_SENT';
}

export async function getInvitationSummary(employeeId) {
  const [[employee]] = await pool.query(
    `SELECT id, email, login_status, email_verified_at, is_demo FROM employees WHERE id = ?`,
    [employeeId]
  );
  if (!employee) return null;
  const [[invitation]] = await pool.query(
    `SELECT i.id, i.email, i.status, i.delivery_status, i.delivery_error, i.expires_at,
            i.sent_at, i.accepted_at, i.created_at, creator.full_name AS created_by_name,
            (SELECT COUNT(*) FROM employee_invitations x WHERE x.employee_id = i.employee_id) AS invitations_sent
     FROM employee_invitations i
     LEFT JOIN employees creator ON creator.id = i.created_by
     WHERE i.employee_id = ?
     ORDER BY i.id DESC
     LIMIT 1`,
    [employeeId]
  );
  return {
    state: employee.is_demo ? 'NOT_REQUIRED' : invitationState(employee.login_status, invitation),
    loginStatus: employee.login_status,
    email: employee.email,
    emailVerifiedAt: employee.email_verified_at,
    latest: invitation
      ? {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          deliveryStatus: invitation.delivery_status,
          deliveryError: invitation.delivery_error,
          expiresAt: invitation.expires_at,
          sentAt: invitation.sent_at,
          acceptedAt: invitation.accepted_at,
          createdAt: invitation.created_at,
          createdByName: invitation.created_by_name,
          count: Number(invitation.invitations_sent)
        }
      : null
  };
}

/**
 * Creates a new single-use activation link for an employee awaiting activation,
 * revokes any earlier links, and emails it. Never throws for email delivery problems;
 * the outcome is recorded on the invitation and returned to the caller.
 */
export async function issueInvitation({ employeeId, actorId, ipAddress, resend = false }) {
  const connection = await pool.getConnection();
  let employee;
  let invitationId;
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.inviteExpiryHours * 60 * 60 * 1000);

  try {
    await connection.beginTransaction();
    const [[row]] = await connection.query(
      `SELECT e.id, e.employee_id, e.full_name, e.email, e.login_status, e.is_demo, c.name AS company_name
       FROM employees e
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.id = ?
       FOR UPDATE`,
      [employeeId]
    );
    if (!row) throw new AppError('Employee not found.', 404);
    if (row.is_demo) throw new AppError('Demo employees do not receive account invitations.', 400);
    if (row.login_status !== 'PENDING_ACTIVATION') {
      throw new AppError(`${row.full_name} has already activated their account.`, 409);
    }
    if (!isValidEmail(row.email)) {
      throw new AppError(`${row.full_name} does not have a valid email address. Add one before sending the invitation.`, 400);
    }
    employee = row;

    await connection.query(
      `UPDATE employee_invitations SET status = 'REVOKED' WHERE employee_id = ? AND status = 'PENDING'`,
      [employeeId]
    );
    const [result] = await connection.query(
      `INSERT INTO employee_invitations (employee_id, email, token_hash, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [employeeId, employee.email, hashToken(token), expiresAt, actorId || null]
    );
    invitationId = result.insertId;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  let deliveryStatus = 'SENT';
  let deliveryError = null;
  try {
    await sendAccountInvitation({
      to: employee.email,
      employeeName: employee.full_name,
      employeeCode: employee.employee_id,
      companyName: employee.company_name,
      activationUrl: activationUrl(token),
      expiresAt
    });
  } catch (error) {
    deliveryStatus = 'FAILED';
    deliveryError = deliveryErrorMessage(error);
    console.error(`Invitation email to employee ${employee.employee_id} failed:`, error.message);
  }

  await pool.query(
    `UPDATE employee_invitations
     SET delivery_status = ?, delivery_error = ?, sent_at = IF(? = 'SENT', NOW(), NULL)
     WHERE id = ?`,
    [deliveryStatus, deliveryError, deliveryStatus, invitationId]
  );

  await writeAuditLog({
    employeeId: actorId,
    action: deliveryStatus === 'SENT'
      ? (resend ? 'ACCOUNT_INVITATION_RESENT' : 'ACCOUNT_INVITATION_SENT')
      : 'ACCOUNT_INVITATION_FAILED',
    entityType: 'employee_invitations',
    entityId: invitationId,
    newValues: { employeeId, email: maskEmail(employee.email), expiresAt, deliveryError },
    ipAddress
  });

  return {
    invitationId,
    deliveryStatus,
    deliveryError,
    email: employee.email,
    maskedEmail: maskEmail(employee.email),
    expiresAt,
    ...(deliveryStatus === 'FAILED' && env.inviteLinkFallback
      ? { fallbackActivationUrl: activationUrl(token) }
      : {})
  };
}

function tokenProblem(invitation) {
  if (!invitation) {
    return new AppError('This activation link is not valid. Check that you opened the full link from your email, or ask HR to resend the invitation.', 404);
  }
  if (invitation.status === 'ACCEPTED' || invitation.login_status === 'ACTIVE') {
    return new AppError('This activation link has already been used. Sign in with your Employee ID and password, or use Forgot password.', 410);
  }
  if (invitation.status === 'REVOKED') {
    return new AppError('This activation link was replaced by a newer invitation. Open the most recent email from HR.', 410);
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return new AppError('This activation link has expired. Ask HR to resend your invitation.', 410);
  }
  return null;
}

async function findInvitation(executor, token, { lock = false } = {}) {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const [[invitation]] = await executor.query(
    `SELECT i.*, e.employee_id AS employee_code, e.full_name, e.login_status, e.is_demo, e.email AS employee_email
     FROM employee_invitations i
     INNER JOIN employees e ON e.id = i.employee_id
     WHERE i.token_hash = ?
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [hashToken(token)]
  );
  return invitation && !invitation.is_demo ? invitation : null;
}

export async function verifyInvitationToken(token) {
  const invitation = await findInvitation(pool, token);
  const problem = tokenProblem(invitation);
  if (problem) throw problem;
  return {
    employeeCode: invitation.employee_code,
    fullName: invitation.full_name,
    maskedEmail: maskEmail(invitation.email),
    expiresAt: invitation.expires_at
  };
}

export async function acceptInvitation({ token, password, ipAddress }) {
  const connection = await pool.getConnection();
  let invitation;
  try {
    await connection.beginTransaction();
    invitation = await findInvitation(connection, token, { lock: true });
    const problem = tokenProblem(invitation);
    if (problem) throw problem;
    if (invitation.email !== invitation.employee_email) {
      throw new AppError('Your email address was changed after this link was sent. Open the most recent email from HR.', 410);
    }
    const policy = passwordPolicyError(password, invitation.employee_code);
    if (policy) throw new AppError(policy, 400);

    await connection.query(
      `UPDATE employees
       SET password_hash = ?,
           login_status = 'ACTIVE',
           email_verified_at = NOW(),
           must_change_password = 0,
           password_changed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND login_status = 'PENDING_ACTIVATION'`,
      [await bcrypt.hash(password, 12), invitation.employee_id]
    );
    await connection.query(
      `UPDATE employee_invitations SET status = 'ACCEPTED', accepted_at = NOW() WHERE id = ?`,
      [invitation.id]
    );
    await connection.query(
      `UPDATE employee_invitations SET status = 'REVOKED' WHERE employee_id = ? AND status = 'PENDING'`,
      [invitation.employee_id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [[caseRow]] = await pool.query(
    `SELECT id, company_id FROM onboarding_cases WHERE employee_id = ? LIMIT 1`,
    [invitation.employee_id]
  );
  try {
    await notifyRoleHolders({
      roles: ['SUPER_ADMIN', 'ADMIN', 'HR'],
      actorId: invitation.employee_id,
      companyId: caseRow?.company_id,
      type: 'ACCOUNT_ACTIVATED',
      title: 'Employee account activated',
      message: `${invitation.full_name} (${invitation.employee_code}) verified their email and created a password.`,
      referenceType: caseRow ? 'ONBOARDING' : null,
      referenceId: caseRow?.id || null
    });
  } catch (error) {
    console.error('Account activation notification failed:', error.message);
  }
  await writeAuditLog({
    employeeId: invitation.employee_id,
    action: 'ACCOUNT_INVITATION_ACCEPTED',
    entityType: 'employee_invitations',
    entityId: invitation.id,
    newValues: { employeeCode: invitation.employee_code },
    ipAddress
  });

  return { employeeCode: invitation.employee_code, fullName: invitation.full_name };
}
