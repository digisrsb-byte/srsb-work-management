import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { getCompanyIdsForUser } from '../services/permissionService.js';
import { periodBounds, periodLabel } from '../services/attendancePeriodService.js';

const count = async (sql, params) => {
  const [[row]] = await pool.query(sql, params);
  return Number(row?.cnt || 0);
};

function defaultPeriod() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function readPeriod(query) {
  if (!query.year && !query.month) return defaultPeriod();
  const year = Number(query.year);
  const month = Number(query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError('Valid year and month required.', 400);
  }
  return { year, month };
}

/**
 * HR workflow overview for one payroll month: where each lifecycle stage stands
 * (onboarding → documents → salary → PF/UAN → attendance → payroll → payslips → release)
 * and the concrete tasks waiting on HR. Every number is read live from the database.
 */
export const workflowDashboard = asyncHandler(async (req, res) => {
  const { year, month } = readPeriod(req.query);
  const { start, end } = periodBounds(year, month);
  let companyIds = await getCompanyIdsForUser(req.user);
  if (req.query.companyId) {
    const requested = Number(req.query.companyId);
    if (!companyIds.includes(requested)) throw new AppError('You do not have access to this company.', 403);
    companyIds = [requested];
  }

  const empty = !companyIds.length;
  const scope = empty ? [0] : companyIds;
  const demoFilter = env.demoMode ? '' : ' AND oc.is_demo = 0';
  const activeEmployee = `e.company_id IN (?) AND e.status = 'ACTIVE' AND e.role <> 'SUPER_ADMIN'`;

  const [
    activeEmployees,
    openOnboarding,
    documentsAwaiting,
    bankAwaiting,
    missingSalary,
    missingEmail,
    missingUan,
    pendingCorrections
  ] = await Promise.all([
    count(`SELECT COUNT(*) AS cnt FROM employees e WHERE ${activeEmployee}`, [scope]),
    count(
      `SELECT COUNT(*) AS cnt FROM onboarding_cases oc
       WHERE oc.company_id IN (?) AND oc.status IN ('PENDING','IN_PROGRESS','READY')${demoFilter}`,
      [scope]
    ),
    count(
      `SELECT COUNT(*) AS cnt FROM onboarding_checklist_items oci
       INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
       WHERE oc.company_id IN (?) AND oc.status <> 'CANCELLED' AND oci.status = 'SUBMITTED'${demoFilter}`,
      [scope]
    ),
    count(
      `SELECT COUNT(*) AS cnt FROM onboarding_bank_details obd
       INNER JOIN onboarding_cases oc ON oc.id = obd.case_id
       WHERE oc.company_id IN (?) AND oc.status <> 'CANCELLED' AND obd.status = 'PENDING_VERIFICATION'${demoFilter}`,
      [scope]
    ),
    count(
      `SELECT COUNT(*) AS cnt FROM employees e
       WHERE ${activeEmployee}
         AND NOT EXISTS (
           SELECT 1 FROM employee_salary_structures s
           WHERE s.employee_id = e.id AND s.status = 'ACTIVE' AND s.effective_date <= ?
         )`,
      [scope, start]
    ),
    count(
      `SELECT COUNT(*) AS cnt FROM employees e
       WHERE ${activeEmployee} AND NULLIF(TRIM(e.email), '') IS NULL`,
      [scope]
    ),
    count(
      `SELECT COUNT(*) AS cnt FROM employees e
       INNER JOIN employee_salary_structures s ON s.id = (
         SELECT s2.id FROM employee_salary_structures s2
         WHERE s2.employee_id = e.id AND s2.status = 'ACTIVE' AND s2.effective_date <= ?
         ORDER BY s2.effective_date DESC, s2.id DESC LIMIT 1
       )
       WHERE ${activeEmployee}
         AND s.pf_applicable = 1
         AND NOT EXISTS (
           SELECT 1 FROM employee_bank_details b
           WHERE b.employee_id = e.id AND NULLIF(TRIM(b.uan_number), '') IS NOT NULL
         )`,
      [start, scope]
    ),
    count(
      `SELECT COUNT(*) AS cnt FROM attendance_correction_requests acr
       INNER JOIN employees e ON e.id = acr.employee_id
       WHERE e.company_id IN (?) AND acr.status = 'PENDING' AND acr.correction_date BETWEEN ? AND ?`,
      [scope, start, end]
    )
  ]);

  const [companies] = await pool.query(
    `SELECT c.id, c.name,
            apl.status AS attendance_status,
            pr.id AS run_id, pr.status AS run_status,
            (SELECT COALESCE(SUM(pri.net_pay), 0) FROM payroll_run_items pri WHERE pri.run_id = pr.id) AS net_pay
     FROM companies c
     LEFT JOIN attendance_period_locks apl
       ON apl.company_id = c.id AND apl.period_year = ? AND apl.period_month = ?
     LEFT JOIN payroll_runs pr
       ON pr.company_id = c.id AND pr.period_year = ? AND pr.period_month = ?
     WHERE c.id IN (?)
       AND EXISTS (SELECT 1 FROM employees e WHERE e.company_id = c.id AND e.status = 'ACTIVE' AND e.role <> 'SUPER_ADMIN')
     ORDER BY c.name`,
    [year, month, year, month, scope]
  );

  const [deliveryRows] = await pool.query(
    `SELECT ped.status, COUNT(*) AS cnt
     FROM payslip_email_deliveries ped
     INNER JOIN payroll_runs pr ON pr.id = ped.run_id
     WHERE pr.company_id IN (?) AND pr.period_year = ? AND pr.period_month = ?
     GROUP BY ped.status`,
    [scope, year, month]
  );
  const emails = { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
  for (const r of deliveryRows) emails[r.status] = Number(r.cnt);

  const totalCompanies = companies.length;
  const finalized = companies.filter((c) => c.attendance_status === 'FINALIZED').length;
  const runs = companies.filter((c) => c.run_id);
  const atLeast = (statuses) => companies.filter((c) => statuses.includes(c.run_status)).length;
  const approved = atLeast(['APPROVED', 'LOCKED', 'PAID']);
  const payslipsReady = atLeast(['LOCKED', 'PAID']);
  const released = atLeast(['PAID']);
  const all = (n) => totalCompanies > 0 && n === totalCompanies;
  const label = periodLabel(year, month);
  const primaryRun = companies.length === 1 ? companies[0].run_id : null;
  const payrollLink = primaryRun ? `/admin/payroll?tab=runs&run=${primaryRun}` : '/admin/payroll?tab=runs';

  const stages = [
    {
      key: 'onboarding',
      label: 'Onboarding',
      status: openOnboarding ? 'action' : 'done',
      detail: openOnboarding ? `${openOnboarding} case(s) in progress` : 'No open cases',
      to: '/admin/onboarding'
    },
    {
      key: 'documents',
      label: 'Document verification',
      status: documentsAwaiting + bankAwaiting ? 'action' : 'done',
      detail:
        documentsAwaiting + bankAwaiting
          ? `${documentsAwaiting} document(s), ${bankAwaiting} bank detail(s) awaiting review`
          : 'Nothing awaiting review',
      to: '/admin/onboarding'
    },
    {
      key: 'salary',
      label: 'Salary & CTC',
      status: missingSalary ? 'action' : 'done',
      detail: missingSalary ? `${missingSalary} employee(s) without CTC for ${label}` : 'All employees have CTC',
      to: '/admin/payroll?tab=salary-setup'
    },
    {
      key: 'pf',
      label: 'PF / UAN',
      status: missingUan ? 'action' : 'done',
      detail: missingUan ? `${missingUan} PF employee(s) missing UAN` : 'UAN recorded for PF employees',
      to: '/admin/payroll?tab=salary-setup'
    },
    {
      key: 'attendance',
      label: 'Attendance finalized',
      status: all(finalized) ? 'done' : 'action',
      detail: totalCompanies
        ? `${finalized}/${totalCompanies} compan${totalCompanies === 1 ? 'y' : 'ies'} finalized${pendingCorrections ? ` · ${pendingCorrections} correction(s) pending` : ''}`
        : 'No active employees',
      to: `/admin/attendance?finalize=${year}-${String(month).padStart(2, '0')}`
    },
    {
      key: 'payroll',
      label: 'Payroll approved',
      status: all(approved) ? 'done' : runs.length ? 'action' : 'pending',
      detail: runs.length ? `${approved}/${totalCompanies} approved` : `No payroll run for ${label} yet`,
      to: payrollLink
    },
    {
      key: 'payslips',
      label: 'Payslips generated',
      status: all(payslipsReady) ? 'done' : approved ? 'action' : 'pending',
      detail: `${payslipsReady}/${totalCompanies || 0} locked with payslips ready`,
      to: payrollLink
    },
    {
      key: 'release',
      label: 'Released & emailed',
      status: all(released) && !emails.FAILED ? 'done' : released || payslipsReady ? 'action' : 'pending',
      detail: released
        ? `${emails.SENT} sent · ${emails.PENDING + emails.SENDING} sending · ${emails.FAILED} failed · ${emails.SKIPPED} skipped`
        : 'Not released yet',
      to: payrollLink
    }
  ];

  const tasks = [
    { key: 'documents', label: 'Documents awaiting verification', count: documentsAwaiting, to: '/admin/onboarding', severity: 'action' },
    { key: 'bank', label: 'Bank details awaiting verification', count: bankAwaiting, to: '/admin/onboarding', severity: 'action' },
    { key: 'salary', label: 'Employees missing CTC', count: missingSalary, to: '/admin/payroll?tab=salary-setup', severity: 'blocking' },
    { key: 'corrections', label: `Pending attendance corrections (${label})`, count: pendingCorrections, to: '/admin/attendance-corrections', severity: 'blocking' },
    { key: 'uan', label: 'PF employees missing UAN', count: missingUan, to: '/admin/payroll?tab=salary-setup', severity: 'warning' },
    { key: 'email', label: 'Employees without an email address', count: missingEmail, to: '/admin/employees', severity: 'warning' },
    { key: 'failedEmails', label: 'Payslip emails failed', count: emails.FAILED, to: payrollLink, severity: 'blocking' }
  ].filter((t) => t.count > 0);

  res.json({
    success: true,
    data: {
      periodYear: year,
      periodMonth: month,
      periodLabel: label,
      kpis: {
        activeEmployees,
        openOnboarding,
        pendingVerification: documentsAwaiting + bankAwaiting,
        attendanceFinalized: finalized,
        companies: totalCompanies,
        netPayroll: companies.reduce((s, c) => s + Number(c.net_pay || 0), 0),
        payslipsReleased: released,
        emailsSent: emails.SENT,
        emailsFailed: emails.FAILED
      },
      stages,
      tasks,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        attendanceStatus: c.attendance_status || 'OPEN',
        runId: c.run_id,
        runStatus: c.run_status
      })),
      emails
    }
  });
});
