import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';

async function loadGreetingContext(employeeId, departmentId = null) {
  const [holidays] = await pool.query(
    `SELECT h.id, h.holiday_name, h.holiday_date, h.holiday_type,
       h.greeting_message, h.greeting_start_date, h.greeting_end_date
     FROM holidays h
     WHERE h.show_greeting = TRUE
       AND CURDATE() BETWEEN COALESCE(h.greeting_start_date, h.holiday_date)
                         AND COALESCE(h.greeting_end_date, h.holiday_date)
       AND (h.department_id IS NULL OR h.department_id = ?)
     ORDER BY h.holiday_date ASC, h.id ASC`,
    [departmentId]
  );

  const [[ownBirthday]] = await pool.query(
    `SELECT id, full_name, designation
     FROM employees
     WHERE id = ?
       AND date_of_birth IS NOT NULL
       AND DATE_FORMAT(date_of_birth, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d')
     LIMIT 1`,
    [employeeId]
  );

  return { holidays, ownBirthday: ownBirthday || null };
}

export const adminDashboard = asyncHandler(async (req, res) => {
  const [[employeeRow]] = await pool.query(
    `SELECT COUNT(*) total, SUM(e.status = 'ACTIVE') active
     FROM employees e
     WHERE COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'`
  );
  const [[clientRow]] = await pool.query(
    `SELECT COUNT(*) total, SUM(status = 'ACTIVE') active FROM clients`
  );
  const [[openingRow]] = await pool.query(
    `SELECT COUNT(*) total,
       SUM(status NOT IN ('CLOSED','JOINED')) active
     FROM job_openings`
  );
  const [[candidateRow]] = await pool.query(
    `SELECT COUNT(*) total FROM candidates`
  );
  const [[taskRow]] = await pool.query(
    `SELECT COUNT(*) total,
       SUM(status = 'COMPLETED') completed,
       SUM(status IN ('PENDING','IN_PROGRESS','BLOCKED')) pending,
       SUM(status <> 'COMPLETED' AND due_date IS NOT NULL AND due_date < NOW()) overdue
     FROM tasks`
  );
  const [pipeline] = await pool.query(
    `SELECT stage, COUNT(*) value
     FROM candidate_applications
     GROUP BY stage
     ORDER BY value DESC`
  );
  const [employeeBirthdays] = await pool.query(
    `SELECT e.id, e.full_name, e.designation, d.name AS department
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.status = 'ACTIVE'
       AND COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'
       AND e.date_of_birth IS NOT NULL
       AND DATE_FORMAT(e.date_of_birth, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d')
     ORDER BY e.full_name`
  );
  const [candidateBirthdays] = await pool.query(
    `SELECT c.id, c.full_name, c.phone, c.email
     FROM candidates c
     WHERE c.date_of_birth IS NOT NULL
       AND DATE_FORMAT(c.date_of_birth, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d')
     ORDER BY c.full_name`
  );
  const [holidayGreetings] = await pool.query(
    `SELECT h.id, h.holiday_name, h.holiday_date, h.holiday_type,
       h.greeting_message, d.name AS department_name
     FROM holidays h
     LEFT JOIN departments d ON d.id = h.department_id
     WHERE h.show_greeting = TRUE
       AND CURDATE() BETWEEN COALESCE(h.greeting_start_date, h.holiday_date)
                         AND COALESCE(h.greeting_end_date, h.holiday_date)
     ORDER BY h.holiday_date ASC`
  );

  let invoices = null;
  if (req.user.role === 'SUPER_ADMIN') {
    const [[invoiceRow]] = await pool.query(
      `SELECT COUNT(*) total,
         COALESCE(SUM(total_amount), 0) invoiced,
         COALESCE(SUM(paid_amount), 0) received,
         COALESCE(SUM(GREATEST(total_amount - paid_amount, 0)), 0) outstanding
       FROM invoices
       WHERE status <> 'CANCELLED'`
    );
    invoices = invoiceRow;
  }

  res.json({
    success: true,
    data: {
      employees: employeeRow,
      clients: clientRow,
      openings: openingRow,
      candidates: candidateRow,
      tasks: taskRow,
      pipeline,
      invoices,
      greetings: {
        holidays: holidayGreetings,
        employeeBirthdays,
        candidateBirthdays
      }
    }
  });
});

export const employeeDashboard = asyncHandler(async (req, res) => {
  const employeeDbId = req.user.id;

  const [[profile]] = await pool.query(
    `SELECT e.id, e.employee_id, e.full_name, e.email, e.personal_email,
       e.phone, e.alternate_phone, e.designation, e.work_location, e.role,
       e.status, e.department_id, d.name AS department
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = ? LIMIT 1`,
    [employeeDbId]
  );

  const [[attendance]] = await pool.query(
    `SELECT punch_in, punch_out, status,
       CASE
         WHEN punch_in IS NOT NULL AND punch_out IS NULL
         THEN TIMESTAMPDIFF(MINUTE, punch_in, NOW())
         ELSE COALESCE(total_work_minutes, 0)
       END AS total_work_minutes
     FROM attendance
     WHERE employee_id = ? AND attendance_date = CURDATE()`,
    [employeeDbId]
  );

  const [[monthly]] = await pool.query(
    `SELECT COALESCE(SUM(total_work_minutes), 0) minutes,
       SUM(status = 'PRESENT') presentDays,
       SUM(status = 'HALF_DAY') halfDays,
       SUM(status = 'ABSENT') absentDays,
       SUM(status = 'LEAVE') leaveDays,
       SUM(status = 'HOLIDAY') holidayDays
     FROM attendance
     WHERE employee_id = ?
       AND DATE_FORMAT(attendance_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
    [employeeDbId]
  );

  const [[tasks]] = await pool.query(
    `SELECT COUNT(*) total,
       SUM(status = 'COMPLETED') completed,
       SUM(status IN ('PENDING','IN_PROGRESS','BLOCKED')) pending,
       SUM(status <> 'COMPLETED' AND due_date IS NOT NULL AND due_date < NOW()) overdue
     FROM tasks
     WHERE assigned_to = ?`,
    [employeeDbId]
  );

  const [[leaveRequests]] = await pool.query(
    `SELECT SUM(status = 'PENDING') pending
     FROM leave_requests
     WHERE employee_id = ?`,
    [employeeDbId]
  );

  const [recentAttendance] = await pool.query(
    `SELECT attendance_date, punch_in, punch_out, status, total_work_minutes
     FROM attendance
     WHERE employee_id = ?
     ORDER BY attendance_date DESC
     LIMIT 7`,
    [employeeDbId]
  );

  const greetings = await loadGreetingContext(employeeDbId, profile?.department_id || null);

  res.json({
    success: true,
    data: {
      profile: profile || null,
      attendance: attendance || null,
      monthly,
      tasks,
      leaveRequests,
      recentAttendance,
      greetings
    }
  });
});
