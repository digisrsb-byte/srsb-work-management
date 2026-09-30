// Pure rules that turn stored attendance, holidays and approved leave into a per-day status.
// Display only: stored attendance rows and payroll calculations are not changed by these rules.

export const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DEFAULT_WORKING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
export const DAY_OFF_CORRECTION_MESSAGE = 'That day is a weekly off/holiday. No correction needed.';

const STORED_STATUSES = new Set(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'MISSING_PUNCH']);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value) {
  if (!DATE_KEY.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseWorkingDays(value) {
  const codes = String(value || '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => WEEKDAY_CODES.includes(code));
  return codes.length ? [...new Set(codes)] : [...DEFAULT_WORKING_DAYS];
}

export function weekdayIndex(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function monthRange(month) {
  const start = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

// Optional holidays are listed on the calendar but remain scheduled working days.
export function isDayOffHoliday(holiday) {
  return String(holiday?.holiday_type || '').toUpperCase() !== 'OPTIONAL';
}

function leaveForDate(leaves, dateKey) {
  return (leaves || []).find((leave) => leave.start_date <= dateKey && leave.end_date >= dateKey) || null;
}

/**
 * @param {object} input
 * @param {string} input.dateKey   YYYY-MM-DD in the work-location calendar
 * @param {string} input.today     YYYY-MM-DD for "today" from the database clock
 * @param {object} [input.record]  attendance row for the day
 * @param {object[]} [input.holidays] holidays on this date
 * @param {object[]} [input.leaves]   approved leave requests overlapping the date
 * @param {string[]} input.workingDays weekday codes that are scheduled working days
 * @param {string} [input.joiningDate]
 */
export function resolveDay({ dateKey, today, record = null, holidays = [], leaves = [], workingDays, joiningDate = null }) {
  const weekday = weekdayIndex(dateKey);
  const isWeeklyOff = !(workingDays || DEFAULT_WORKING_DAYS).includes(WEEKDAY_CODES[weekday]);
  const offHolidays = holidays.filter(isDayOffHoliday);
  const isHoliday = offHolidays.length > 0;
  const isDayOff = isWeeklyOff || isHoliday;
  const isFuture = dateKey > today;
  const beforeJoining = Boolean(joiningDate && dateKey < String(joiningDate).slice(0, 10));
  const dayOffStatus = isHoliday ? 'HOLIDAY' : 'WEEKLY_OFF';

  let status;
  if (record) {
    const stored = String(record.status || '').toUpperCase();
    if (stored === 'WEEK_OFF') status = 'WEEKLY_OFF';
    else if (stored === 'HOLIDAY') status = 'HOLIDAY';
    else if (record.punch_in && !record.punch_out && dateKey === today) status = 'IN_PROGRESS';
    // A short shift worked on a day off must not count as an absence.
    else if (stored === 'ABSENT' && (isDayOff || isFuture)) status = isDayOff ? dayOffStatus : 'UPCOMING';
    else status = STORED_STATUSES.has(stored) ? stored : 'RECORDED';
  } else if (beforeJoining) {
    status = 'BEFORE_JOINING';
  } else if (isDayOff) {
    status = dayOffStatus;
  } else if (leaveForDate(leaves, dateKey)) {
    status = 'LEAVE';
  } else if (isFuture) {
    status = 'UPCOMING';
  } else if (dateKey === today) {
    status = 'NOT_PUNCHED_IN';
  } else {
    status = 'NOT_MARKED';
  }

  const leave = !record && status === 'LEAVE' ? leaveForDate(leaves, dateKey) : null;

  return {
    date: dateKey,
    weekday,
    status,
    isWeeklyOff,
    isHoliday,
    isDayOff,
    isFuture,
    holidays: holidays.map((holiday) => ({
      name: holiday.holiday_name,
      type: holiday.holiday_type,
      dayOff: isDayOffHoliday(holiday)
    })),
    leave: leave ? { type: leave.leave_type, duration: leave.duration_type || 'FULL_DAY' } : null,
    hasRecord: Boolean(record),
    punchIn: record?.punch_in || null,
    punchOut: record?.punch_out || null,
    workMinutes: record ? Number(record.total_work_minutes || 0) : 0,
    punchOutMissing: Boolean(record?.punch_in && !record?.punch_out && dateKey < today),
    remarks: record?.remarks || null,
    correctable: !isDayOff && !isFuture && !beforeJoining
  };
}

export function summarizeDays(days) {
  const counts = {
    PRESENT: 0,
    HALF_DAY: 0,
    ABSENT: 0,
    LEAVE: 0,
    MISSING_PUNCH: 0,
    WEEKLY_OFF: 0,
    HOLIDAY: 0,
    NOT_MARKED: 0
  };
  let workMinutes = 0;
  let scheduledWorkingDays = 0;
  for (const day of days) {
    if (day.status in counts) counts[day.status] += 1;
    if (day.status === 'IN_PROGRESS') counts.PRESENT += 1;
    workMinutes += day.workMinutes;
    if (!day.isDayOff && day.status !== 'BEFORE_JOINING') scheduledWorkingDays += 1;
  }
  return { counts, workMinutes, scheduledWorkingDays };
}
