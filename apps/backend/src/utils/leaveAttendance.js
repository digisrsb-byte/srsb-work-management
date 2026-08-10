/**
 * Keep attendance rows in sync with approved leave_requests so admin and
 * employee portals read the same LEAVE status from the attendance table.
 */

function formatSqlDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export function eachDateInclusive(startDate, endDate) {
  const start = formatSqlDate(startDate);
  const end = formatSqlDate(endDate);
  if (!start || !end || start > end) return [];

  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function leaveStatusForDuration(durationType) {
  return ['FIRST_HALF', 'SECOND_HALF'].includes(String(durationType || '').toUpperCase())
    ? 'HALF_DAY'
    : 'LEAVE';
}

function leaveRemarks(leaveType, durationType) {
  const typeLabel = String(leaveType || 'LEAVE')
    .replaceAll('_', ' ')
    .toLowerCase();
  const duration = String(durationType || 'FULL_DAY').toUpperCase();
  if (duration === 'FIRST_HALF') return `Approved leave (${typeLabel}, first half)`;
  if (duration === 'SECOND_HALF') return `Approved leave (${typeLabel}, second half)`;
  return `Approved leave (${typeLabel})`;
}

/**
 * Upsert attendance LEAVE/HALF_DAY rows for an approved leave range.
 * Does not overwrite days that already have punch times.
 */
export async function syncApprovedLeaveAttendance(
  connection,
  { employeeId, startDate, endDate, durationType, leaveType }
) {
  const dates = eachDateInclusive(startDate, endDate);
  if (!dates.length) return;

  const status = leaveStatusForDuration(durationType);
  const remarks = leaveRemarks(leaveType, durationType);

  for (const attendanceDate of dates) {
    await connection.query(
      `INSERT INTO attendance (
         employee_id, attendance_date, punch_in, punch_out,
         total_work_minutes, status, remarks
       ) VALUES (?, ?, NULL, NULL, 0, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = IF(
           attendance.punch_in IS NULL AND attendance.punch_out IS NULL,
           VALUES(status),
           attendance.status
         ),
         remarks = IF(
           attendance.punch_in IS NULL AND attendance.punch_out IS NULL,
           VALUES(remarks),
           attendance.remarks
         ),
         updated_at = CURRENT_TIMESTAMP`,
      [employeeId, attendanceDate, status, remarks]
    );
  }
}

/**
 * Backfill attendance for already-approved leave overlapping a date range
 * (fixes historical rows that never wrote into attendance).
 */
export async function backfillApprovedLeaveAttendance(
  connectionOrPool,
  employeeId,
  rangeStart,
  rangeEnd
) {
  const [leaves] = await connectionOrPool.query(
    `SELECT leave_type, duration_type, start_date, end_date
     FROM leave_requests
     WHERE employee_id = ?
       AND status = 'APPROVED'
       AND start_date <= ?
       AND end_date >= ?`,
    [employeeId, rangeEnd, rangeStart]
  );

  for (const leave of leaves) {
    await syncApprovedLeaveAttendance(connectionOrPool, {
      employeeId,
      startDate: leave.start_date,
      endDate: leave.end_date,
      durationType: leave.duration_type,
      leaveType: leave.leave_type
    });
  }
}
