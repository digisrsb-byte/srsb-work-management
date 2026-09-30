import path from 'path';
import fs from 'fs';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { assertCompanyAccess, assertPermission } from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';
import { createNotification, notifyRoleHolders } from '../services/notificationService.js';
import { refreshCaseStatus } from '../services/activationService.js';
import {
  fileMatchesDeclaredType,
  persistUpload,
  removeUploadedFile,
  uploadsRoot
} from '../middleware/upload.js';
import {
  EncryptionConfigError,
  decryptField,
  encryptField,
  getKeyring
} from '../services/fieldEncryption.js';
import { maskLastFour } from '../utils/maskSensitive.js';
import {
  EDITABLE_STATUSES,
  accountLastFour,
  accountNumberHash,
  accountNumberMatches,
  displayStatus,
  employeeAccountContext,
  missingForSubmit,
  onboardingAccountContext,
  validateBankInput
} from '../services/bankDetailsRules.js';

/*
 * Bank details collected during onboarding. The employee saves a draft and submits it with a
 * proof document; an Admin or Super Admin verifies it. Only verification writes the details to
 * employee_bank_details, which is the record payroll reads.
 *
 * Full account numbers are never returned by any endpoint, written to logs or audit entries,
 * or included in error messages. They are stored encrypted with the last four digits kept for
 * display and a keyed hash used to confirm the number during verification.
 */

const REVIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
const VERIFIER_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const MIN_REVIEW_COMMENT = 5;

async function loadCase(caseId) {
  const [rows] = await pool.query(
    `SELECT oc.id, oc.employee_id, oc.company_id, oc.status, oc.is_demo,
            e.full_name, e.employee_id AS emp_code
     FROM onboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     WHERE oc.id = ?
     LIMIT 1`,
    [caseId]
  );
  const row = rows[0];
  if (!row || (row.is_demo && !env.demoMode)) {
    throw new AppError('Onboarding case not found.', 404);
  }
  return row;
}

function isOwner(user, onboardingCase) {
  return Number(user.id) === Number(onboardingCase.employee_id);
}

function isOpen(onboardingCase) {
  return !['ACTIVATED', 'CANCELLED'].includes(onboardingCase.status);
}

async function assertCaseAccess(user, onboardingCase) {
  if (isOwner(user, onboardingCase)) return;
  if (!REVIEWER_ROLES.includes(user.role)) {
    throw new AppError('You cannot access this onboarding case.', 403);
  }
  await assertCompanyAccess(user, onboardingCase.company_id);
}

function assertCaseOpen(onboardingCase) {
  if (!isOpen(onboardingCase)) {
    throw new AppError(
      `This onboarding case is ${onboardingCase.status.toLowerCase()} and its bank details can no longer be changed.`,
      409
    );
  }
}

async function assertOwnerCanEdit(user, onboardingCase) {
  if (!isOwner(user, onboardingCase)) {
    throw new AppError('Only the employee can enter or submit their own bank details.', 403);
  }
  // The owner acts as a new joiner, whatever role their account will hold once activated.
  await assertPermission({ role: 'EMPLOYEE' }, 'onboarding', 'create');
  assertCaseOpen(onboardingCase);
}

function keyringOrThrow() {
  try {
    return getKeyring();
  } catch (error) {
    if (error instanceof EncryptionConfigError) {
      console.error('[bank-details] secure storage is not configured');
      throw new AppError(
        'Bank details cannot be saved right now because secure storage is not configured. Please contact HR.',
        503
      );
    }
    throw error;
  }
}

// Database and crypto errors can carry SQL text or values; replace them with a plain message.
function sanitizeError(error, message) {
  if (error instanceof AppError) return error;
  console.error(`[bank-details] ${error?.name || 'Error'} ${error?.code || ''}`.trim());
  return new AppError(message, 500);
}

async function loadBankRow(caseId, executor = pool) {
  const [rows] = await executor.query(
    `SELECT
       obd.*,
       p.original_name AS proof_original_name,
       p.mime_type AS proof_mime_type,
       p.file_size AS proof_file_size,
       p.uploaded_at AS proof_uploaded_at,
       reviewer.full_name AS reviewer_name
     FROM onboarding_bank_details obd
     LEFT JOIN onboarding_bank_proofs p ON p.id = obd.proof_id
     LEFT JOIN employees reviewer ON reviewer.id = obd.reviewed_by
     WHERE obd.case_id = ?
     LIMIT 1`,
    [caseId]
  );
  return rows[0] || null;
}

async function loadLastReview(bankDetailId) {
  if (!bankDetailId) return null;
  const [rows] = await pool.query(
    `SELECT r.decision, r.comments, r.created_at, r.revision, e.full_name AS reviewer_name
     FROM onboarding_bank_reviews r
     INNER JOIN employees e ON e.id = r.reviewer_id
     WHERE r.bank_detail_id = ?
     ORDER BY r.id DESC
     LIMIT 1`,
    [bankDetailId]
  );
  return rows[0] || null;
}

function serializeBank(row, lastReview) {
  return {
    status: displayStatus(row, lastReview?.decision),
    rowStatus: row?.status || null,
    hasUnsubmittedChanges: row?.status === 'DRAFT',
    accountHolderName: row?.account_holder_name || '',
    bankName: row?.bank_name || '',
    accountType: row?.account_type || '',
    ifscCode: row?.ifsc_code || '',
    branchName: row?.branch_name || '',
    accountNumberMasked: maskLastFour(row?.account_number_last4),
    hasAccountNumber: Boolean(row?.account_number_enc),
    proof: row?.proof_id
      ? {
          id: row.proof_id,
          originalName: row.proof_original_name,
          mimeType: row.proof_mime_type,
          fileSize: row.proof_file_size,
          uploadedAt: row.proof_uploaded_at
        }
      : null,
    revision: row?.revision || 0,
    submittedAt: row?.submitted_at || null,
    reviewedAt: row?.reviewed_at || null,
    reviewerName: row?.reviewer_name || null,
    updatedAt: row?.updated_at || null,
    lastReview: lastReview
      ? {
          decision: lastReview.decision,
          comments: lastReview.comments,
          createdAt: lastReview.created_at,
          reviewerName: lastReview.reviewer_name,
          revision: lastReview.revision
        }
      : null,
    missing: missingForSubmit(row)
  };
}

// Masked bank-details summary plus what the signed-in user may do with it.
export async function getBankSummary(onboardingCase, user) {
  const row = await loadBankRow(onboardingCase.id);
  const summary = serializeBank(row, await loadLastReview(row?.id));
  const owner = isOwner(user, onboardingCase);
  const open = isOpen(onboardingCase);
  return {
    ...summary,
    permissions: {
      canEdit: owner && open && (!row || EDITABLE_STATUSES.includes(row.status)),
      canSubmit: owner && open && row?.status === 'DRAFT' && summary.missing.length === 0,
      canReview:
        VERIFIER_ROLES.includes(user.role) && !owner && open && row?.status === 'PENDING_VERIFICATION'
    }
  };
}

export const getBankDetails = asyncHandler(async (req, res) => {
  const onboardingCase = await loadCase(Number(req.params.caseId));
  await assertCaseAccess(req.user, onboardingCase);
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await getBankSummary(onboardingCase, req.user) });
});

// Save Draft: blank text fields are cleared; a blank account number keeps the stored one.
export const saveBankDraft = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await loadCase(caseId);
  await assertOwnerCanEdit(req.user, onboardingCase);

  const { values, accountNumber, errors } = validateBankInput(req.body);
  if (req.file && !fileMatchesDeclaredType(req.file)) {
    errors.proof =
      'The file is damaged or its content does not match its type. Upload a complete PDF, JPG, PNG, WEBP or Word document.';
  }
  if (Object.keys(errors).length) {
    throw new AppError('Please correct the highlighted bank details.', 422, { fields: errors });
  }
  const keyring = accountNumber ? keyringOrThrow() : null;

  const connection = await pool.getConnection();
  let bankId;
  let revision;
  let proofId = null;
  let wasPending = false;
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      `SELECT * FROM onboarding_bank_details WHERE case_id = ? FOR UPDATE`,
      [caseId]
    );
    const existing = existingRows[0];
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
      throw new AppError(
        'Your bank details are already verified and can no longer be changed here. Contact HR if they need to change.',
        409
      );
    }
    wasPending = existing?.status === 'PENDING_VERIFICATION';

    const fields = {
      account_holder_name: values.accountHolderName || null,
      bank_name: values.bankName || null,
      account_type: values.accountType || null,
      ifsc_code: values.ifscCode || null,
      branch_name: values.branchName || null,
      status: 'DRAFT',
      submitted_at: null,
      updated_by: req.user.id,
      ...(accountNumber
        ? {
            account_number_enc: encryptField(accountNumber, {
              context: onboardingAccountContext(caseId),
              keyring
            }),
            account_number_last4: accountLastFour(accountNumber),
            account_number_hash: accountNumberHash(accountNumber, keyring)
          }
        : {})
    };

    if (existing) {
      revision = Number(existing.revision) + 1;
      bankId = existing.id;
      await connection.query(`UPDATE onboarding_bank_details SET ? WHERE id = ?`, [
        { ...fields, revision },
        bankId
      ]);
    } else {
      revision = 1;
      const [result] = await connection.query(`INSERT INTO onboarding_bank_details SET ?`, [
        { ...fields, case_id: caseId, employee_id: onboardingCase.employee_id, revision }
      ]);
      bankId = result.insertId;
    }

    if (req.file) {
      persistUpload(req.file);
      const [proof] = await connection.query(`INSERT INTO onboarding_bank_proofs SET ?`, [
        {
          bank_detail_id: bankId,
          original_name: req.file.originalname.slice(0, 255),
          stored_name: req.file.filename,
          mime_type: req.file.mimetype,
          file_size: req.file.size,
          storage_path: `onboarding/${path.basename(req.file.path)}`,
          uploaded_by: req.user.id
        }
      ]);
      proofId = proof.insertId;
      await connection.query(`UPDATE onboarding_bank_details SET proof_id = ? WHERE id = ?`, [proofId, bankId]);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    removeUploadedFile(req.file);
    throw sanitizeError(error, 'Your bank details could not be saved. Please try again.');
  } finally {
    connection.release();
  }

  await refreshCaseStatus(caseId);
  await writeAuditLog({
    employeeId: req.user.id,
    action: 'BANK_DETAILS_SAVED',
    entityType: 'onboarding_bank_details',
    entityId: bankId,
    newValues: {
      caseId,
      revision,
      accountNumberChanged: Boolean(accountNumber),
      accountLast4: accountNumber ? accountLastFour(accountNumber) : undefined,
      proofUploaded: Boolean(proofId),
      withdrewPendingSubmission: wasPending
    },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: wasPending
      ? 'Changes saved. Your earlier submission was withdrawn; press "Submit for verification" to send the updated details.'
      : 'Bank details saved as a draft. Press "Submit for verification" when they are complete.',
    data: await getBankSummary(onboardingCase, req.user)
  });
});

export const submitBankDetails = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await loadCase(caseId);
  await assertOwnerCanEdit(req.user, onboardingCase);

  const connection = await pool.getConnection();
  let row;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM onboarding_bank_details WHERE case_id = ? FOR UPDATE`,
      [caseId]
    );
    row = rows[0];
    if (!row) {
      throw new AppError('Save your bank details first, then submit them for verification.', 400);
    }
    if (row.status === 'PENDING_VERIFICATION') {
      throw new AppError('Your bank details are already submitted and waiting for verification.', 409);
    }
    if (row.status === 'VERIFIED') {
      throw new AppError('Your bank details are already verified.', 409);
    }
    if (row.status !== 'DRAFT') {
      throw new AppError('Update your bank details as requested and save them, then submit again.', 409);
    }
    const missing = missingForSubmit(row);
    if (missing.length) {
      throw new AppError(`Complete these before submitting: ${missing.join(', ')}.`, 400, { missing });
    }
    await connection.query(
      `UPDATE onboarding_bank_details SET status = 'PENDING_VERIFICATION', submitted_at = NOW() WHERE id = ?`,
      [row.id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw sanitizeError(error, 'Your bank details could not be submitted. Please try again.');
  } finally {
    connection.release();
  }

  await refreshCaseStatus(caseId);
  if (!onboardingCase.is_demo) {
    await notifyRoleHolders({
      roles: VERIFIER_ROLES,
      actorId: req.user.id,
      companyId: onboardingCase.company_id,
      type: 'BANK_DETAILS_SUBMITTED',
      title: 'Bank details awaiting verification',
      message: `${onboardingCase.full_name} (${onboardingCase.emp_code}) submitted bank details for verification.`,
      referenceType: 'ONBOARDING',
      referenceId: caseId
    });
  }
  await writeAuditLog({
    employeeId: req.user.id,
    action: 'BANK_DETAILS_SUBMITTED',
    entityType: 'onboarding_bank_details',
    entityId: row.id,
    newValues: { caseId, revision: row.revision },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: 'Bank details submitted. An Admin will verify them and let you know if anything needs to change.',
    data: await getBankSummary(onboardingCase, req.user)
  });
});

const REVIEW_NOTIFICATIONS = {
  VERIFIED: () => ({
    type: 'BANK_DETAILS_VERIFIED',
    title: 'Bank details verified',
    message: 'Your bank details were verified and will be used for salary payments.'
  }),
  CORRECTION_REQUIRED: (comments) => ({
    type: 'BANK_DETAILS_CORRECTION_REQUIRED',
    title: 'Correction needed: bank details',
    message: `Your bank details need a correction: ${comments} Update them in My Onboarding and submit again.`
  })
};

export const reviewBankDetails = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const decision = String(req.body.decision || '').toUpperCase();
  const comments = String(req.body.comments || '').trim() || null;
  const expectedRevision = Number(req.body.revision) || null;

  if (!REVIEW_NOTIFICATIONS[decision]) {
    throw new AppError('Decision must be VERIFIED or CORRECTION_REQUIRED.', 400);
  }
  if (decision === 'CORRECTION_REQUIRED' && (!comments || comments.length < MIN_REVIEW_COMMENT)) {
    throw new AppError('Explain what the employee needs to correct.', 400, {
      fields: { comments: 'A reason of at least 5 characters is required.' }
    });
  }
  if (comments && comments.length > 1000) {
    throw new AppError('Review comments must be 1000 characters or fewer.', 400);
  }

  const onboardingCase = await loadCase(caseId);
  await assertCompanyAccess(req.user, onboardingCase.company_id);
  assertCaseOpen(onboardingCase);
  if (isOwner(req.user, onboardingCase)) {
    throw new AppError('You cannot verify your own bank details.', 403);
  }
  const keyring = decision === 'VERIFIED' ? keyringOrThrow() : null;

  const connection = await pool.getConnection();
  let row;
  let accountCheckFailed = false;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM onboarding_bank_details WHERE case_id = ? FOR UPDATE`,
      [caseId]
    );
    row = rows[0];
    if (!row) {
      throw new AppError('The employee has not entered bank details yet.', 404);
    }
    if (row.status === 'DRAFT') {
      throw new AppError('The employee changed their bank details and has not resubmitted them yet.', 409);
    }
    if (row.status !== 'PENDING_VERIFICATION') {
      throw new AppError('These bank details have already been reviewed. Refresh to see the latest status.', 409);
    }
    if (expectedRevision && expectedRevision !== Number(row.revision)) {
      throw new AppError('The employee updated their bank details. Refresh and review the latest version.', 409);
    }

    if (decision === 'VERIFIED') {
      if (!accountNumberMatches(req.body.accountNumberCheck, row.account_number_hash, keyring)) {
        accountCheckFailed = true;
        throw new AppError(
          "The account number you entered does not match the employee's submission. Check it against the proof, or request a correction.",
          422,
          { fields: { accountNumberCheck: 'Does not match the submitted account number.' } }
        );
      }
      const accountNumber = decryptField(row.account_number_enc, {
        context: onboardingAccountContext(caseId),
        keyring
      });
      await connection.query(
        `INSERT INTO employee_bank_details (
           employee_id, account_holder_name, bank_name, account_number, account_type,
           account_number_last4, account_number_enc, account_number_hash, ifsc_code, branch_name,
           source, onboarding_bank_detail_id, verified_by, verified_at
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'ONBOARDING', ?, ?, NOW()) AS incoming
         ON DUPLICATE KEY UPDATE
           account_holder_name = incoming.account_holder_name,
           bank_name = incoming.bank_name,
           account_number = NULL,
           account_type = incoming.account_type,
           account_number_last4 = incoming.account_number_last4,
           account_number_enc = incoming.account_number_enc,
           account_number_hash = incoming.account_number_hash,
           ifsc_code = incoming.ifsc_code,
           branch_name = incoming.branch_name,
           source = 'ONBOARDING',
           onboarding_bank_detail_id = incoming.onboarding_bank_detail_id,
           verified_by = incoming.verified_by,
           verified_at = incoming.verified_at`,
        [
          row.employee_id,
          row.account_holder_name,
          row.bank_name,
          row.account_type,
          row.account_number_last4,
          encryptField(accountNumber, { context: employeeAccountContext(row.employee_id), keyring }),
          row.account_number_hash,
          row.ifsc_code,
          row.branch_name,
          row.id,
          req.user.id
        ]
      );
    }

    await connection.query(`INSERT INTO onboarding_bank_reviews SET ?`, [
      {
        bank_detail_id: row.id,
        revision: row.revision,
        proof_id: row.proof_id,
        reviewer_id: req.user.id,
        decision,
        comments,
        account_number_last4: row.account_number_last4
      }
    ]);
    await connection.query(
      `UPDATE onboarding_bank_details SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [decision, req.user.id, row.id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (accountCheckFailed) {
      await writeAuditLog({
        employeeId: req.user.id,
        action: 'BANK_ACCOUNT_CHECK_FAILED',
        entityType: 'onboarding_bank_details',
        entityId: row.id,
        newValues: { caseId, revision: row.revision },
        ipAddress: req.ip
      });
    }
    throw sanitizeError(error, 'The bank details could not be reviewed. Please try again.');
  } finally {
    connection.release();
  }

  const caseStatus = await refreshCaseStatus(caseId);
  if (!onboardingCase.is_demo) {
    await createNotification({
      recipientId: onboardingCase.employee_id,
      actorId: req.user.id,
      ...REVIEW_NOTIFICATIONS[decision](comments),
      referenceType: 'ONBOARDING',
      referenceId: caseId
    });
    if (caseStatus === 'READY' && onboardingCase.status !== 'READY') {
      await createNotification({
        recipientId: onboardingCase.employee_id,
        actorId: req.user.id,
        type: 'ONBOARDING_DOCUMENTS_COMPLETE',
        title: 'Onboarding requirements complete',
        message: 'Your required documents and bank details are verified. HR will activate your account shortly.',
        referenceType: 'ONBOARDING',
        referenceId: caseId
      });
    }
  }
  await writeAuditLog({
    employeeId: req.user.id,
    action: `BANK_DETAILS_${decision}`,
    entityType: 'onboarding_bank_details',
    entityId: row.id,
    newValues: { caseId, revision: row.revision, accountLast4: row.account_number_last4, comments, caseStatus },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message:
      decision === 'VERIFIED'
        ? 'Bank details verified. Payroll will use them for this employee.'
        : 'Correction requested. The employee has been notified.',
    data: { caseStatus, bank: await getBankSummary(onboardingCase, req.user) }
  });
});

export const downloadBankProof = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await loadCase(caseId);
  await assertCaseAccess(req.user, onboardingCase);

  const [rows] = await pool.query(
    `SELECT p.*
     FROM onboarding_bank_proofs p
     INNER JOIN onboarding_bank_details obd ON obd.id = p.bank_detail_id
     WHERE p.id = ? AND obd.case_id = ?
     LIMIT 1`,
    [Number(req.params.proofId), caseId]
  );
  const proof = rows[0];
  if (!proof) throw new AppError('Bank proof not found.', 404);

  const absolute = path.resolve(path.join(uploadsRoot, '..'), proof.storage_path);
  if (!absolute.startsWith(uploadsRoot) || !fs.existsSync(absolute)) {
    throw new AppError('Stored file is missing.', 404);
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'BANK_PROOF_DOWNLOADED',
    entityType: 'onboarding_bank_proofs',
    entityId: proof.id,
    newValues: { caseId },
    ipAddress: req.ip
  });

  res.set('Cache-Control', 'private, no-store');
  res.type(proof.mime_type);
  res.download(absolute, proof.original_name);
});

export const getBankHistory = asyncHandler(async (req, res) => {
  const caseId = Number(req.params.caseId);
  const onboardingCase = await loadCase(caseId);
  await assertCaseAccess(req.user, onboardingCase);

  const row = await loadBankRow(caseId);
  if (!row) return res.json({ success: true, data: { proofs: [], reviews: [] } });

  const [proofs] = await pool.query(
    `SELECT p.id, p.original_name, p.mime_type, p.file_size, p.uploaded_at, e.full_name AS uploaded_by_name
     FROM onboarding_bank_proofs p
     LEFT JOIN employees e ON e.id = p.uploaded_by
     WHERE p.bank_detail_id = ?
     ORDER BY p.id DESC`,
    [row.id]
  );
  const [reviews] = await pool.query(
    `SELECT r.id, r.revision, r.decision, r.comments, r.created_at, r.account_number_last4, e.full_name AS reviewer_name
     FROM onboarding_bank_reviews r
     INNER JOIN employees e ON e.id = r.reviewer_id
     WHERE r.bank_detail_id = ?
     ORDER BY r.id DESC`,
    [row.id]
  );

  res.set('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    data: {
      proofs,
      reviews: reviews.map(({ account_number_last4, ...review }) => ({
        ...review,
        account_number_masked: maskLastFour(account_number_last4)
      }))
    }
  });
});
