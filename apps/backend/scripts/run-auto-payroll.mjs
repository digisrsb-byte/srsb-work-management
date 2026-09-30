/**
 * Runs the monthly auto-payroll job on demand (same code as the scheduler).
 *
 *   node scripts/run-auto-payroll.mjs                      # previous month
 *   node scripts/run-auto-payroll.mjs --year=2026 --month=9
 *   node scripts/run-auto-payroll.mjs --dry-run            # report only, creates nothing
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
}

const { previousPeriod, runMonthlyAutoPayroll } = await import('../src/services/payrollAutoRunService.js');
const { pool } = await import('../src/config/database.js');

const fallback = previousPeriod();
const year = Number(arg('year') || fallback.year);
const month = Number(arg('month') || fallback.month);
const dryRun = Boolean(arg('dry-run'));

try {
  const { period, results } = await runMonthlyAutoPayroll({ year, month, dryRun });
  console.log(`Auto payroll for ${period}${dryRun ? ' [dry run]' : ''}`);
  console.table(results);
} finally {
  await pool.end();
}
