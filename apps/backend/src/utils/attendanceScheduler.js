import cron from 'node-cron';
import { pool, runForAllTenants } from '../config/database.js';
import { INDIA_DATE_SQL } from './indiaTime.js';

const timezone = 'Asia/Kolkata';

async function sendPunchInReminders() {
  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     SELECT
       e.id,
       NULL,
       'PUNCH_IN_REMINDER',
       'Punch-In Reminder',
       'You have not punched in today. Please record your attendance.',
       'ATTENDANCE',
       NULL
     FROM employees e
     LEFT JOIN attendance a
       ON a.employee_id = e.id
      AND a.attendance_date = ${INDIA_DATE_SQL}
     WHERE e.status = 'ACTIVE'
       AND e.role <> 'SUPER_ADMIN'
       AND a.punch_in IS NULL
       AND UPPER(DAYNAME(${INDIA_DATE_SQL})) <> 'SATURDAY'
       AND UPPER(DAYNAME(${INDIA_DATE_SQL})) <> COALESCE(e.weekly_off_day, 'SUNDAY')
       AND NOT EXISTS (
         SELECT 1
         FROM holidays h
         WHERE h.holiday_date = ${INDIA_DATE_SQL}
           AND (h.department_id IS NULL OR h.department_id = e.department_id)
       )
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.recipient_id = e.id
           AND n.type = 'PUNCH_IN_REMINDER'
           AND DATE(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = ${INDIA_DATE_SQL}
       )`
  );
}

async function sendLunchBreakNotifications() {
  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     SELECT
       e.id,
       NULL,
       'LUNCH_BREAK',
       'Lunch Break',
       'It is lunch time. Your lunch break is from 1:00 PM to 1:30 PM.',
       'ATTENDANCE',
       a.id
     FROM employees e
     JOIN attendance a
       ON a.employee_id = e.id
      AND a.attendance_date = ${INDIA_DATE_SQL}
     WHERE e.status = 'ACTIVE'
       AND e.role <> 'SUPER_ADMIN'
       AND a.punch_in IS NOT NULL
       AND a.punch_out IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.recipient_id = e.id
           AND n.type = 'LUNCH_BREAK'
           AND DATE(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = ${INDIA_DATE_SQL}
       )`
  );
}

async function sendPunchOutReminders() {
  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     SELECT
       e.id,
       NULL,
       'PUNCH_OUT_REMINDER',
       'Punch-Out Reminder',
       'Your working day is ending. Please remember to punch out.',
       'ATTENDANCE',
       a.id
     FROM employees e
     JOIN attendance a
       ON a.employee_id = e.id
      AND a.attendance_date = ${INDIA_DATE_SQL}
     WHERE e.status = 'ACTIVE'
       AND e.role <> 'SUPER_ADMIN'
       AND a.punch_in IS NOT NULL
       AND a.punch_out IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.recipient_id = e.id
           AND n.type = 'PUNCH_OUT_REMINDER'
           AND DATE(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = ${INDIA_DATE_SQL}
       )`
  );
}

async function sendWeeklyAttendanceSummaries() {
  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     SELECT
       e.id,
       NULL,
       'WEEKLY_ATTENDANCE_SUMMARY',
       'Weekly Attendance Summary',
       CONCAT(
         'This week — Present: ',
         SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END),
         ', Half days: ',
         SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END),
         ', Absent: ',
         SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END),
         ', Leave: ',
         SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END),
         ', Total worked: ',
         FLOOR(COALESCE(SUM(a.total_work_minutes), 0) / 60),
         ' hours ',
         MOD(COALESCE(SUM(a.total_work_minutes), 0), 60),
         ' minutes.'
       ),
       'ATTENDANCE_SUMMARY',
       NULL
     FROM employees e
     LEFT JOIN attendance a
       ON a.employee_id = e.id
      AND a.attendance_date BETWEEN
          DATE_SUB(${INDIA_DATE_SQL}, INTERVAL 5 DAY)
          AND ${INDIA_DATE_SQL}
     WHERE e.status = 'ACTIVE'
       AND e.role <> 'SUPER_ADMIN'
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.recipient_id = e.id
           AND n.type = 'WEEKLY_ATTENDANCE_SUMMARY'
           AND DATE(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = ${INDIA_DATE_SQL}
       )
     GROUP BY e.id`
  );
}

async function sendMonthlyAttendanceSummaries() {
  const [[dateCheck]] = await pool.query(
    `SELECT
       DAY(DATE_ADD(${INDIA_DATE_SQL}, INTERVAL 1 DAY)) AS tomorrow_day`
  );

  if (Number(dateCheck.tomorrow_day) !== 1) {
    return;
  }

  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     SELECT
       e.id,
       NULL,
       'MONTHLY_ATTENDANCE_SUMMARY',
       'Monthly Attendance Summary',
       CONCAT(
         'This month — Present: ',
         SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END),
         ', Half days: ',
         SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END),
         ', Absent: ',
         SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END),
         ', Leave: ',
         SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END),
         ', Total worked: ',
         FLOOR(COALESCE(SUM(a.total_work_minutes), 0) / 60),
         ' hours ',
         MOD(COALESCE(SUM(a.total_work_minutes), 0), 60),
         ' minutes.'
       ),
       'ATTENDANCE_SUMMARY',
       NULL
     FROM employees e
     LEFT JOIN attendance a
       ON a.employee_id = e.id
      AND YEAR(a.attendance_date) = YEAR(${INDIA_DATE_SQL})
      AND MONTH(a.attendance_date) = MONTH(${INDIA_DATE_SQL})
     WHERE e.status = 'ACTIVE'
       AND e.role <> 'SUPER_ADMIN'
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.recipient_id = e.id
           AND n.type = 'MONTHLY_ATTENDANCE_SUMMARY'
           AND YEAR(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = YEAR(${INDIA_DATE_SQL})
           AND MONTH(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = MONTH(${INDIA_DATE_SQL})
       )
     GROUP BY e.id`
  );
}

async function safelyRun(name, job) {
  try {
    await runForAllTenants(async (tenant) => {
      try {
        await job();
        console.log(
          `${name} completed for ${tenant.tenant_code}.`
        );
      } catch (error) {
        console.error(
          `${name} failed for ${tenant.tenant_code}:`,
          error.message
        );
      }
    });
  } catch (error) {
    console.error(
      `${name} tenant dispatch failed:`,
      error.message
    );
  }
}

async function sendBirthdayNotifications() {
  const [birthdayEmployees] = await pool.query(
    `SELECT
       id,
       full_name
     FROM employees
     WHERE status = 'ACTIVE'
       AND date_of_birth IS NOT NULL
       AND DAY(date_of_birth) = DAY(${INDIA_DATE_SQL})
       AND MONTH(date_of_birth) = MONTH(${INDIA_DATE_SQL})`
  );

  for (const employee of birthdayEmployees) {
    await pool.query(
      `INSERT INTO notifications (
         recipient_id,
         actor_id,
         type,
         title,
         message,
         reference_type,
         reference_id
       )
       SELECT
         e.id,
         NULL,
         'BIRTHDAY',
         'Birthday Celebration',
         ?,
         'EMPLOYEE',
         ?
       FROM employees e
       WHERE e.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1
           FROM notifications n
           WHERE n.recipient_id = e.id
             AND n.type = 'BIRTHDAY'
             AND n.reference_id = ?
             AND DATE(DATE_ADD(n.created_at, INTERVAL 330 MINUTE)) = ${INDIA_DATE_SQL}
         )`,
      [
        `Today is ${employee.full_name}'s birthday. Wish them a happy birthday!`,
        employee.id,
        employee.id
      ]
    );
  }
}

cron.schedule(
  '0 9 * * 1-5',
  () => safelyRun(
    'Birthday notifications',
    sendBirthdayNotifications
  ),
  { timezone }
);

async function cleanupOldNotifications() {
  await pool.query(
    `DELETE FROM notifications
     WHERE
       (
         type IN (
           'PUNCH_IN_REMINDER',
           'PUNCH_OUT_REMINDER',
           'LUNCH_BREAK',
           'BIRTHDAY'
         )
         AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
       )
       OR
       (
         is_read = 1
         AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
       )
       OR
       (
         created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
       )`
  );
}

export function startAttendanceScheduler() {
  cron.schedule(
    '30 9 * * 1-5',
    () => safelyRun(
      'Punch-in reminders',
      sendPunchInReminders
    ),
    { timezone }
  );

  cron.schedule(
    '0 13 * * 1-5',
    () => safelyRun(
      'Lunch notifications',
      sendLunchBreakNotifications
    ),
    { timezone }
  );

  cron.schedule(
    '30 18 * * 1-5',
    () => safelyRun(
      'Punch-out reminders',
      sendPunchOutReminders
    ),
    { timezone }
  );

  cron.schedule(
    '45 18 * * 5',
    () => safelyRun(
      'Weekly attendance summaries',
      sendWeeklyAttendanceSummaries
    ),
    { timezone }
  );

  cron.schedule(
    '0 19 * * 1-5',
    () => safelyRun(
      'Monthly attendance summaries',
      sendMonthlyAttendanceSummaries
    ),
    { timezone }
  );
cron.schedule(
  '15 2 * * *',
  () => safelyRun(
    'Old notification cleanup',
    cleanupOldNotifications
  ),
  { timezone }
);

  console.log(
    'Attendance notification scheduler started.'
  );
}