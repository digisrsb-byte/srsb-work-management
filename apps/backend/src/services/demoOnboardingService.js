import fs from 'fs';
import path from 'path';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { uploadsRoot } from '../middleware/upload.js';
import { refreshCaseStatus } from './activationService.js';
import { createOnboardingCase } from './employeeOnboardingService.js';

const DEMO_EMAIL_DOMAIN = 'demo.example.invalid';

// Fictional people only. Emails use the reserved .invalid TLD so nothing can be delivered.
const DEMO_SCENARIOS = [
  {
    key: 'in-progress',
    fullName: 'Aarav Menon',
    designation: 'Recruitment Associate',
    joinedDaysAgo: 2,
    documents: {
      PAN: 'VERIFIED',
      AADHAAR: 'SUBMITTED',
      PHOTOGRAPH: 'VERIFIED',
      OFFER_LETTER: 'SUBMITTED',
      JOINING_LETTER: { status: 'CORRECTION_REQUIRED', comment: 'DEMO: signature missing on page 2.' }
    }
  },
  {
    key: 'ready',
    fullName: 'Diya Kulkarni',
    designation: 'HR Executive',
    joinedDaysAgo: 5,
    documents: {
      PAN: 'VERIFIED',
      AADHAAR: 'VERIFIED',
      PHOTOGRAPH: 'VERIFIED',
      OFFER_LETTER: 'VERIFIED',
      JOINING_LETTER: 'VERIFIED',
      EDUCATION_CERTIFICATE: 'NOT_APPLICABLE',
      BANK_STATEMENT: 'VERIFIED'
    }
  },
  {
    key: 'pending',
    fullName: 'Kabir Shah',
    designation: 'Operations Trainee',
    joinedDaysAgo: 0,
    documents: {}
  }
];

const LIVE_CANDIDATE = { fullName: 'Meera Iyer', stage: 'OFFERED' };

export function assertDemoEnabled() {
  if (!env.demoMode) {
    throw new AppError(
      'Demo mode is disabled. Set DEMO_MODE=true in a non-production environment to use demo onboarding cases.',
      403
    );
  }
}

function demoEmail(fullName) {
  return `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@${DEMO_EMAIL_DOMAIN}`;
}

function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function pdfEscape(text) {
  return String(text).replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/[^\x20-\x7E]/g, '-');
}

// Minimal one-page PDF that states it is a placeholder, so no real identity document is ever stored.
export function buildPlaceholderPdf(lines) {
  const content = lines
    .map((line, index) => `BT /F1 ${index === 0 ? 22 : 13} Tf 60 ${720 - index * 30} Td (${pdfEscape(line)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// Seeded demo documents are not written to disk; the download endpoint renders them on request.
export const DEMO_PLACEHOLDER_PATH = 'demo-placeholder:';

export function isVirtualPlaceholder(storagePath) {
  return String(storagePath || '').startsWith(DEMO_PLACEHOLDER_PATH);
}

export function renderDemoPlaceholder({ label, employeeName }) {
  return buildPlaceholderPdf([
    'DEMO PLACEHOLDER DOCUMENT',
    `Document: ${label}`,
    `Fictional employee: ${employeeName}`,
    'This is not a real identity or personal document.',
    'Generated for SRSB HRMS product demos only.'
  ]);
}

async function attachPlaceholder(connection, { item, employeeName, employeeId, actorId }) {
  const buffer = renderDemoPlaceholder({ label: item.label, employeeName });
  const originalName = `DEMO-${item.document_type.toLowerCase()}-placeholder.pdf`;

  const [subResult] = await connection.query(
    `INSERT INTO document_submissions (checklist_item_id, employee_id, current_version, latest_status)
     VALUES (?, ?, 1, 'SUBMITTED')`,
    [item.id, employeeId]
  );
  const [verResult] = await connection.query(
    `INSERT INTO document_versions (
       submission_id, version_number, original_name, stored_name, mime_type, file_size, storage_path,
       uploaded_by, upload_channel, upload_reason
     ) VALUES (?, 1, ?, ?, 'application/pdf', ?, ?, ?, 'DEMO', 'DEMO placeholder for a fictional employee')`,
    [
      subResult.insertId,
      originalName,
      originalName,
      buffer.length,
      `${DEMO_PLACEHOLDER_PATH}${item.document_type}`,
      actorId
    ]
  );
  return { submissionId: subResult.insertId, versionId: verResult.insertId };
}

async function applyDocumentState(connection, { item, state, employeeName, employeeId, actorId }) {
  const { status, comment } = typeof state === 'string' ? { status: state } : state;

  if (status === 'NOT_APPLICABLE') {
    await connection.query(
      `UPDATE onboarding_checklist_items SET requirement = 'NOT_APPLICABLE', status = 'NOT_APPLICABLE' WHERE id = ?`,
      [item.id]
    );
    return;
  }

  const { submissionId, versionId } = await attachPlaceholder(connection, {
    item, employeeName, employeeId, actorId
  });

  if (status !== 'SUBMITTED') {
    await connection.query(
      `INSERT INTO document_reviews (submission_id, version_id, reviewer_id, decision, comments)
       VALUES (?, ?, ?, ?, ?)`,
      [submissionId, versionId, actorId, status, comment || 'DEMO review']
    );
    await connection.query(
      `UPDATE document_submissions SET latest_status = ? WHERE id = ?`,
      [status, submissionId]
    );
  }
  await connection.query(
    `UPDATE onboarding_checklist_items SET status = ? WHERE id = ?`,
    [status, item.id]
  );
}

async function insertDemoCandidate(connection, { fullName, actorId }) {
  const [result] = await connection.query(
    `INSERT INTO candidates (full_name, email, current_location, skills, created_by, is_demo)
     VALUES (?, ?, 'Bengaluru', 'DEMO candidate - fictional profile', ?, 1)`,
    [fullName, demoEmail(fullName), actorId]
  );
  return { id: result.insertId, full_name: fullName, email: demoEmail(fullName), phone: null, is_demo: 1 };
}

export async function getDemoSummary(companyIds) {
  const scoped = companyIds === null ? '' : ' AND company_id IN (?)';
  const params = companyIds === null ? [] : [companyIds.length ? companyIds : [0]];
  const [[cases]] = await pool.query(
    `SELECT COUNT(*) AS n FROM onboarding_cases WHERE is_demo = 1${scoped}`,
    params
  );
  const [[candidates]] = await pool.query(`SELECT COUNT(*) AS n FROM candidates WHERE is_demo = 1`);
  return { enabled: env.demoMode, demoCases: cases.n, demoCandidates: candidates.n };
}

export async function seedDemoOnboarding({ actorId, companyId }) {
  assertDemoEnabled();

  const [existing] = await pool.query(
    `SELECT COUNT(*) AS n FROM onboarding_cases WHERE is_demo = 1 AND company_id = ?`,
    [companyId]
  );
  if (existing[0].n > 0) {
    throw new AppError('Demo cases already exist for this company. Remove demo data first to recreate them.', 409);
  }

  const connection = await pool.getConnection();
  const createdCaseIds = [];
  let liveCandidate = null;
  try {
    await connection.beginTransaction();

    for (const scenario of DEMO_SCENARIOS) {
      const candidate = await insertDemoCandidate(connection, { fullName: scenario.fullName, actorId });
      const result = await createOnboardingCase(connection, {
        candidate,
        companyId,
        actorId,
        joiningDate: daysAgo(scenario.joinedDaysAgo),
        designation: scenario.designation
      });

      const [items] = await connection.query(
        `SELECT * FROM onboarding_checklist_items WHERE case_id = ? ORDER BY sort_order`,
        [result.caseId]
      );
      for (const item of items) {
        const state = scenario.documents[item.document_type];
        if (state) {
          await applyDocumentState(connection, {
            item, state, employeeName: scenario.fullName, employeeId: result.employeeId, actorId
          });
        }
      }
      createdCaseIds.push(result.caseId);
    }

    const [openings] = await connection.query(
      `SELECT id FROM job_openings WHERE status <> 'CLOSED' ORDER BY id LIMIT 1`
    );
    if (openings.length) {
      const candidate = await insertDemoCandidate(connection, { fullName: LIVE_CANDIDATE.fullName, actorId });
      await connection.query(
        `INSERT INTO candidate_applications (candidate_id, opening_id, stage, assigned_recruiter_id)
         VALUES (?, ?, ?, ?)`,
        [candidate.id, openings[0].id, LIVE_CANDIDATE.stage, actorId]
      );
      liveCandidate = { id: candidate.id, fullName: candidate.full_name, stage: LIVE_CANDIDATE.stage };
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  for (const caseId of createdCaseIds) {
    await refreshCaseStatus(caseId);
  }

  return { caseIds: createdCaseIds, liveCandidate };
}

// Removes every demo record (and its placeholder files). Only rows flagged is_demo are touched.
export async function clearDemoOnboarding() {
  const [files] = await pool.query(
    `SELECT dv.storage_path
     FROM document_versions dv
     INNER JOIN document_submissions ds ON ds.id = dv.submission_id
     INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     WHERE oc.is_demo = 1
     UNION ALL
     SELECT p.storage_path
     FROM onboarding_bank_proofs p
     INNER JOIN onboarding_bank_details obd ON obd.id = p.bank_detail_id
     INNER JOIN onboarding_cases oc ON oc.id = obd.case_id
     WHERE oc.is_demo = 1`
  );
  const [cases] = await pool.query(`SELECT id FROM onboarding_cases WHERE is_demo = 1`);
  const caseIds = cases.map((c) => c.id);

  const connection = await pool.getConnection();
  let removed;
  try {
    await connection.beginTransaction();
    if (caseIds.length) {
      await connection.query(
        `DELETE FROM notifications WHERE reference_type = 'ONBOARDING' AND reference_id IN (?)`,
        [caseIds]
      );
    }
    const [emp] = await connection.query(`DELETE FROM employees WHERE is_demo = 1`);
    const [cand] = await connection.query(`DELETE FROM candidates WHERE is_demo = 1`);
    await connection.commit();
    removed = { cases: caseIds.length, employees: emp.affectedRows, candidates: cand.affectedRows };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const uploadsParent = path.join(uploadsRoot, '..');
  const uploadedFiles = files
    .filter((file) => !isVirtualPlaceholder(file.storage_path))
    .map((file) => path.resolve(uploadsParent, file.storage_path))
    .filter((absolute) => absolute.startsWith(uploadsRoot));
  removeFilesGradually(uploadedFiles);

  return { ...removed, files: uploadedFiles.length };
}

// Deleting many files in a burst can trip endpoint protection on Windows hosts, which
// kills the API process. The rows are already gone, so files are removed paced and in the background.
function removeFilesGradually(absolutePaths, delayMs = 750) {
  absolutePaths.forEach((absolute, index) => {
    setTimeout(() => {
      try {
        fs.rmSync(absolute, { force: true });
      } catch (error) {
        console.warn(`Demo cleanup could not remove ${absolute}: ${error.message}`);
      }
    }, index * delayMs).unref();
  });
}
