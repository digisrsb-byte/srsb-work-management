import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { DEFAULT_CHECKLIST } from './activationService.js';
import { assertCompanyAccess, getCompanyIdsForUser } from './permissionService.js';
import { createNotification, notifyRoleHolders } from './notificationService.js';
import { writeAuditLog } from './auditService.js';
import { isValidEmail, issueInvitation } from './invitationService.js';

export const ONBOARDING_INITIATOR_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];

export function nextEmployeeCode(existingCodes) {
  let max = 0;
  for (const code of existingCodes) {
    const match = String(code).match(/^SRSB(\d+)$/i);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `SRSB${String(max + 1).padStart(3, '0')}`;
}

function nextDemoCode(existingCodes) {
  let max = 0;
  for (const code of existingCodes) {
    const match = String(code).match(/^DEMO-(\d+)$/i);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `DEMO-${String(max + 1).padStart(3, '0')}`;
}

// A new joiner stays INACTIVE until activation but may sign in to complete an open onboarding case.
export async function getOpenOnboardingCaseId(employeeId) {
  const [rows] = await pool.query(
    `SELECT id FROM onboarding_cases
     WHERE employee_id = ? AND is_demo = 0 AND status IN ('PENDING', 'IN_PROGRESS', 'READY')
     LIMIT 1`,
    [employeeId]
  );
  return rows[0]?.id || null;
}

export async function canSignInForOnboarding(employee) {
  if (!employee || employee.status !== 'INACTIVE' || employee.is_demo) return false;
  return Boolean(await getOpenOnboardingCaseId(employee.id));
}

// Picks the employer company for a new joiner: the requested one (if the user may
// access it), otherwise the user's home company, otherwise their first scoped company.
export async function resolveOnboardingCompanyId(user, requestedCompanyId) {
  if (requestedCompanyId) {
    await assertCompanyAccess(user, Number(requestedCompanyId));
    return Number(requestedCompanyId);
  }

  const companyIds = await getCompanyIdsForUser(user);
  if (!companyIds.length) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT company_id FROM employees WHERE id = ? LIMIT 1`,
    [user.id]
  );
  const home = Number(rows[0]?.company_id);
  return companyIds.includes(home) ? home : Number(companyIds[0]);
}

/**
 * Creates the INACTIVE employee record, the onboarding case and its document
 * checklist. Must run inside the caller's transaction.
 * Pass `candidate` for a Recruitment joiner, or `person` for an employee added directly
 * from Employees > Add Employee (the case then has no candidate_id).
 * Real joiners start with login_status PENDING_ACTIVATION and an unusable password;
 * they choose their own password through the emailed activation link.
 * Returns { created: false, caseId } when the candidate already has a case.
 */
export async function createOnboardingCase(connection, {
  candidate = null,
  person = null,
  companyId,
  actorId,
  joiningDate = null,
  designation = 'New Joiner',
  employeeCode: requestedCode = null,
  role = 'EMPLOYEE',
  departmentId = null,
  dateOfBirth = null
}) {
  const subject = candidate || person;
  if (!subject) {
    throw new AppError('Employee details are required to start onboarding.', 400);
  }

  const isDemo = Boolean(candidate?.is_demo);
  if (isDemo && !env.demoMode) {
    throw new AppError('Demo records are disabled in this environment.', 403);
  }

  if (candidate) {
    const [existing] = await connection.query(
      `SELECT id FROM onboarding_cases WHERE candidate_id = ? LIMIT 1 FOR UPDATE`,
      [candidate.id]
    );
    if (existing.length) {
      return { created: false, caseId: existing[0].id };
    }
  }

  const email = String(subject.email || '').trim();
  if (!isDemo && !isValidEmail(email)) {
    throw new AppError(
      candidate
        ? `${candidate.full_name} needs a valid email address before they can be marked as Joined. The activation link for their employee account is sent to that address. Update the candidate's email and try again.`
        : `${subject.full_name} needs a valid email address. The activation link for their employee account is sent to that address.`,
      400
    );
  }

  const [codes] = await connection.query(`SELECT employee_id FROM employees`);
  const existingCodes = codes.map((r) => r.employee_id);
  const customCode = String(requestedCode || '').trim();
  if (customCode && existingCodes.some((code) => String(code).toLowerCase() === customCode.toLowerCase())) {
    throw new AppError(`Employee ID ${customCode} is already in use.`, 409);
  }
  const employeeCode = customCode
    || (isDemo ? nextDemoCode(existingCodes) : nextEmployeeCode(existingCodes));

  // Nobody knows this password: demo employees never sign in, and real joiners replace
  // it when they accept their invitation.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

  let employeeId;
  try {
    const [empResult] = await connection.query(
      `INSERT INTO employees (
         employee_id, full_name, email, phone, date_of_birth, password_hash, role, designation,
         department_id, company_id, status, login_status, onboarding_status, must_change_password,
         joining_date, is_demo
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INACTIVE', ?, 'IN_PROGRESS', FALSE, COALESCE(?, CURDATE()), ?)`,
      [
        employeeCode,
        subject.full_name,
        email || null,
        subject.phone || null,
        dateOfBirth,
        passwordHash,
        role,
        designation,
        departmentId,
        companyId,
        isDemo ? 'ACTIVE' : 'PENDING_ACTIVATION',
        joiningDate,
        isDemo ? 1 : 0
      ]
    );
    employeeId = empResult.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        candidate
          ? `An employee with the email or phone of ${candidate.full_name} already exists, so an onboarding account cannot be created. Update the candidate's contact details or the existing employee record first.`
          : 'An employee with this Employee ID, email or phone already exists.',
        409
      );
    }
    throw error;
  }

  const [caseResult] = await connection.query(
    `INSERT INTO onboarding_cases (candidate_id, employee_id, company_id, status, initiated_by, is_demo)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
    [candidate ? candidate.id : null, employeeId, companyId, actorId, isDemo ? 1 : 0]
  );
  const caseId = caseResult.insertId;

  for (const item of DEFAULT_CHECKLIST) {
    await connection.query(
      `INSERT INTO onboarding_checklist_items (case_id, document_type, label, requirement, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        caseId,
        item.document_type,
        item.label,
        item.requirement,
        item.requirement === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'PENDING',
        item.sort_order
      ]
    );
  }

  return {
    created: true,
    caseId,
    employeeId,
    employeeCode,
    isDemo
  };
}

// Post-commit side effects: the activation email, notifications and audit.
// Demo cases skip email and notifications so real inboxes stay clean.
// Returns the invitation outcome for real joiners (null otherwise).
export async function announceOnboardingStarted({ result, candidateName, companyId, actorId, ipAddress }) {
  if (!result?.created) return null;

  let invitation = null;
  if (!result.isDemo) {
    try {
      invitation = await issueInvitation({ employeeId: result.employeeId, actorId, ipAddress });
    } catch (error) {
      invitation = { deliveryStatus: 'FAILED', deliveryError: error.message };
      console.error('Account invitation could not be created:', error.message);
    }
    try {
      await createNotification({
        recipientId: result.employeeId,
        actorId,
        type: 'ONBOARDING_INVITATION',
        title: 'Onboarding invitation',
        message: 'Your onboarding checklist is ready. Please upload the required documents.',
        referenceType: 'ONBOARDING',
        referenceId: result.caseId
      });
      await notifyRoleHolders({
        roles: ['SUPER_ADMIN', 'ADMIN', 'HR'],
        actorId,
        companyId,
        type: 'ONBOARDING_STARTED',
        title: 'Onboarding initiated',
        message: `Onboarding started for ${candidateName} (${result.employeeCode}).`,
        referenceType: 'ONBOARDING',
        referenceId: result.caseId
      });
    } catch (notifyError) {
      console.error('Onboarding notification failed:', notifyError.message);
    }
  }

  await writeAuditLog({
    employeeId: actorId,
    action: result.isDemo ? 'DEMO_ONBOARDING_INITIATED' : 'ONBOARDING_INITIATED',
    entityType: 'onboarding_cases',
    entityId: result.caseId,
    newValues: { employeeId: result.employeeId, companyId, employeeCode: result.employeeCode },
    ipAddress
  });

  return invitation;
}

// Summary of an invitation outcome that is safe to return to the admin UI.
export function invitationPayload(invitation) {
  if (!invitation) return null;
  return {
    deliveryStatus: invitation.deliveryStatus,
    deliveryError: invitation.deliveryError || null,
    maskedEmail: invitation.maskedEmail || null,
    expiresAt: invitation.expiresAt || null
  };
}

export function invitationMessage(invitation, employeeCode) {
  if (!invitation) return '';
  if (invitation.deliveryStatus === 'SENT') {
    return ` An activation link was emailed to ${invitation.maskedEmail}. ${employeeCode} can sign in after creating their password.`;
  }
  return ` The activation email could not be sent: ${invitation.deliveryError} Open the onboarding case and use Resend invitation once the problem is fixed.`;
}
