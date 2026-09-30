import { pool } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { INDIA_DATE_SQL, INDIA_NOW_SQL } from '../utils/indiaTime.js';
import { parseWorkingDays, resolveDay, addDays } from './attendanceDayRules.js';

// Today's open punch counts up live; closed days use the minutes stored at punch-out.
export const WORK_MINUTES_SQL = `CASE
           WHEN punch_in IS NOT NULL
             AND punch_out IS NULL
             AND attendance_date = ${INDIA_DATE_SQL}
           THEN GREATEST(TIMESTAMPDIFF(
             MINUTE,
             punch_in,
             ${INDIA_NOW_SQL}
           ), 0)
           ELSE GREATEST(COALESCE(total_work_minutes, 0), 0)
         END`;

// The work week comes from the company's active office shift (Settings > Office shifts).
export async function getEmployeeSchedule(employeeId, executor = pool) {
  const [[employee]] = await executor.query(
    `SELECT
       company_id,
       department_id,
       DATE_FORMAT(joining_date, '%Y-%m-%d') AS joining_date,
       DATE_FORMAT(${INDIA_DATE_SQL}, '%Y-%m-%d') AS today
     FROM employees
     WHERE id = ?
     LIMIT 1`,
    [employeeId]
  );
  if (!employee) throw new AppError('Employee not found.', 404);

  const [shifts] = employee.company_id
    ? await executor.query(
        `SELECT working_days
         FROM company_office_shifts
         WHERE company_id = ? AND status = 'ACTIVE'
         ORDER BY id ASC
         LIMIT 1`,
        [employee.company_id]
      )
    : [[]];

  return {
    companyId: employee.company_id,
    departmentId: employee.department_id,
    joiningDate: employee.joining_date || null,
    today: employee.today,
    workingDays: parseWorkingDays(shifts[0]?.working_days),
    workWeekSource: shifts.length ? 'COMPANY_SHIFT' : 'DEFAULT'
  };
}

export async function getScheduleInputs(employeeId, schedule, start, end, executor = pool) {
  const [records] = await executor.query(
    `SELECT
       DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
       punch_in,
       punch_out,
       ${WORK_MINUTES_SQL} AS total_work_minutes,
       status,
       remarks
     FROM attendance
     WHERE employee_id = ?
       AND attendance_date BETWEEN ? AND ?
     ORDER BY attendance_date ASC`,
    [employeeId, start, end]
  );

  const [holidays] = await executor.query(
    `SELECT
       DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
       holiday_name,
       holiday_type
     FROM holidays
     WHERE holiday_date BETWEEN ? AND ?
       AND (company_id IS NULL OR company_id = ?)
       AND (department_id IS NULL OR department_id = ?)
     ORDER BY holiday_date ASC, holiday_name ASC`,
    [start, end, schedule.companyId, schedule.departmentId]
  );

  const [leaves] = await executor.query(
    `SELECT
       DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
       DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
       leave_type,
       duration_type
     FROM leave_requests
     WHERE employee_id = ?
       AND status = 'APPROVED'
       AND start_date <= ?
       AND end_date >= ?`,
    [employeeId, end, start]
  );

  return { records, holidays, leaves };
}

export function resolveRange(schedule, inputs, start, end) {
  const recordsByDate = new Map(inputs.records.map((row) => [row.attendance_date, row]));
  const holidaysByDate = new Map();
  for (const holiday of inputs.holidays) {
    const list = holidaysByDate.get(holiday.holiday_date) || [];
    list.push(holiday);
    holidaysByDate.set(holiday.holiday_date, list);
  }

  const days = [];
  for (let dateKey = start; dateKey <= end; dateKey = addDays(dateKey, 1)) {
    days.push(
      resolveDay({
        dateKey,
        today: schedule.today,
        record: recordsByDate.get(dateKey) || null,
        holidays: holidaysByDate.get(dateKey) || [],
        leaves: inputs.leaves,
        workingDays: schedule.workingDays,
        joiningDate: schedule.joiningDate
      })
    );
  }
  return days;
}

export async function resolveEmployeeDay(employeeId, dateKey, executor = pool) {
  const schedule = await getEmployeeSchedule(employeeId, executor);
  const inputs = await getScheduleInputs(employeeId, schedule, dateKey, dateKey, executor);
  return { schedule, day: resolveRange(schedule, inputs, dateKey, dateKey)[0] };
}
