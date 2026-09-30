import { pool } from '../config/database.js';
import { COMPANY_ADDRESS_DEFAULT } from './salaryCalculationService.js';
import {
  maskAadhaar,
  maskAccountNumber,
  maskLastFour,
  maskPan,
  maskUan
} from '../utils/maskSensitive.js';

const PAYSLIP_COLUMNS = `
  pr.id,
  pr.payslip_number,
  pr.generated_at,
  pr.generated_by,
  pri.id AS run_item_id,
  pri.run_id,
  pri.employee_id,
  run.period_year,
  run.period_month,
  run.company_id,
  run.status AS payroll_status,
  run.working_days,
  run.paid_at,
  pri.payable_days,
  pri.ctc,
  pri.gross_earnings,
  pri.pf_employee,
  pri.pf_employer,
  pri.esi_employee,
  pri.esi_employer,
  pri.professional_tax,
  pri.other_deductions,
  pri.net_pay,
  pri.calculation_notes,
  pri.component_snapshot,
  e.full_name,
  e.employee_id AS emp_code,
  e.email,
  e.designation,
  e.joining_date,
  e.work_location,
  d.name AS department,
  c.name AS company_name,
  c.address AS company_registered_address,
  c.official_email AS company_email,
  c.contact_phone AS company_phone,
  c.website AS company_website,
  sc.company_address,
  bank.bank_name,
  bank.account_number,
  bank.account_number_last4,
  bank.ifsc_code,
  bank.account_holder_name,
  bank.pan_number,
  (SELECT ub.uan_number FROM employee_bank_details ub WHERE ub.employee_id = e.id LIMIT 1) AS uan_number,
  (SELECT doc.document_number
     FROM employee_documents doc
    WHERE doc.employee_id = e.id AND doc.document_type = 'AADHAAR'
    ORDER BY doc.uploaded_at DESC, doc.id DESC
    LIMIT 1) AS aadhaar_number,
  addr.address_line_1,
  addr.address_line_2,
  addr.city,
  addr.state,
  addr.postal_code`;

const PAYSLIP_JOINS = `
  INNER JOIN payroll_runs run ON run.id = pri.run_id
  INNER JOIN employees e ON e.id = pri.employee_id
  INNER JOIN companies c ON c.id = run.company_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN employee_bank_details bank
    ON bank.employee_id = e.id
   AND (bank.source = 'LEGACY' OR bank.verified_at IS NOT NULL)
  LEFT JOIN employee_addresses addr
    ON addr.employee_id = e.id AND addr.address_type = 'CURRENT'
  LEFT JOIN salary_configurations sc
    ON sc.company_id = run.company_id AND sc.is_active = 1`;

/** Raw payslip row for a generated payslip record. */
export async function loadPayslipRowById(payslipId) {
  const [rows] = await pool.query(
    `SELECT ${PAYSLIP_COLUMNS}
     FROM payslip_records pr
     INNER JOIN payroll_run_items pri ON pri.id = pr.run_item_id
     ${PAYSLIP_JOINS}
     WHERE pr.id = ?
     LIMIT 1`,
    [payslipId]
  );
  return rows[0] || null;
}

/**
 * Raw payslip row for one employee in one payroll run. Works before release too
 * (payslip record columns are then null), which is what the review screen previews.
 */
export async function loadPayslipRowForRunEmployee(runId, employeeId) {
  const [rows] = await pool.query(
    `SELECT ${PAYSLIP_COLUMNS}
     FROM payroll_run_items pri
     LEFT JOIN payslip_records pr
       ON pr.id = (SELECT MAX(p2.id) FROM payslip_records p2 WHERE p2.run_item_id = pri.id)
     ${PAYSLIP_JOINS}
     WHERE pri.run_id = ? AND pri.employee_id = ?
     LIMIT 1`,
    [runId, employeeId]
  );
  return rows[0] || null;
}

/** Masks identifiers, drops raw values and adds the derived fields the payslip layout uses. */
export function shapePayslip(row) {
  const payslip = { ...row };
  let snapshot = payslip.component_snapshot;
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      snapshot = null;
    }
  }

  // Onboarding-verified rows keep only the last four digits in clear; legacy rows are masked here.
  const maskedAccount = payslip.account_number_last4
    ? maskLastFour(payslip.account_number_last4)
    : maskAccountNumber(payslip.account_number);
  const maskedPan = maskPan(payslip.pan_number);
  const maskedAadhaar = maskAadhaar(payslip.aadhaar_number);
  const maskedUan = maskUan(payslip.uan_number);
  delete payslip.account_number;
  delete payslip.account_number_last4;
  delete payslip.pan_number;
  delete payslip.aadhaar_number;
  delete payslip.uan_number;
  const companyRegisteredAddress = payslip.company_registered_address;
  delete payslip.company_registered_address;
  const isPaid = payslip.payroll_status === 'PAID';

  const employeeAddress = [
    payslip.address_line_1,
    payslip.address_line_2,
    payslip.city,
    payslip.state,
    payslip.postal_code
  ]
    .filter(Boolean)
    .join(', ');

  const pfApplicable = snapshot?.pfApplicable !== false;

  return {
    ...payslip,
    is_preview: !payslip.id,
    employee_address: employeeAddress || null,
    component_snapshot: snapshot,
    bank_account_masked: maskedAccount,
    pan_masked: maskedPan,
    aadhaar_masked: maskedAadhaar,
    uan_masked: pfApplicable ? maskedUan : null,
    pf_applicable: pfApplicable,
    pf_wage: pfApplicable ? snapshot?.pfBase ?? null : null,
    company_address:
      payslip.company_address ||
      companyRegisteredAddress ||
      snapshot?.configSnapshot?.company_address ||
      COMPANY_ADDRESS_DEFAULT,
    payment_method: maskedAccount ? 'Bank Transfer' : 'Not configured',
    payment_status: isPaid ? 'PAID' : 'PENDING',
    payment_date: isPaid ? payslip.paid_at : null,
    lop_days: snapshot?.lopDays ?? null,
    breakdown: snapshot
  };
}
