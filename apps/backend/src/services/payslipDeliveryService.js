import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { sendPayslipEmail } from '../utils/mailer.js';
import { deliveryErrorMessage } from './invitationService.js';
import { loadPayslipRowById, shapePayslip } from './payslipDataService.js';
import { buildPayslipPdfBuffer } from './payslipPdfService.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const NO_EMAIL = 'No email address on file for this employee.';
// A delivery left in SENDING this long (e.g. the server restarted mid-send) may be retried.
const STALE_SENDING_MINUTES = 10;

const activeRuns = new Set();

/** One delivery row per released payslip; employees without an email are SKIPPED up front. */
export async function createDeliveriesForRun(runId) {
  await pool.query(
    `INSERT IGNORE INTO payslip_email_deliveries (payslip_id, run_id, employee_id, email, status, last_error)
     SELECT pr.id, pr.run_id, pr.employee_id, NULLIF(TRIM(e.email), ''),
            IF(NULLIF(TRIM(e.email), '') IS NULL, 'SKIPPED', 'PENDING'),
            IF(NULLIF(TRIM(e.email), '') IS NULL, ?, NULL)
     FROM payslip_records pr
     INNER JOIN employees e ON e.id = pr.employee_id
     WHERE pr.run_id = ?`,
    [NO_EMAIL, runId]
  );
}

async function claimNextPending(runId) {
  const [rows] = await pool.query(
    `SELECT id FROM payslip_email_deliveries
     WHERE run_id = ? AND status = 'PENDING'
     ORDER BY id LIMIT 1`,
    [runId]
  );
  if (!rows.length) return null;
  const [result] = await pool.query(
    `UPDATE payslip_email_deliveries
     SET status = 'SENDING', attempts = attempts + 1, last_attempt_at = NOW()
     WHERE id = ? AND status = 'PENDING'`,
    [rows[0].id]
  );
  return result.affectedRows ? rows[0].id : claimNextPending(runId);
}

async function deliverOne(deliveryId) {
  const [rows] = await pool.query(
    `SELECT ped.*, e.email AS current_email
     FROM payslip_email_deliveries ped
     INNER JOIN employees e ON e.id = ped.employee_id
     WHERE ped.id = ? LIMIT 1`,
    [deliveryId]
  );
  const delivery = rows[0];
  if (!delivery) return;

  const email = String(delivery.current_email || '').trim();
  if (!email) {
    await pool.query(
      `UPDATE payslip_email_deliveries SET status = 'SKIPPED', email = NULL, last_error = ? WHERE id = ?`,
      [NO_EMAIL, deliveryId]
    );
    return;
  }

  try {
    const row = await loadPayslipRowById(delivery.payslip_id);
    if (!row) throw new Error('Payslip record no longer exists.');
    const payslip = shapePayslip(row);
    const attachment = await buildPayslipPdfBuffer(payslip);
    const month = Number(payslip.period_month);
    const periodLabel = `${MONTH_NAMES[month - 1] || month} ${payslip.period_year}`;

    if (env.payslipEmailDryRun) {
      await pool.query(
        `UPDATE payslip_email_deliveries
         SET status = 'SKIPPED', email = ?, last_error = ?
         WHERE id = ?`,
        [email, `Dry run: ${attachment.filename} rendered (${attachment.content.length} bytes) but not sent.`, deliveryId]
      );
      return;
    }

    await sendPayslipEmail({
      to: email,
      employeeName: payslip.full_name,
      employeeCode: payslip.emp_code,
      companyName: payslip.company_name,
      periodLabel,
      attachment
    });
    await pool.query(
      `UPDATE payslip_email_deliveries
       SET status = 'SENT', email = ?, sent_at = NOW(), last_error = NULL
       WHERE id = ?`,
      [email, deliveryId]
    );
  } catch (error) {
    await pool.query(
      `UPDATE payslip_email_deliveries SET status = 'FAILED', email = ?, last_error = ? WHERE id = ?`,
      [email, deliveryErrorMessage(error), deliveryId]
    );
  }
}

/** Sends every PENDING delivery of the run, one at a time. Safe to call repeatedly. */
export async function processRunDeliveries(runId) {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  try {
    for (;;) {
      const id = await claimNextPending(runId);
      if (!id) break;
      await deliverOne(id);
    }
  } finally {
    activeRuns.delete(runId);
  }
}

export function processRunDeliveriesInBackground(runId) {
  setImmediate(() => {
    processRunDeliveries(runId).catch((error) => {
      console.error(`Payslip email delivery for run ${runId} stopped:`, error.message);
    });
  });
}

/** Re-queues failed (and stale in-flight) deliveries, plus skipped ones whose employee now has an email. */
export async function requeueFailedDeliveries(runId) {
  const [result] = await pool.query(
    `UPDATE payslip_email_deliveries ped
     INNER JOIN employees e ON e.id = ped.employee_id
     SET ped.status = 'PENDING', ped.last_error = NULL
     WHERE ped.run_id = ?
       AND (
         ped.status = 'FAILED'
         OR (ped.status = 'SENDING' AND ped.last_attempt_at < NOW() - INTERVAL ${STALE_SENDING_MINUTES} MINUTE)
         OR (ped.status = 'SKIPPED' AND NULLIF(TRIM(e.email), '') IS NOT NULL)
       )`,
    [runId]
  );
  return result.affectedRows;
}

export async function requeueDelivery(deliveryId) {
  const [result] = await pool.query(
    `UPDATE payslip_email_deliveries
     SET status = 'PENDING', last_error = NULL
     WHERE id = ? AND status <> 'SENDING'`,
    [deliveryId]
  );
  return result.affectedRows;
}

export async function listRunDeliveries(runId) {
  const [rows] = await pool.query(
    `SELECT ped.id, ped.payslip_id, ped.employee_id, ped.email, ped.status, ped.attempts,
            ped.last_error, ped.last_attempt_at, ped.sent_at,
            e.full_name, e.employee_id AS emp_code, pr.payslip_number
     FROM payslip_email_deliveries ped
     INNER JOIN employees e ON e.id = ped.employee_id
     INNER JOIN payslip_records pr ON pr.id = ped.payslip_id
     WHERE ped.run_id = ?
     ORDER BY FIELD(ped.status, 'FAILED', 'SENDING', 'PENDING', 'SKIPPED', 'SENT'), e.full_name`,
    [runId]
  );
  const counts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 }
  );
  return {
    deliveries: rows,
    counts,
    total: rows.length,
    inProgress: counts.PENDING + counts.SENDING > 0,
    dryRun: env.payslipEmailDryRun
  };
}
