import { pool } from '../config/database.js';
import { displayStatus } from './bankDetailsRules.js';

export const DEFAULT_CHECKLIST = [
  { document_type: 'PAN', label: 'PAN Card', requirement: 'REQUIRED', sort_order: 1 },
  { document_type: 'AADHAAR', label: 'Aadhaar Card', requirement: 'REQUIRED', sort_order: 2 },
  { document_type: 'PHOTOGRAPH', label: 'Photograph', requirement: 'REQUIRED', sort_order: 3 },
  { document_type: 'OFFER_LETTER', label: 'Offer Letter', requirement: 'REQUIRED', sort_order: 4 },
  { document_type: 'JOINING_LETTER', label: 'Joining Letter', requirement: 'REQUIRED', sort_order: 5 },
  { document_type: 'EDUCATION_CERTIFICATE', label: 'Education Certificate', requirement: 'REQUIRED', sort_order: 6 },
  { document_type: 'BANK_STATEMENT', label: 'Bank Statement', requirement: 'OPTIONAL', sort_order: 7 },
  { document_type: 'EXPERIENCE_LETTER', label: 'Experience Letter', requirement: 'OPTIONAL', sort_order: 8 },
  { document_type: 'RELIEVING_LETTER', label: 'Previous Company Relieving Document', requirement: 'OPTIONAL', sort_order: 9 },
  { document_type: 'PAYSLIPS', label: 'Payslips', requirement: 'OPTIONAL', sort_order: 10 },
  { document_type: 'APPOINTMENT_LETTER', label: 'Appointment Letter', requirement: 'OPTIONAL', sort_order: 11 }
];

export async function getActivationBlockers(employeeId) {
  const [rows] = await pool.query(
    `SELECT
       oci.id,
       oci.document_type,
       oci.label,
       oci.requirement,
       oci.status
     FROM onboarding_cases oc
     INNER JOIN onboarding_checklist_items oci
       ON oci.case_id = oc.id
     WHERE oc.employee_id = ?
       AND oci.requirement = 'REQUIRED'
       AND oci.status NOT IN ('VERIFIED', 'NOT_APPLICABLE')
     ORDER BY oci.sort_order`,
    [employeeId]
  );

  return rows;
}

// Joiners need verified bank details before activation. DEMO cases are exempt because their
// fictional employees never reach payroll.
export async function getBankBlocker(caseId, executor = pool) {
  const [rows] = await executor.query(
    `SELECT
       oc.is_demo,
       obd.status,
       (SELECT r.decision FROM onboarding_bank_reviews r
         WHERE r.bank_detail_id = obd.id ORDER BY r.id DESC LIMIT 1) AS last_decision
     FROM onboarding_cases oc
     LEFT JOIN onboarding_bank_details obd ON obd.case_id = oc.id
     WHERE oc.id = ?
     LIMIT 1`,
    [caseId]
  );
  const row = rows[0];
  if (!row || row.is_demo || row.status === 'VERIFIED') return null;
  return {
    id: 'bank-details',
    document_type: 'BANK_DETAILS',
    label: 'Bank details',
    requirement: 'REQUIRED',
    status: displayStatus(row.status ? row : null, row.last_decision)
  };
}

export async function canActivateEmployee(employeeId) {
  const [cases] = await pool.query(
    `SELECT id, status
     FROM onboarding_cases
     WHERE employee_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [employeeId]
  );

  if (!cases.length) {
    return {
      allowed: true,
      reason: 'NO_ONBOARDING_CASE',
      blockers: []
    };
  }

  const bankBlocker = await getBankBlocker(cases[0].id);
  const blockers = [...(await getActivationBlockers(employeeId)), ...(bankBlocker ? [bankBlocker] : [])];
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? 'READY' : 'INCOMPLETE_DOCUMENTS',
    caseId: cases[0].id,
    blockers
  };
}

export async function refreshCaseStatus(caseId) {
  const [current] = await pool.query(
    `SELECT status FROM onboarding_cases WHERE id = ? LIMIT 1`,
    [caseId]
  );
  if (['ACTIVATED', 'CANCELLED'].includes(current[0]?.status)) {
    return current[0].status;
  }

  const [items] = await pool.query(
    `SELECT requirement, status
     FROM onboarding_checklist_items
     WHERE case_id = ?`,
    [caseId]
  );

  const required = items.filter((item) => item.requirement === 'REQUIRED');
  const allRequiredDone = required.every((item) =>
    ['VERIFIED', 'NOT_APPLICABLE'].includes(item.status)
  );
  const [bankRows] = await pool.query(
    `SELECT COUNT(*) AS n FROM onboarding_bank_details WHERE case_id = ?`,
    [caseId]
  );
  const anySubmitted =
    Number(bankRows[0].n) > 0 ||
    items.some((item) =>
      ['UPLOADED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED'].includes(
        item.status
      )
    );
  const bankBlocker = await getBankBlocker(caseId);

  let status = 'PENDING';
  if (allRequiredDone && required.length > 0 && !bankBlocker) {
    status = 'READY';
  } else if (anySubmitted) {
    status = 'IN_PROGRESS';
  }

  await pool.query(
    `UPDATE onboarding_cases SET status = ? WHERE id = ?`,
    [status, caseId]
  );

  const [caseRows] = await pool.query(
    `SELECT employee_id FROM onboarding_cases WHERE id = ?`,
    [caseId]
  );

  if (caseRows[0]) {
    await pool.query(
      `UPDATE employees
       SET onboarding_status = ?
       WHERE id = ?`,
      [
        status === 'READY' ? 'COMPLETED' : 'IN_PROGRESS',
        caseRows[0].employee_id
      ]
    );
  }

  return status;
}
