import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const adminDashboard = asyncHandler(async (req, res) => {
  const employeeVisibilityClause =
    req.user.role === 'SUPER_ADMIN'
      ? ''
      : req.user.role === 'ADMIN'
        ? "WHERE e.role <> 'SUPER_ADMIN'"
        : "WHERE e.role NOT IN ('SUPER_ADMIN','ADMIN')";

  const [[employeeRow]] = await pool.query(
    `SELECT
       COUNT(*) total,
       SUM(e.status = 'ACTIVE') active
     FROM employees e
     WHERE e.account_type = 'EMPLOYEE'`
  );
  const [[clientRow]] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(status='ACTIVE') active
       FROM clients`
  );
  const [[openingRow]] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(status NOT IN ('CLOSED','JOINED')) active
       FROM job_openings`
  );
  const [[candidateRow]] = await pool.query(`SELECT COUNT(*) total FROM candidates`);
  const [[taskRow]] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(status='COMPLETED') completed,
            SUM(status IN ('TODO','IN_PROGRESS','BLOCKED')) pending
       FROM tasks`
  );

  const [pipeline] = await pool.query(
    `SELECT stage, COUNT(*) value FROM candidate_applications GROUP BY stage ORDER BY value DESC`
  );

  res.json({
    success: true,
    data: {
      employees: employeeRow,
      clients: clientRow,
      openings: openingRow,
      candidates: candidateRow,
      tasks: taskRow,
      pipeline
    }
  });
});
export const employeeDashboard = asyncHandler(async (req, res) => {
  const employeeDbId = req.user.id;

  const [[profile]] = await pool.query(
    `SELECT
       e.id,
       e.employee_id,
       e.full_name,
       e.email,
       e.personal_email,
       e.phone,
       e.alternate_phone,
       e.designation,
       e.work_location,
       e.role,
       e.status,
       d.name AS department
     FROM employees e
     LEFT JOIN departments d
       ON d.id = e.department_id
     WHERE e.id = ?
     LIMIT 1`,
    [employeeDbId]
  );

  const [[attendance]] = await pool.query(
    `SELECT
       punch_in,
       punch_out,
       status,
       CASE
         WHEN punch_in IS NOT NULL
           AND punch_out IS NULL
         THEN TIMESTAMPDIFF(
           MINUTE,
           punch_in,
           NOW()
         )
         ELSE COALESCE(total_work_minutes, 0)
       END AS total_work_minutes
     FROM attendance
     WHERE employee_id = ?
       AND attendance_date = CURDATE()`,
    [employeeDbId]
  );

  const [[monthly]] = await pool.query(
    `SELECT
       COALESCE(SUM(total_work_minutes), 0) minutes,
       SUM(status = 'PRESENT') presentDays,
       SUM(status = 'HALF_DAY') halfDays
     FROM attendance
     WHERE employee_id = ?
       AND DATE_FORMAT(attendance_date, '%Y-%m') =
           DATE_FORMAT(CURDATE(), '%Y-%m')`,
    [employeeDbId]
  );

  const [[tasks]] = await pool.query(
    `SELECT
       COUNT(*) total,
       SUM(status = 'COMPLETED') completed,
       SUM(
         status IN (
           'TODO',
           'IN_PROGRESS',
           'BLOCKED'
         )
       ) pending
     FROM tasks
     WHERE assigned_to = ?`,
    [employeeDbId]
  );

  const [[leaveRequests]] = await pool.query(
    `SELECT
       SUM(status = 'PENDING') pending
     FROM leave_requests
     WHERE employee_id = ?`,
    [employeeDbId]
  );

  const [recentAttendance] = await pool.query(
    `SELECT
       attendance_date,
       punch_in,
       punch_out,
       status,
       total_work_minutes
     FROM attendance
     WHERE employee_id = ?
     ORDER BY attendance_date DESC
     LIMIT 7`,
    [employeeDbId]
  );

  res.json({
    success: true,
    data: {
      profile: profile || null,
      attendance: attendance || null,
      monthly,
      tasks,
      leaveRequests,
      recentAttendance
    }
  });
});