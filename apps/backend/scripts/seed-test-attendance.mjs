/**
 * Seeds test attendance for manual payroll testing.
 *
 *   node scripts/seed-test-attendance.mjs [--days=30] [--end=YYYY-MM-DD] [--include-inactive] [--dry-run]
 *
 * - Covers the `--days` days ending on `--end` (default: yesterday) for every employee.
 * - Never deletes anything and never overwrites real attendance: an existing row is
 *   only refreshed when it was itself created by this script (remarks start with TEST_SEED).
 * - Each employee gets a deterministic pattern so payroll results differ
 *   (full attendance, some LOP, leave, half days, missing punch).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MARKER = 'TEST_SEED';
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const PROFILES = [
  { name: 'full attendance', ABSENT: 0, HALF_DAY: 0, LEAVE: 0, MISSING_PUNCH: 0 },
  { name: 'few LOP days', ABSENT: 2, HALF_DAY: 1, LEAVE: 0, MISSING_PUNCH: 0 },
  { name: 'leave taker', ABSENT: 0, HALF_DAY: 1, LEAVE: 2, MISSING_PUNCH: 0 },
  { name: 'irregular', ABSENT: 3, HALF_DAY: 2, LEAVE: 1, MISSING_PUNCH: 1 },
  { name: 'mostly present', ABSENT: 1, HALF_DAY: 0, LEAVE: 1, MISSING_PUNCH: 0 }
];

function arg(name, fallback) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
}

function normalizePassword(value) {
  let password = value || '';
  if (
    (password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'"))
  ) {
    password = password.slice(1, -1);
  }
  return password;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seededRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function time(date, minutesFromMidnight) {
  const h = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
  const m = String(minutesFromMidnight % 60).padStart(2, '0');
  return `${date} ${h}:${m}:00`;
}

const days = Number(arg('days', 30));
const endArg = arg('end', null);
const includeInactive = Boolean(arg('include-inactive', false));
const dryRun = Boolean(arg('dry-run', false));

const end = endArg ? new Date(`${endArg}T00:00:00`) : new Date();
if (!endArg) end.setDate(end.getDate() - 1);
end.setHours(0, 0, 0, 0);
const dates = Array.from({ length: days }, (_, i) => {
  const d = new Date(end);
  d.setDate(end.getDate() - (days - 1 - i));
  return d;
});

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: normalizePassword(process.env.DB_PASSWORD),
  database: process.env.DB_NAME,
  dateStrings: true
});

try {
  const [employees] = await conn.query(
    `SELECT id, employee_id, full_name, company_id, weekly_off_day, status
       FROM employees
      ${includeInactive ? '' : "WHERE status = 'ACTIVE'"}
      ORDER BY id`
  );
  const [holidayRows] = await conn.query(
    'SELECT holiday_date, holiday_name, company_id FROM holidays WHERE holiday_date BETWEEN ? AND ?',
    [ymd(dates[0]), ymd(dates[dates.length - 1])]
  );

  console.log(
    `Seeding ${days} days (${ymd(dates[0])} → ${ymd(dates[dates.length - 1])}) for ${employees.length} employee(s)${dryRun ? ' [dry run]' : ''}`
  );

  const summary = [];
  for (const [index, emp] of employees.entries()) {
    const profile = PROFILES[index % PROFILES.length];
    const rand = seededRandom(emp.id * 7919);
    const weeklyOff = emp.weekly_off_day || 'SUNDAY';

    const plan = dates.map((d) => {
      const date = ymd(d);
      const holiday = holidayRows.find(
        (h) => h.holiday_date === date && (h.company_id == null || Number(h.company_id) === Number(emp.company_id))
      );
      if (holiday) return { date, status: 'HOLIDAY', note: holiday.holiday_name };
      if (WEEKDAYS[d.getDay()] === weeklyOff) return { date, status: 'WEEK_OFF' };
      return { date, status: 'PRESENT' };
    });

    const workingIdx = plan.map((p, i) => (p.status === 'PRESENT' ? i : -1)).filter((i) => i >= 0);
    for (let i = workingIdx.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [workingIdx[i], workingIdx[j]] = [workingIdx[j], workingIdx[i]];
    }
    let cursor = 0;
    for (const status of ['ABSENT', 'HALF_DAY', 'LEAVE', 'MISSING_PUNCH']) {
      for (let n = 0; n < profile[status] && cursor < workingIdx.length; n += 1) {
        plan[workingIdx[cursor]].status = status;
        cursor += 1;
      }
    }

    const counts = {};
    let inserted = 0;
    let refreshed = 0;
    let keptReal = 0;
    const [existingRows] = await conn.query(
      'SELECT attendance_date, remarks FROM attendance WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?',
      [emp.id, plan[0].date, plan[plan.length - 1].date]
    );
    const existing = new Map(existingRows.map((r) => [r.attendance_date, r.remarks]));

    for (const p of plan) {
      let punchIn = null;
      let punchOut = null;
      let minutes = 0;
      const inMin = 9 * 60 + Math.floor(rand() * 40);
      if (p.status === 'PRESENT') {
        punchIn = time(p.date, inMin);
        const outMin = 18 * 60 + Math.floor(rand() * 60);
        punchOut = time(p.date, outMin);
        minutes = outMin - inMin;
      } else if (p.status === 'HALF_DAY') {
        punchIn = time(p.date, inMin);
        const outMin = inMin + 240 + Math.floor(rand() * 60);
        punchOut = time(p.date, outMin);
        minutes = outMin - inMin;
      } else if (p.status === 'MISSING_PUNCH') {
        punchIn = time(p.date, inMin);
      }
      const remarks = `${MARKER}: ${p.note || p.status.toLowerCase().replace('_', ' ')}`;
      const existingRemarks = existing.get(p.date);

      if (existing.has(p.date) && !String(existingRemarks || '').startsWith(MARKER)) {
        keptReal += 1;
        continue;
      }
      counts[p.status] = (counts[p.status] || 0) + 1;
      if (dryRun) continue;

      if (existing.has(p.date)) {
        await conn.query(
          `UPDATE attendance
              SET punch_in = ?, punch_out = ?, total_work_minutes = ?, status = ?, remarks = ?
            WHERE employee_id = ? AND attendance_date = ? AND remarks LIKE '${MARKER}%'`,
          [punchIn, punchOut, minutes, p.status, remarks, emp.id, p.date]
        );
        refreshed += 1;
      } else {
        await conn.query(
          `INSERT IGNORE INTO attendance
             (employee_id, attendance_date, punch_in, punch_out, total_work_minutes, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [emp.id, p.date, punchIn, punchOut, minutes, p.status, remarks]
        );
        inserted += 1;
      }
    }

    summary.push({
      emp: `${emp.employee_id} ${emp.full_name}`,
      profile: profile.name,
      present: counts.PRESENT || 0,
      half: counts.HALF_DAY || 0,
      leave: counts.LEAVE || 0,
      absent: counts.ABSENT || 0,
      missing: counts.MISSING_PUNCH || 0,
      weekOff: counts.WEEK_OFF || 0,
      holiday: counts.HOLIDAY || 0,
      inserted,
      refreshed,
      keptReal
    });
  }

  console.table(summary);
  console.log('keptReal = days that already had real (non-seed) attendance; those rows were not touched.');
} finally {
  await conn.end();
}
