import { pool } from '../config/database.js';
import { writeAuditLog } from './auditService.js';
import { notifyRoleHolders } from './notificationService.js';
import { recalculatePayrollRunItems } from './payrollService.js';

const DEFAULT_WORKING_DAYS = 26;

export function previousPeriod(date = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)])
  );
  const year = parts.month === 1 ? parts.year - 1 : parts.year;
  const month = parts.month === 1 ? 12 : parts.month - 1;
  return { year, month, dayOfMonth: parts.day };
}

/**
 * Creates and calculates a DRAFT payroll run for every active company that
 * does not have a run for the given period yet. Existing runs are never touched.
 * Approval, locking and payment stay manual.
 */
export async function runMonthlyAutoPayroll({ year, month, dryRun = false }) {
  const period = `${String(month).padStart(2, '0')}/${year}`;
  const [companies] = await pool.query(
    `SELECT id, name FROM companies WHERE status = 'ACTIVE' ORDER BY id`
  );

  const results = [];
  for (const company of companies) {
    const [existing] = await pool.query(
      `SELECT id, status FROM payroll_runs
       WHERE company_id = ? AND period_year = ? AND period_month = ?
       LIMIT 1`,
      [company.id, year, month]
    );
    if (existing.length) {
      results.push({ company: company.name, status: 'skipped', reason: `run #${existing[0].id} already ${existing[0].status}` });
      continue;
    }
    if (dryRun) {
      results.push({ company: company.name, status: 'would create' });
      continue;
    }

    let runId;
    try {
      const [insert] = await pool.query(
        `INSERT INTO payroll_runs (
           company_id, period_year, period_month, status, working_days, created_by
         ) VALUES (?, ?, ?, 'DRAFT', ?, NULL)`,
        [company.id, year, month, DEFAULT_WORKING_DAYS]
      );
      runId = insert.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        results.push({ company: company.name, status: 'skipped', reason: 'run created concurrently' });
        continue;
      }
      throw error;
    }

    await writeAuditLog({
      employeeId: null,
      action: 'PAYROLL_RUN_CREATED',
      entityType: 'payroll_runs',
      entityId: runId,
      newValues: { companyId: company.id, periodYear: year, periodMonth: month, source: 'AUTO_SCHEDULER' }
    });

    const summary = await recalculatePayrollRunItems({
      id: runId,
      company_id: company.id,
      period_year: year,
      period_month: month,
      working_days: DEFAULT_WORKING_DAYS
    });

    await writeAuditLog({
      employeeId: null,
      action: 'PAYROLL_CALCULATED',
      entityType: 'payroll_runs',
      entityId: runId,
      newValues: { ...summary, source: 'AUTO_SCHEDULER' }
    });

    const needsAttention = summary.missingSalary + summary.failed;
    await notifyRoleHolders({
      roles: ['SUPER_ADMIN', 'ADMIN', 'HR'],
      actorId: null,
      companyId: company.id,
      type: 'PAYROLL_AUTO_CALCULATED',
      title: `Payroll ${period} ready for review`,
      message:
        `Payroll for ${period} (${company.name}) was created and calculated automatically for ${summary.employees} employee(s).` +
        (needsAttention
          ? ` ${needsAttention} employee(s) need attention (missing salary setup or calculation error).`
          : '') +
        ' Review it in Salary & Payroll → Payroll Runs and submit for approval.',
      referenceType: 'PAYROLL',
      referenceId: runId
    });

    results.push({ company: company.name, status: 'created', runId, ...summary });
  }

  return { period, results };
}
