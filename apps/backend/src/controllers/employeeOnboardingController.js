import path from 'path';
import fs from 'fs';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  assertCompanyAccess,
  assertPermission,
  getCompanyIdsForUser
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  createNotification,
  notifyRoleHolders
} from '../services/notificationService.js';
import {
  DEFAULT_CHECKLIST,
  canActivateEmployee,
  getBankBlocker,
  refreshCaseStatus
} from '../services/activationService.js';
import { getBankSummary } from './bankDetailsController.js';
import { displayStatus } from '../services/bankDetailsRules.js';
import {
  announceOnboardingStarted,
  createOnboardingCase,
  invitationMessage,
  invitationPayload,
  resolveOnboardingCompanyId
} from '../services/employeeOnboardingService.js';
import {
  getInvitationSummary,
  invitationState,
  isValidEmail,
  issueInvitation
} from '../services/invitationService.js';
import {
  clearDemoOnboarding,
  getDemoSummary,
  isVirtualPlaceholder,
  renderDemoPlaceholder,
  seedDemoOnboarding
} from '../services/demoOnboardingService.js';
import {
  fileMatchesDeclaredType,
  persistUpload,
  removeUploadedFile,
  uploadsRoot
} from '../middleware/upload.js';

const REVIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
const ONBOARDING_MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];
// Only these roles verify, reject or waive onboarding documents; HR and Managers can view them.
const DOCUMENT_VERIFIER_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const UPLOADABLE_STATUSES = ['PENDING', 'CORRECTION_REQUIRED', 'REJECTED'];
// The employee may replace or remove a document until a verifier reviews it.
const OWNER_EDITABLE_STATUSES = ['UPLOADED', 'SUBMITTED'];
const OWNER_UPLOADABLE_STATUSES = [...UPLOADABLE_STATUSES, ...OWNER_EDITABLE_STATUSES];
// Required documents that still need a file from the employee before they can submit.
const MISSING_UPLOAD_STATUSES = ['PENDING', 'CORRECTION_REQUIRED', 'REJECTED'];
const MIN_REVIEW_COMMENT = 5;
const MIN_EXCEPTION_REASON = 15;

function assertDemoVisible(row) {
  if (row?.is_demo && !env.demoMode) {
    throw new AppError('Onboarding case not found.', 404);
  }
}

async function getCaseOrThrow(caseId) {
  const [rows] = await pool.query(
    `SELECT
       oc.*,
       e.full_name,
       e.email,
       e.phone,
       e.employee_id AS emp_code,
       e.status AS employee_status,
       e.joining_date,
       e.designation,
       d.name AS department_name,
       c.name AS company_name,
       activator.full_name AS activated_by_name
     FROM onboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN companies c ON c.id = oc.company_id
     LEFT JOIN employees activator ON activator.id = oc.activated_by
     WHERE oc.id = ?
     LIMIT 1`,
    [caseId]
  );

  if (!rows.length) {
    throw new AppError('Onboarding case not found.', 404);
  }

  assertDemoVisible(rows[0]);
  return rows[0];
}

function isCaseOwner(user, onboardingCase) {
  return Number(user.id) === Number(onboardingCase.employee_id);
}

// Employees see only their own case; reviewers see cases inside their company scope.
async function assertCaseAccess(user, onboardingCase) {
  if (isCaseOwner(user, onboardingCase)) {
    return;
  }
  if (!REVIEWER_ROLES.includes(user.role)) {
    throw new AppError('You cannot access this onboarding case.', 403);
  }
  await assertCompanyAccess(user, onboardingCase.company_id);
}

function assertCaseOpen(onboardingCase) {
  if (['ACTIVATED', 'CANCELLED'].includes(onboardingCase.status)) {
    throw new AppError(
      `This onboarding case is ${onboardingCase.status.toLowerCase()} and its documents can no longer be changed.`,
      409
    );
  }
}

async function loadCaseDocuments(caseId) {
  const [rows] = await pool.query(
    `SELECT
       oci.id AS checklist_item_id,
       oci.document_type,
       oci.label,
       oci.requirement,
       oci.status AS item_status,
       oci.sort_order,
       ds.id AS submission_id,
       ds.current_version,
       ds.latest_status,
       dv.id AS version_id,
       dv.version_number,
       dv.original_name,
       dv.mime_type,
       dv.file_size,
       dv.uploaded_at,
       dv.upload_channel,
       dv.upload_reason,
       uploader.full_name AS uploaded_by_name,
       dr.decision AS last_decision,
       dr.comments AS last_comments,
       dr.created_at AS last_reviewed_at,
       dr.version_id AS last_reviewed_version_id,
       reviewer.full_name AS last_reviewer_name
     FROM onboarding_checklist_items oci
     LEFT JOIN document_submissions ds ON ds.checklist_item_id = oci.id
     LEFT JOIN document_versions dv
       ON dv.submission_id = ds.id AND dv.version_number = ds.current_version AND dv.withdrawn_at IS NULL
     LEFT JOIN employees uploader ON uploader.id = dv.uploaded_by
     LEFT JOIN document_reviews dr
       ON dr.id = (
         SELECT r.id FROM document_reviews r
         WHERE r.submission_id = ds.id
         ORDER BY r.id DESC
         LIMIT 1
       )
     LEFT JOIN employees reviewer ON reviewer.id = dr.reviewer_id
     WHERE oci.case_id = ?
     ORDER BY oci.sort_order`,
    [caseId]
  );
  return rows;
}

export const listOnboardingCases = asyncHandler(async (req, res) => {
  const isReviewer = REVIEWER_ROLES.includes(req.user.role);
  const companyIds = await getCompanyIdsForUser(req.user);
  if (isReviewer && !companyIds.length && req.user.role !== 'SUPER_ADMIN') {
    return res.json({ success: true, data: [], meta: { demoMode: env.demoMode } });
  }

  let sql = `
    SELECT
      oc.id,
      oc.candidate_id,
      oc.employee_id,
      oc.company_id,
      oc.status,
      oc.is_demo,
      oc.created_at,
      oc.updated_at,
      oc.activated_at,
      e.full_name,
      e.employee_id AS emp_code,
      e.email,
      e.designation,
      e.joining_date,
      e.onboarding_status,
      e.status AS employee_status,
      e.login_status,
      inv.status AS invitation_status,
      inv.delivery_status AS invitation_delivery_status,
      inv.expires_at AS invitation_expires_at,
      d.name AS department_name,
      c.name AS company_name,
      cand.full_name AS candidate_name,
      COALESCE(p.total_items, 0) AS total_items,
      COALESCE(p.required_total, 0) AS required_total,
      COALESCE(p.required_done, 0) AS required_done,
      COALESCE(p.awaiting_review, 0) AS awaiting_review,
      COALESCE(p.needs_correction, 0) AS needs_correction,
      COALESCE(p.rejected, 0) AS rejected,
      COALESCE(p.not_uploaded, 0) AS not_uploaded,
      COALESCE(p.not_applicable, 0) AS not_applicable,
      obd.status AS bank_row_status,
      (SELECT r.decision FROM onboarding_bank_reviews r
        WHERE r.bank_detail_id = obd.id ORDER BY r.id DESC LIMIT 1) AS bank_last_decision
    FROM onboarding_cases oc
    LEFT JOIN onboarding_bank_details obd ON obd.case_id = oc.id
    INNER JOIN employees e ON e.id = oc.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    INNER JOIN companies c ON c.id = oc.company_id
    LEFT JOIN candidates cand ON cand.id = oc.candidate_id
    LEFT JOIN employee_invitations inv ON inv.id = (
      SELECT MAX(i.id) FROM employee_invitations i WHERE i.employee_id = oc.employee_id
    )
    LEFT JOIN (
      SELECT
        case_id,
        COUNT(*) AS total_items,
        SUM(requirement = 'REQUIRED') AS required_total,
        SUM(requirement = 'REQUIRED' AND status IN ('VERIFIED', 'NOT_APPLICABLE')) AS required_done,
        SUM(status = 'SUBMITTED') AS awaiting_review,
        SUM(status = 'CORRECTION_REQUIRED') AS needs_correction,
        SUM(status = 'REJECTED') AS rejected,
        SUM(requirement = 'REQUIRED' AND status = 'PENDING') AS not_uploaded,
        SUM(status = 'NOT_APPLICABLE') AS not_applicable
      FROM onboarding_checklist_items
      GROUP BY case_id
    ) p ON p.case_id = oc.id
    WHERE 1 = 1
  `;
  const params = [];

  if (!env.demoMode) {
    sql += ' AND oc.is_demo = 0';
  }

  if (isReviewer) {
    if (req.user.role !== 'SUPER_ADMIN') {
      sql += ' AND oc.company_id IN (?)';
      params.push(companyIds);
    }
  } else {
    sql += ' AND oc.employee_id = ?';
    params.push(req.user.id);
  }

  sql += ` ORDER BY FIELD(oc.status, 'READY', 'IN_PROGRESS', 'PENDING', 'ACTIVATED', 'CANCELLED'), oc.updated_at DESC`;

  const [rows] = await pool.query(sql, params);
  const data = rows.map(({ invitation_status, invitation_delivery_status, invitation_expires_at, bank_row_status, bank_last_decision, ...row }) => ({
    ...row,
    bank_status: displayStatus(bank_row_status ? { status: bank_row_status } : null, bank_last_decision),
    invitation_state: row.is_demo
      ? 'NOT_REQUIRED'
      : invitationState(
          row.login_status,
          invitation_status
            ? { status: invitation_status, delivery_status: invitation_delivery_status, expires_at: invitation_expires_at }
            : null
        )
  }));
  res.json({ success: true, data, meta: { demoMode: env.demoMode } });
});

// The signed-in employee's own onboarding case, for the Employee Portal.
export const getMyOnboarding = asyncHandler(async (req, res) => {
  const [cases] = await pool.query(
    `SELECT id FROM onboarding_cases
     WHERE employee_id = ?${env.demoMode ? '' : ' AND is_demo = 0'}
     ORDER BY id DESC
     LIMIT 1`,
    [req.user.id]
  );

  if (!cases.length) {
    return res.json({ success: true, data: { case: null, items: [], activation: null } });
  }

  const onboardingCase = await getCaseOrThrow(cases[0].id);
  const [items, activation, bank] = await Promise.all([
    loadCaseDocuments(onboardingCase.id),
    canActivateEmployee(onboardingCase.employee_id),
    getBankSummary(onboardingCase, req.user)
  ]);

  res.json({
    success: true,
    data: {
      case: {
        id: onboardingCase.id,
        status: onboardingCase.status,
        full_name: onboardingCase.full_name,
        emp_code: onboardingCase.emp_code,
        email: onboardingCase.email,
        designation: onboardingCase.designation,
        department_name: onboardingCase.department_name,
        company_name: onboardingCase.company_name,
        joining_date: onboardingCase.joining_date,
        employee_status: onboardingCase.employee_status,
        activated_at: onboardingCase.activated_at,
        created_at: onboardingCase.created_at
      },
      items,
      bank,
      activation: { allowed: activation.allowed, blockers: activation.blockers }
    }
  });
});

export const initiateOnboarding = asyncHandler(async (req, res) => {
  const candidateId = Number(req.body.candidateId);

  if (!candidateId) {
    throw new AppError('Candidate is required.', 400);
  }

  const companyId = await resolveOnboardingCompanyId(req.user, req.body.companyId);
  if (!companyId) {
    throw new AppError('No company is available in your access scope for this onboarding.', 403);
  }

  const [candidates] = await pool.query(
    `SELECT * FROM candidates WHERE id = ? LIMIT 1`,
    [candidateId]
  );

  if (!candidates.length || (candidates[0].is_demo && !env.demoMode)) {
    throw new AppError('Candidate not found.', 404);
  }

  const candidate = candidates[0];

  // A candidate can be sourced for several requirements; JOINED is only reached after
  // the placement is recorded, so onboarding starts from that application.
  const [[joinedApplication]] = await pool.query(
    `SELECT ca.id, jo.title
     FROM candidate_applications ca
     JOIN job_openings jo ON jo.id = ca.opening_id
     WHERE ca.candidate_id = ? AND ca.stage = 'JOINED'
     ORDER BY ca.last_updated DESC
     LIMIT 1`,
    [candidateId]
  );
  if (!joinedApplication) {
    throw new AppError('Mark the candidate as Joined (with placement details) before starting onboarding.', 409);
  }

  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();

    result = await createOnboardingCase(connection, {
      candidate,
      companyId,
      actorId: req.user.id,
      designation: joinedApplication.title || undefined
    });

    if (!result.created) {
      throw new AppError('Onboarding already initiated for this candidate.', 409);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const invitation = await announceOnboardingStarted({
    result,
    candidateName: candidate.full_name,
    companyId,
    actorId: req.user.id,
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: `Employee account ${result.employeeCode} and onboarding case created.${invitationMessage(invitation, result.employeeCode)}`,
    data: {
      caseId: result.caseId,
      employeeId: result.employeeId,
      employeeCode: result.employeeCode,
      invitation: invitationPayload(invitation)
    }
  });
});

// Sends a fresh activation link (earlier links stop working). HR may correct the email first.
export const resendInvitation = asyncHandler(async (req, res) => {
  const onboardingCase = await getCaseOrThrow(Number(req.params.caseId));
  await assertCompanyAccess(req.user, onboardingCase.company_id);
  await assertPermission(req.user, 'onboarding', 'edit');
  if (onboardingCase.is_demo) {
    throw new AppError('Demo employees do not receive account invitations.', 400);
  }
  if (onboardingCase.status === 'CANCELLED') {
    throw new AppError('This onboarding case is cancelled.', 409);
  }

  const requestedEmail = req.body.email === undefined ? null : String(req.body.email).trim();
  if (requestedEmail !== null && requestedEmail !== onboardingCase.email) {
    if (!isValidEmail(requestedEmail)) {
      throw new AppError('Enter a valid email address.', 400);
    }
    const [[inUse]] = await pool.query(
      `SELECT id FROM employees WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1`,
      [requestedEmail, onboardingCase.employee_id]
    );
    if (inUse) {
      throw new AppError('Another employee already uses this email address.', 409);
    }
    const [update] = await pool.query(
      `UPDATE employees SET email = ?, email_verified_at = NULL
       WHERE id = ? AND login_status = 'PENDING_ACTIVATION'`,
      [requestedEmail, onboardingCase.employee_id]
    );
    if (!update.affectedRows) {
      throw new AppError(`${onboardingCase.full_name} has already activated their account.`, 409);
    }
    await writeAuditLog({
      employeeId: req.user.id,
      action: 'EMPLOYEE_EMAIL_UPDATED_FOR_INVITATION',
      entityType: 'employees',
      entityId: onboardingCase.employee_id,
      oldValues: { email: onboardingCase.email },
      newValues: { email: requestedEmail },
      ipAddress: req.ip
    });
  }

  const invitation = await issueInvitation({
    employeeId: onboardingCase.employee_id,
    actorId: req.user.id,
    ipAddress: req.ip,
    resend: true
  });

  if (invitation.deliveryStatus !== 'SENT' && invitation.fallbackActivationUrl) {
    await writeAuditLog({
      employeeId: req.user.id,
      action: 'ACCOUNT_INVITATION_LINK_SHOWN_DEV',
      entityType: 'employee_invitations',
      entityId: invitation.invitationId,
      newValues: { reason: invitation.deliveryError },
      ipAddress: req.ip
    });
    return res.json({
      success: true,
      message: `The activation email could not be sent: ${invitation.deliveryError} Development mode: copy the activation link below and open it in a private browser window to create the employee's password. Earlier links no longer work.`,
      data: {
        invitation: invitationPayload(invitation),
        fallbackActivationUrl: invitation.fallbackActivationUrl
      }
    });
  }

  if (invitation.deliveryStatus !== 'SENT') {
    throw new AppError(
      `The invitation could not be emailed: ${invitation.deliveryError} Check the email address and the server's email settings, then try again.`,
      502,
      { invitation: invitationPayload(invitation) }
    );
  }

  res.json({
    success: true,
    message: `A new activation link was emailed to ${invitation.maskedEmail}. Earlier links no longer work.`,
    data: { invitation: invitationPayload(invitation) }
  });
});

export const getChecklist = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await getCaseOrThrow(caseId);
  await assertCaseAccess(req.user, onboardingCase);

  const [items] = await pool.query(
    `SELECT
       oci.*,
       ds.id AS submission_id,
       ds.current_version,
       ds.latest_status
     FROM onboarding_checklist_items oci
     LEFT JOIN document_submissions ds ON ds.checklist_item_id = oci.id
     WHERE oci.case_id = ?
     ORDER BY oci.sort_order`,
    [caseId]
  );

  const activation = await canActivateEmployee(onboardingCase.employee_id);
  const invitation = REVIEWER_ROLES.includes(req.user.role)
    ? await getInvitationSummary(onboardingCase.employee_id)
    : null;

  res.json({
    success: true,
    data: {
      case: onboardingCase,
      items,
      activation,
      invitation
    }
  });
});

export const listCaseDocuments = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await getCaseOrThrow(caseId);
  await assertCaseAccess(req.user, onboardingCase);

  res.json({ success: true, data: await loadCaseDocuments(caseId) });
});

function uploadBlockedMessage(item) {
  switch (item.status) {
    case 'SUBMITTED':
      return `${item.label} is already submitted and waiting for review. The employee can replace or remove it from My Onboarding until it is reviewed.`;
    case 'UPLOADED':
      return `${item.label} has been uploaded by the employee but not submitted yet.`;
    case 'VERIFIED':
      return `${item.label} is already verified.`;
    case 'NOT_APPLICABLE':
      return `${item.label} is marked Not Applicable.`;
    default:
      return `${item.label} cannot be uploaded right now.`;
  }
}

// Stores a new version for a checklist item. Earlier versions and reviews are always kept.
async function storeDocumentVersion(req, onboardingCase, { channel, reason }) {
  const caseId = onboardingCase.id;
  const checklistItemId = Number(req.body.checklistItemId);
  const connection = await pool.getConnection();
  let item;
  let submissionId;
  let versionNumber = 1;
  let versionId;
  // Employee uploads are drafts until submitted; administrative uploads go straight to review.
  const nextStatus = channel === 'EMPLOYEE' ? 'UPLOADED' : 'SUBMITTED';

  try {
    await connection.beginTransaction();

    const [items] = await connection.query(
      `SELECT * FROM onboarding_checklist_items
       WHERE id = ? AND case_id = ?
       LIMIT 1
       FOR UPDATE`,
      [checklistItemId, caseId]
    );
    if (!items.length) {
      throw new AppError('Checklist item not found.', 404);
    }
    item = items[0];
    const allowedStatuses = channel === 'EMPLOYEE' ? OWNER_UPLOADABLE_STATUSES : UPLOADABLE_STATUSES;
    if (!allowedStatuses.includes(item.status)) {
      throw new AppError(uploadBlockedMessage(item), 409);
    }

    persistUpload(req.file);

    const [subs] = await connection.query(
      `SELECT * FROM document_submissions WHERE checklist_item_id = ? LIMIT 1 FOR UPDATE`,
      [checklistItemId]
    );

    if (subs.length) {
      submissionId = subs[0].id;
      versionNumber = Number(subs[0].current_version) + 1;
      await connection.query(
        `UPDATE document_submissions
         SET current_version = ?, latest_status = ?
         WHERE id = ?`,
        [versionNumber, nextStatus, submissionId]
      );
    } else {
      const [subResult] = await connection.query(
        `INSERT INTO document_submissions (
           checklist_item_id, employee_id, current_version, latest_status
         ) VALUES (?, ?, 1, ?)`,
        [checklistItemId, onboardingCase.employee_id, nextStatus]
      );
      submissionId = subResult.insertId;
    }

    const [verResult] = await connection.query(
      `INSERT INTO document_versions (
         submission_id, version_number, original_name, stored_name, mime_type,
         file_size, storage_path, uploaded_by, upload_channel, upload_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submissionId,
        versionNumber,
        req.file.originalname.slice(0, 255),
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        `onboarding/${path.basename(req.file.path)}`,
        req.user.id,
        channel,
        reason
      ]
    );
    versionId = verResult.insertId;

    await connection.query(
      `UPDATE onboarding_checklist_items SET status = ? WHERE id = ?`,
      [nextStatus, checklistItemId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    removeUploadedFile(req.file);
    throw error;
  } finally {
    connection.release();
  }

  await refreshCaseStatus(caseId);

  // Employee uploads notify verifiers only when the employee submits them (submitDocuments).
  if (!onboardingCase.is_demo) {
    if (channel !== 'EMPLOYEE') {
      await createNotification({
        recipientId: onboardingCase.employee_id,
        actorId: req.user.id,
        type: 'DOCUMENT_UPLOADED_BY_ADMIN',
        title: `${item.label} uploaded by HR`,
        message: `${item.label} was added to your onboarding checklist by HR. Reason: ${reason}`,
        referenceType: 'ONBOARDING',
        referenceId: caseId
      });
    }
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: channel === 'ADMIN_EXCEPTION' ? 'DOCUMENT_UPLOADED_BY_ADMIN' : 'DOCUMENT_UPLOADED',
    entityType: 'document_versions',
    entityId: versionId,
    newValues: {
      caseId,
      checklistItemId,
      versionNumber,
      channel,
      reason,
      originalName: req.file.originalname
    },
    ipAddress: req.ip
  });

  return { item, submissionId, versionId, versionNumber };
}

async function prepareUpload(req, check) {
  if (!req.file) {
    throw new AppError('Choose a file to upload.', 400);
  }
  if (!Number(req.body.checklistItemId)) {
    throw new AppError('Checklist item is required.', 400);
  }
  const onboardingCase = await getCaseOrThrow(Number(req.params.caseId));
  await check(onboardingCase);
  assertCaseOpen(onboardingCase);
  if (!fileMatchesDeclaredType(req.file)) {
    throw new AppError(
      'The file is damaged or its content does not match its type. Upload a complete PDF, JPG, PNG, WEBP or Word document.',
      400
    );
  }
  return onboardingCase;
}

// Normal flow: employees upload their own onboarding documents.
export const uploadDocument = asyncHandler(async (req, res) => {
  const onboardingCase = await prepareUpload(req, async (candidateCase) => {
    if (!isCaseOwner(req.user, candidateCase)) {
      throw new AppError(
        'Only the employee can upload documents to their onboarding checklist. Reviewers verify documents; they do not upload them.',
        403
      );
    }
    // The owner uploads as a new joiner, whatever role their account will hold once
    // activated (e.g. RECRUITER or MANAGER), so the EMPLOYEE onboarding permission applies.
    await assertPermission({ role: 'EMPLOYEE' }, 'onboarding', 'create');
  });

  const result = await storeDocumentVersion(req, onboardingCase, { channel: 'EMPLOYEE', reason: null });

  res.status(201).json({
    success: true,
    message: `${result.item.label} uploaded${result.versionNumber > 1 ? ` (version ${result.versionNumber})` : ''}. Press "Submit for verification" when your documents are ready to send to the Admin.`,
    data: {
      submissionId: result.submissionId,
      versionId: result.versionId,
      versionNumber: result.versionNumber
    }
  });
});

// Exceptional administrative upload: separate endpoint, reason required, fully audited.
export const uploadDocumentException = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  const onboardingCase = await prepareUpload(req, async (candidateCase) => {
    await assertCompanyAccess(req.user, candidateCase.company_id);
    await assertPermission(req.user, 'onboarding', 'edit');
    if (isCaseOwner(req.user, candidateCase)) {
      throw new AppError('Use My Onboarding to upload your own documents.', 400);
    }
    if (reason.length < MIN_EXCEPTION_REASON) {
      throw new AppError(
        `Explain why HR is uploading this document instead of the employee (at least ${MIN_EXCEPTION_REASON} characters).`,
        400
      );
    }
  });

  const result = await storeDocumentVersion(req, onboardingCase, {
    channel: onboardingCase.is_demo ? 'DEMO' : 'ADMIN_EXCEPTION',
    reason: reason.slice(0, 500)
  });

  res.status(201).json({
    success: true,
    message: `${result.item.label} uploaded on the employee's behalf. The reason and your name are recorded in its history.`,
    data: {
      submissionId: result.submissionId,
      versionId: result.versionId,
      versionNumber: result.versionNumber
    }
  });
});

// The employee removes a submitted document before it is reviewed. The file stays in the
// history (stamped withdrawn_at) and the checklist item returns to 'Not submitted'.
export const withdrawDocument = asyncHandler(async (req, res) => {
  const submissionId = Number(req.params.documentId);
  const [subs] = await pool.query(
    `SELECT ds.id, oci.id AS checklist_item_id, oci.label, oci.case_id,
            oc.employee_id AS case_employee_id, oc.company_id, oc.status, oc.is_demo
     FROM document_submissions ds
     INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     WHERE ds.id = ?
     LIMIT 1`,
    [submissionId]
  );
  if (!subs.length) {
    throw new AppError('Document submission not found.', 404);
  }

  const submission = subs[0];
  assertDemoVisible(submission);
  if (!isCaseOwner(req.user, { employee_id: submission.case_employee_id })) {
    throw new AppError('Only the employee can remove their own submitted document.', 403);
  }
  await assertPermission({ role: 'EMPLOYEE' }, 'onboarding', 'edit');
  assertCaseOpen(submission);

  const connection = await pool.getConnection();
  let versionNumber;
  try {
    await connection.beginTransaction();

    const [[locked]] = await connection.query(
      `SELECT oci.status AS item_status, dv.id AS version_id, dv.version_number
       FROM document_submissions ds
       INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
       INNER JOIN document_versions dv
         ON dv.submission_id = ds.id AND dv.version_number = ds.current_version
       WHERE ds.id = ?
       FOR UPDATE`,
      [submissionId]
    );
    if (!locked) {
      throw new AppError('Document version not found.', 404);
    }
    if (!OWNER_EDITABLE_STATUSES.includes(locked.item_status)) {
      throw new AppError(
        `${submission.label} can no longer be removed because it has already been reviewed or removed. Refresh to see the latest status.`,
        409
      );
    }
    versionNumber = locked.version_number;

    await connection.query(
      `UPDATE document_versions SET withdrawn_at = NOW() WHERE id = ?`,
      [locked.version_id]
    );
    await connection.query(
      `UPDATE document_submissions SET latest_status = 'WITHDRAWN' WHERE id = ?`,
      [submissionId]
    );
    await connection.query(
      `UPDATE onboarding_checklist_items SET status = 'PENDING' WHERE id = ?`,
      [submission.checklist_item_id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshCaseStatus(submission.case_id);

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'DOCUMENT_WITHDRAWN',
    entityType: 'document_submissions',
    entityId: submissionId,
    newValues: { caseId: submission.case_id, checklistItemId: submission.checklist_item_id, versionNumber },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `${submission.label} removed. It is kept in the document history; upload a new file when you are ready.`
  });
});

// The employee sends all uploaded (draft) documents to Admin / Super Admin for verification.
export const submitDocuments = asyncHandler(async (req, res) => {
  const onboardingCase = await getCaseOrThrow(Number(req.params.caseId));
  if (!isCaseOwner(req.user, onboardingCase)) {
    throw new AppError('Only the employee can submit their onboarding documents.', 403);
  }
  await assertPermission({ role: 'EMPLOYEE' }, 'onboarding', 'create');
  assertCaseOpen(onboardingCase);

  const connection = await pool.getConnection();
  let submitted;
  try {
    await connection.beginTransaction();

    const [items] = await connection.query(
      `SELECT id, label, requirement, status
       FROM onboarding_checklist_items
       WHERE case_id = ?
       ORDER BY sort_order
       FOR UPDATE`,
      [onboardingCase.id]
    );

    const missing = items.filter(
      (item) => item.requirement === 'REQUIRED' && MISSING_UPLOAD_STATUSES.includes(item.status)
    );
    if (missing.length) {
      throw new AppError(
        `Upload these required documents before submitting: ${missing.map((item) => item.label).join(', ')}.`,
        400,
        { missing: missing.map(({ id, label, status }) => ({ id, label, status })) }
      );
    }

    submitted = items.filter((item) => item.status === 'UPLOADED');
    if (!submitted.length) {
      throw new AppError('There are no new documents to submit. Upload or replace a document first.', 409);
    }

    const ids = submitted.map((item) => item.id);
    await connection.query(
      `UPDATE onboarding_checklist_items SET status = 'SUBMITTED' WHERE id IN (?)`,
      [ids]
    );
    await connection.query(
      `UPDATE document_submissions SET latest_status = 'SUBMITTED' WHERE checklist_item_id IN (?)`,
      [ids]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshCaseStatus(onboardingCase.id);

  const labels = submitted.map((item) => item.label).join(', ');
  if (!onboardingCase.is_demo) {
    await notifyRoleHolders({
      roles: DOCUMENT_VERIFIER_ROLES,
      actorId: req.user.id,
      companyId: onboardingCase.company_id,
      type: 'DOCUMENT_UPLOADED',
      title: 'Onboarding documents awaiting verification',
      message: `${onboardingCase.full_name} (${onboardingCase.emp_code}) submitted ${submitted.length} document${submitted.length === 1 ? '' : 's'} for verification: ${labels}.`,
      referenceType: 'ONBOARDING',
      referenceId: onboardingCase.id
    });
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'DOCUMENTS_SUBMITTED',
    entityType: 'onboarding_cases',
    entityId: onboardingCase.id,
    newValues: { checklistItemIds: submitted.map((item) => item.id) },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `${submitted.length} document${submitted.length === 1 ? '' : 's'} submitted. An Admin will verify ${submitted.length === 1 ? 'it' : 'them'} and let you know if anything needs to change.`,
    data: { submitted: submitted.length }
  });
});

const REVIEW_NOTIFICATIONS = {
  VERIFIED: (label) => ({
    type: 'DOCUMENT_VERIFIED',
    title: `Document verified: ${label}`,
    message: `${label} was reviewed and verified.`
  }),
  CORRECTION_REQUIRED: (label, comments) => ({
    type: 'DOCUMENT_CORRECTION_REQUIRED',
    title: `Correction needed: ${label}`,
    message: `${label} needs a correction: ${comments} Upload a corrected version in My Onboarding.`
  }),
  REJECTED: (label, comments) => ({
    type: 'DOCUMENT_REJECTED',
    title: `Document rejected: ${label}`,
    message: `${label} was rejected: ${comments} Upload a new document in My Onboarding.`
  })
};

export const reviewDocument = asyncHandler(async (req, res) => {
  const submissionId = Number(req.params.documentId);
  const decision = String(req.body.decision || '').toUpperCase();
  const comments = String(req.body.comments || '').trim() || null;
  const expectedVersionId = Number(req.body.versionId) || null;

  if (!REVIEW_NOTIFICATIONS[decision]) {
    throw new AppError('Decision must be VERIFIED, REJECTED or CORRECTION_REQUIRED.', 400);
  }
  if (decision !== 'VERIFIED' && (!comments || comments.length < MIN_REVIEW_COMMENT)) {
    throw new AppError(
      decision === 'REJECTED'
        ? 'Explain why the document is rejected so the employee knows what to upload.'
        : 'Explain what needs to be corrected so the employee can resubmit.',
      400
    );
  }
  if (comments && comments.length > 1000) {
    throw new AppError('Review comments must be 1000 characters or fewer.', 400);
  }

  const [subs] = await pool.query(
    `SELECT
       ds.id,
       oci.id AS checklist_item_id,
       oci.label,
       oci.case_id,
       oc.employee_id AS case_employee_id,
       oc.company_id,
       oc.status,
       oc.is_demo
     FROM document_submissions ds
     INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     WHERE ds.id = ?
     LIMIT 1`,
    [submissionId]
  );

  if (!subs.length) {
    throw new AppError('Document submission not found.', 404);
  }

  const submission = subs[0];
  assertDemoVisible(submission);
  await assertCompanyAccess(req.user, submission.company_id);
  assertCaseOpen(submission);
  if (Number(req.user.id) === Number(submission.case_employee_id)) {
    throw new AppError('You cannot review your own onboarding documents.', 403);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[locked]] = await connection.query(
      `SELECT ds.latest_status, dv.id AS version_id
       FROM document_submissions ds
       INNER JOIN document_versions dv
         ON dv.submission_id = ds.id AND dv.version_number = ds.current_version
       WHERE ds.id = ?
       FOR UPDATE`,
      [submissionId]
    );

    if (!locked) {
      throw new AppError('Document version not found.', 404);
    }
    if (locked.latest_status === 'WITHDRAWN') {
      throw new AppError('The employee removed this document. Refresh to see the latest status.', 409);
    }
    if (locked.latest_status === 'UPLOADED') {
      throw new AppError('The employee has not submitted this document for verification yet.', 409);
    }
    if (locked.latest_status !== 'SUBMITTED') {
      throw new AppError('This document has already been reviewed. Refresh to see the latest status.', 409);
    }
    if (expectedVersionId && expectedVersionId !== Number(locked.version_id)) {
      throw new AppError('The employee uploaded a newer version. Refresh and review the latest file.', 409);
    }

    await connection.query(
      `INSERT INTO document_reviews (submission_id, version_id, reviewer_id, decision, comments)
       VALUES (?, ?, ?, ?, ?)`,
      [submissionId, locked.version_id, req.user.id, decision, comments]
    );
    await connection.query(
      `UPDATE document_submissions SET latest_status = ? WHERE id = ?`,
      [decision, submissionId]
    );
    await connection.query(
      `UPDATE onboarding_checklist_items SET status = ? WHERE id = ?`,
      [decision, submission.checklist_item_id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const previousStatus = submission.status;
  const caseStatus = await refreshCaseStatus(submission.case_id);

  if (!submission.is_demo) {
    await createNotification({
      recipientId: submission.case_employee_id,
      actorId: req.user.id,
      ...REVIEW_NOTIFICATIONS[decision](submission.label, comments),
      referenceType: 'ONBOARDING',
      referenceId: submission.case_id
    });

    if (caseStatus === 'READY' && previousStatus !== 'READY') {
      await createNotification({
        recipientId: submission.case_employee_id,
        actorId: req.user.id,
        type: 'ONBOARDING_DOCUMENTS_COMPLETE',
        title: 'All required documents verified',
        message: 'Your required onboarding documents are complete. HR will activate your account shortly.',
        referenceType: 'ONBOARDING',
        referenceId: submission.case_id
      });
    }
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: `DOCUMENT_${decision}`,
    entityType: 'document_submissions',
    entityId: submissionId,
    newValues: { decision, comments, caseStatus },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: {
      VERIFIED: `${submission.label} verified.`,
      CORRECTION_REQUIRED: `Correction requested for ${submission.label}. The employee has been notified.`,
      REJECTED: `${submission.label} rejected. The employee has been notified.`
    }[decision],
    data: { caseStatus }
  });
});

export const markNotApplicable = asyncHandler(async (req, res) => {
  const itemId = Number(req.params.id);
  const [items] = await pool.query(
    `SELECT oci.*, oc.company_id, oc.employee_id, oc.id AS case_id, oc.status AS case_status, oc.is_demo
     FROM onboarding_checklist_items oci
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     WHERE oci.id = ?
     LIMIT 1`,
    [itemId]
  );

  if (!items.length) {
    throw new AppError('Checklist item not found.', 404);
  }

  const item = items[0];
  assertDemoVisible(item);
  assertCaseOpen({ status: item.case_status });

  const isOwner = Number(req.user.id) === Number(item.employee_id);
  const isManager = ONBOARDING_MANAGER_ROLES.includes(req.user.role);
  if (!isOwner && !isManager) {
    throw new AppError('Not allowed to mark Not Applicable.', 403);
  }
  if (isManager && !isOwner) {
    await assertCompanyAccess(req.user, item.company_id);
  }
  if (item.requirement === 'REQUIRED') {
    if (!DOCUMENT_VERIFIER_ROLES.includes(req.user.role) || isOwner) {
      throw new AppError('Only an Admin or Super Admin can mark a required document as Not Applicable.', 403);
    }
    await assertPermission(req.user, 'onboarding', 'approve');
  }
  if (['VERIFIED', 'NOT_APPLICABLE'].includes(item.status)) {
    throw new AppError(`${item.label} is already ${item.status === 'VERIFIED' ? 'verified' : 'not applicable'}.`, 409);
  }

  await pool.query(
    `UPDATE onboarding_checklist_items
     SET
       requirement = IF(? = 1, 'NOT_APPLICABLE', requirement),
       status = 'NOT_APPLICABLE'
     WHERE id = ?`,
    [isManager && !isOwner ? 1 : 0, itemId]
  );

  await refreshCaseStatus(item.case_id);

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'DOCUMENT_MARKED_NA',
    entityType: 'onboarding_checklist_items',
    entityId: itemId,
    newValues: { caseId: item.case_id, label: item.label, requirement: item.requirement },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `${item.label} marked Not Applicable.`
  });
});

export const downloadDocument = asyncHandler(async (req, res) => {
  const versionId = Number(req.params.versionId || req.params.documentId);
  const [rows] = await pool.query(
    `SELECT
       dv.*,
       oc.company_id,
       oc.employee_id,
       oc.is_demo,
       oci.label,
       e.full_name AS employee_name
     FROM document_versions dv
     INNER JOIN document_submissions ds ON ds.id = dv.submission_id
     INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     INNER JOIN employees e ON e.id = oc.employee_id
     WHERE dv.id = ?
     LIMIT 1`,
    [versionId]
  );

  if (!rows.length) {
    throw new AppError('Document not found.', 404);
  }

  const doc = rows[0];
  assertDemoVisible(doc);
  await assertCaseAccess(req.user, doc);

  res.set('Cache-Control', 'private, no-store');

  if (doc.is_demo && isVirtualPlaceholder(doc.storage_path)) {
    res.attachment(doc.original_name);
    res.type('application/pdf');
    return res.send(renderDemoPlaceholder({ label: doc.label, employeeName: doc.employee_name }));
  }

  const absolute = path.resolve(path.join(uploadsRoot, '..'), doc.storage_path);
  if (!absolute.startsWith(uploadsRoot) || !fs.existsSync(absolute)) {
    throw new AppError('Stored file is missing.', 404);
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'DOCUMENT_DOWNLOADED',
    entityType: 'document_versions',
    entityId: versionId,
    ipAddress: req.ip
  });

  res.type(doc.mime_type);
  res.download(absolute, doc.original_name);
});

export const getDocumentHistory = asyncHandler(async (req, res) => {
  const submissionId = Number(req.params.documentId);
  const [subs] = await pool.query(
    `SELECT ds.*, oc.company_id, oc.employee_id, oc.is_demo
     FROM document_submissions ds
     INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     WHERE ds.id = ?
     LIMIT 1`,
    [submissionId]
  );

  if (!subs.length) {
    throw new AppError('Submission not found.', 404);
  }
  assertDemoVisible(subs[0]);
  await assertCaseAccess(req.user, subs[0]);

  const [versions] = await pool.query(
    `SELECT
       dv.id, dv.version_number, dv.original_name, dv.mime_type, dv.file_size,
       dv.uploaded_at, dv.withdrawn_at, dv.uploaded_by, dv.upload_channel, dv.upload_reason,
       e.full_name AS uploaded_by_name
     FROM document_versions dv
     LEFT JOIN employees e ON e.id = dv.uploaded_by
     WHERE dv.submission_id = ?
     ORDER BY dv.version_number DESC`,
    [submissionId]
  );

  const [reviews] = await pool.query(
    `SELECT
       dr.id, dr.version_id, dr.decision, dr.comments, dr.created_at,
       dv.version_number,
       e.full_name AS reviewer_name
     FROM document_reviews dr
     INNER JOIN employees e ON e.id = dr.reviewer_id
     LEFT JOIN document_versions dv ON dv.id = dr.version_id
     WHERE dr.submission_id = ?
     ORDER BY dr.id DESC`,
    [submissionId]
  );

  res.json({
    success: true,
    data: { versions, reviews }
  });
});

export const activateEmployee = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await getCaseOrThrow(caseId);
  await assertCompanyAccess(req.user, onboardingCase.company_id);
  await assertPermission(req.user, 'onboarding', 'approve');
  if (isCaseOwner(req.user, onboardingCase)) {
    throw new AppError('You cannot activate your own account.', 403);
  }

  const connection = await pool.getConnection();
  let activatedAt;
  try {
    await connection.beginTransaction();

    const [[locked]] = await connection.query(
      `SELECT status FROM onboarding_cases WHERE id = ? FOR UPDATE`,
      [caseId]
    );
    if (locked.status === 'ACTIVATED') {
      throw new AppError('This employee has already been activated.', 409);
    }
    if (locked.status === 'CANCELLED') {
      throw new AppError('This onboarding case was cancelled and cannot be activated.', 409);
    }

    const [blockers] = await connection.query(
      `SELECT id, document_type, label, requirement, status
       FROM onboarding_checklist_items
       WHERE case_id = ?
         AND requirement = 'REQUIRED'
         AND status NOT IN ('VERIFIED', 'NOT_APPLICABLE')
       ORDER BY sort_order
       FOR UPDATE`,
      [caseId]
    );
    const bankBlocker = await getBankBlocker(caseId, connection);
    if (bankBlocker) blockers.push(bankBlocker);
    if (blockers.length) {
      throw new AppError(
        `Cannot activate employee. Incomplete onboarding requirements: ${blockers.map((b) => b.label).join(', ')}`,
        400,
        { blockers }
      );
    }

    // Demo employees stay INACTIVE so they never reach logins, payroll or attendance.
    await connection.query(
      `UPDATE employees
       SET status = IF(is_demo = 1, status, 'ACTIVE'), onboarding_status = 'COMPLETED'
       WHERE id = ?`,
      [onboardingCase.employee_id]
    );
    await connection.query(
      `UPDATE onboarding_cases
       SET status = 'ACTIVATED', activated_by = ?, activated_at = NOW()
       WHERE id = ?`,
      [req.user.id, caseId]
    );
    const [[stamp]] = await connection.query(
      `SELECT activated_at FROM onboarding_cases WHERE id = ?`,
      [caseId]
    );
    activatedAt = stamp.activated_at;

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (!onboardingCase.is_demo) {
    await createNotification({
      recipientId: onboardingCase.employee_id,
      actorId: req.user.id,
      type: 'EMPLOYEE_ACTIVATED',
      title: 'Your account is active',
      message: 'Your onboarding is complete and your employee account is now active. Sign in again to use the full Employee Portal.',
      referenceType: 'ONBOARDING',
      referenceId: caseId
    });
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: onboardingCase.is_demo ? 'DEMO_EMPLOYEE_ACTIVATED' : 'EMPLOYEE_ACTIVATED',
    entityType: 'onboarding_cases',
    entityId: caseId,
    newValues: { employeeId: onboardingCase.employee_id, activatedAt },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: onboardingCase.is_demo
      ? 'DEMO case activated. Demo employees are never given a live login.'
      : `${onboardingCase.full_name} (${onboardingCase.emp_code}) is now an active employee.`,
    data: { activatedAt, activatedBy: req.user.id }
  });
});

export const getActivationStatus = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const [emps] = await pool.query(
    `SELECT id, company_id, full_name, status, onboarding_status, is_demo
     FROM employees WHERE id = ? LIMIT 1`,
    [employeeId]
  );

  if (!emps.length || (emps[0].is_demo && !env.demoMode)) {
    throw new AppError('Employee not found.', 404);
  }

  await assertCompanyAccess(req.user, emps[0].company_id);
  const gate = await canActivateEmployee(employeeId);

  res.json({
    success: true,
    data: {
      employee: emps[0],
      ...gate
    }
  });
});

// The document checklist every new onboarding case starts with.
export const getChecklistTemplate = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: DEFAULT_CHECKLIST.map(({ document_type, label, requirement, sort_order }) => ({
      document_type,
      label,
      requirement,
      sort_order
    }))
  });
});

export const getDemoStatus = asyncHandler(async (req, res) => {
  const companyIds = req.user.role === 'SUPER_ADMIN' ? null : await getCompanyIdsForUser(req.user);
  res.json({ success: true, data: await getDemoSummary(companyIds) });
});

export const seedDemoCases = asyncHandler(async (req, res) => {
  const companyId = await resolveOnboardingCompanyId(req.user, req.body.companyId);
  if (!companyId) {
    throw new AppError('No company is available in your access scope for demo cases.', 403);
  }

  const result = await seedDemoOnboarding({ actorId: req.user.id, companyId });

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'DEMO_ONBOARDING_SEEDED',
    entityType: 'onboarding_cases',
    entityId: result.caseIds.join(','),
    newValues: { companyId, liveCandidateId: result.liveCandidate?.id || null },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: result.liveCandidate
      ? `Created ${result.caseIds.length} DEMO onboarding cases and DEMO candidate ${result.liveCandidate.fullName} (Offered) in Recruitment.`
      : `Created ${result.caseIds.length} DEMO onboarding cases.`,
    data: result
  });
});

export const clearDemoCases = asyncHandler(async (req, res) => {
  const removed = await clearDemoOnboarding();

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'DEMO_ONBOARDING_CLEARED',
    entityType: 'onboarding_cases',
    entityId: null,
    newValues: removed,
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `Removed ${removed.cases} DEMO cases and ${removed.candidates} DEMO candidates.`,
    data: removed
  });
});
