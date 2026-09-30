import cron from 'node-cron';
import { previousPeriod, runMonthlyAutoPayroll } from '../services/payrollAutoRunService.js';

const timezone = 'Asia/Kolkata';
// If the server was down on the 1st, the job still catches up during the first days of the month.
const CATCH_UP_DAYS = 7;

async function runForPreviousMonth(trigger) {
  const { year, month, dayOfMonth } = previousPeriod(new Date(), timezone);
  if (dayOfMonth > CATCH_UP_DAYS) return;

  try {
    const { period, results } = await runMonthlyAutoPayroll({ year, month });
    const created = results.filter((r) => r.status === 'created');
    if (created.length) {
      console.log(
        `[auto-payroll:${trigger}] ${period}: created ${created.length} run(s) —`,
        created.map((r) => `${r.company} (#${r.runId}, ${r.employees} employees, ${r.missingSalary} missing salary)`).join('; ')
      );
    }
  } catch (error) {
    console.error(`[auto-payroll:${trigger}] failed:`, error.message);
  }
}

export function startPayrollScheduler() {
  if (String(process.env.PAYROLL_AUTO_RUN || 'true').toLowerCase() === 'false') {
    console.log('Auto payroll scheduler disabled (PAYROLL_AUTO_RUN=false).');
    return;
  }

  cron.schedule('0 2 * * *', () => runForPreviousMonth('daily'), { timezone });
  runForPreviousMonth('startup');

  console.log('Auto payroll scheduler started (previous month, 1st–7th at 02:00 IST).');
}
