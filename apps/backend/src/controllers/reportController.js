import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  assertPermission,
  getCompanyIdsForUser,
  assertCompanyAccess
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';

function numberValue(value) {
  return Number(value || 0);
}
async function createReportNotification({
  recipientId,
  startDate,
  endDate
}) {
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
       ?,
       ?,
       'REPORT_GENERATED',
       'Company Report Generated',
       ?,
       'COMPANY_REPORT',
       NULL
     WHERE NOT EXISTS (
       SELECT 1
       FROM notifications
       WHERE recipient_id = ?
         AND type = 'REPORT_GENERATED'
         AND message = ?
         AND DATE(created_at) = CURDATE()
     )`,
    [
      recipientId,
      recipientId,
      `Company report for ${startDate} to ${endDate} was generated successfully.`,
      recipientId,
      `Company report for ${startDate} to ${endDate} was generated successfully.`
    ]
  );
}
export const getCompanyReport = asyncHandler(
  async (req, res) => {
    await assertPermission(req.user, 'reports', 'view');

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new AppError(
        'Start date and end date are required.',
        400
      );
    }

    if (new Date(startDate) > new Date(endDate)) {
      throw new AppError(
        'Start date cannot be after end date.',
        400
      );
    }

    const companyIds = await getCompanyIdsForUser(req.user);
    if (req.user.role !== 'SUPER_ADMIN' && !companyIds.length) {
      throw new AppError(
        'No company scope is assigned. Ask Super Admin to grant company access.',
        403
      );
    }

    const isSuper = req.user.role === 'SUPER_ADMIN';
    const empScope = isSuper ? '' : ' AND company_id IN (?)';
    const empScopeE = isSuper ? '' : ' AND e.company_id IN (?)';
    const scopeParams = isSuper ? [] : [companyIds];

    const canViewFinance = false; // Finance reporting disabled for this release

    const [[employeeSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_employees,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END)
           AS active_employees,
         SUM(CASE WHEN status <> 'ACTIVE' THEN 1 ELSE 0 END)
           AS inactive_employees,
         SUM(
           CASE
             WHEN joining_date BETWEEN ? AND ?
             THEN 1
             ELSE 0
           END
         ) AS employees_joined
       FROM employees
       WHERE account_type = 'EMPLOYEE' AND is_demo = 0${empScope}`,
      [startDate, endDate, ...scopeParams]
    );

    const [employees] = await pool.query(
      `SELECT
         e.id,
         e.employee_id,
         e.full_name,
         e.email,
         e.phone,
         e.role,
         e.designation,
         e.status,
         e.joining_date,
         d.name AS department
       FROM employees e
       LEFT JOIN departments d
         ON d.id = e.department_id
       WHERE e.account_type = 'EMPLOYEE' AND e.is_demo = 0${empScopeE}
       ORDER BY e.full_name ASC`,
      scopeParams
    );

    const [[attendanceSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_records,
         SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END)
           AS present_count,
         SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END)
           AS absent_count,
         SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END)
           AS half_day_count,
         SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END)
           AS leave_count,
         SUM(CASE WHEN a.status = 'HOLIDAY' THEN 1 ELSE 0 END)
           AS holiday_count,
         SUM(CASE WHEN a.status = 'WEEK_OFF' THEN 1 ELSE 0 END)
           AS week_off_count,
         SUM(CASE WHEN a.status = 'MISSING_PUNCH' THEN 1 ELSE 0 END)
           AS missing_punch_count,
         COALESCE(SUM(a.total_work_minutes), 0)
           AS total_work_minutes
       FROM attendance a
       INNER JOIN employees e ON e.id = a.employee_id
       WHERE a.attendance_date BETWEEN ? AND ?${empScopeE}`,
      [startDate, endDate, ...scopeParams]
    );

    const [attendanceByEmployee] = await pool.query(
      `SELECT
         e.employee_id,
         e.full_name,
         COUNT(a.id) AS attendance_records,
         SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END)
           AS present_days,
         SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END)
           AS absent_days,
         SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END)
           AS half_days,
         SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END)
           AS leave_days,
         COALESCE(SUM(a.total_work_minutes), 0)
           AS total_work_minutes
       FROM employees e
       LEFT JOIN attendance a
         ON a.employee_id = e.id
        AND a.attendance_date BETWEEN ? AND ?
       WHERE e.account_type = 'EMPLOYEE' AND e.is_demo = 0${empScopeE}
       GROUP BY
         e.id,
         e.employee_id,
         e.full_name
       ORDER BY e.full_name ASC`,
      [startDate, endDate, ...scopeParams]
    );

    const [[leaveSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_requests,
         SUM(CASE WHEN lr.status = 'PENDING' THEN 1 ELSE 0 END)
           AS pending_requests,
         SUM(CASE WHEN lr.status = 'APPROVED' THEN 1 ELSE 0 END)
           AS approved_requests,
         SUM(CASE WHEN lr.status = 'REJECTED' THEN 1 ELSE 0 END)
           AS rejected_requests,
         SUM(CASE WHEN lr.status = 'CANCELLED' THEN 1 ELSE 0 END)
           AS cancelled_requests
       FROM leave_requests lr
       INNER JOIN employees e ON e.id = lr.employee_id
       WHERE lr.created_at >= ?
         AND lr.created_at < DATE_ADD(?, INTERVAL 1 DAY)${empScopeE}`,
      [startDate, endDate, ...scopeParams]
    );

    const [leaveRequests] = await pool.query(
      `SELECT
         lr.id,
         e.employee_id,
         e.full_name AS employee_name,
         lr.leave_type,
         lr.start_date,
         lr.end_date,
         lr.duration_type,
         lr.reason,
         lr.status,
         reviewer.full_name AS reviewed_by_name,
         lr.reviewer_comment,
         lr.reviewed_at,
         lr.created_at
       FROM leave_requests lr
       JOIN employees e
         ON e.id = lr.employee_id
       LEFT JOIN employees reviewer
         ON reviewer.id = lr.reviewed_by
       WHERE lr.created_at >= ?
         AND lr.created_at < DATE_ADD(?, INTERVAL 1 DAY)${empScopeE}
       ORDER BY lr.created_at DESC`,
      [startDate, endDate, ...scopeParams]
    );

    const [[clientSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_clients,
         SUM(
           CASE
             WHEN created_at >= ?
              AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
             THEN 1
             ELSE 0
           END
         ) AS clients_added
       FROM clients`,
      [startDate, endDate]
    );

    const [clients] = await pool.query(
      `SELECT
         c.id,
         c.company_name,
         c.industry,
         c.website,
         c.contact_name,
         c.contact_email,
         c.contact_phone,
         c.status,
         c.created_at,
         e.full_name AS onboarded_by_name
       FROM clients c
       LEFT JOIN employees e
         ON e.id = c.onboarded_by
       ORDER BY c.company_name ASC`
    );

    const [[openingSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_requirements,
         COALESCE(SUM(openings_count), 0)
           AS total_positions,
         SUM(
           CASE
             WHEN status IN (
               'OPEN',
               'SOURCING',
               'SCREENING',
               'INTERVIEW',
               'OFFERED'
             )
             THEN 1
             ELSE 0
           END
         ) AS active_requirements,
         SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END)
           AS closed_requirements,
         SUM(CASE WHEN status = 'ON_HOLD' THEN 1 ELSE 0 END)
           AS on_hold_requirements
       FROM job_openings
       WHERE created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [startDate, endDate]
    );

    const [openings] = await pool.query(
      `SELECT
         jo.id,
         c.company_name,
         jo.title,
         jo.location,
         jo.openings_count,
         jo.experience_min,
         jo.experience_max,
         jo.priority,
         jo.status,
         jo.opened_date,
         jo.target_close_date,
         jo.closed_date,
         recruiter.full_name AS assigned_recruiter_name,
         (
           SELECT COUNT(*)
           FROM candidate_applications ca
           WHERE ca.opening_id = jo.id
             AND ca.stage = 'JOINED'
         ) AS filled_positions
       FROM job_openings jo
       JOIN clients c
         ON c.id = jo.client_id
       LEFT JOIN employees recruiter
         ON recruiter.id = jo.assigned_recruiter_id
       WHERE jo.created_at >= ?
         AND jo.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY
         c.company_name ASC,
         jo.created_at DESC`,
      [startDate, endDate]
    );

    const openingRows = openings.map((opening) => {
      const totalPositions = numberValue(
        opening.openings_count
      );

      const filledPositions = numberValue(
        opening.filled_positions
      );

      return {
        ...opening,
        remaining_positions: Math.max(
          totalPositions - filledPositions,
          0
        )
      };
    });

    const [[candidateSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS candidates_added
       FROM candidates
       WHERE created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [startDate, endDate]
    );

    const [[applicationSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_applications,
         SUM(CASE WHEN stage = 'SOURCED' THEN 1 ELSE 0 END)
           AS sourced,
         SUM(CASE WHEN stage = 'SCREENING' THEN 1 ELSE 0 END)
           AS screening,
         SUM(CASE WHEN stage = 'SHORTLISTED' THEN 1 ELSE 0 END)
           AS shortlisted,
         SUM(CASE WHEN stage = 'INTERVIEW' THEN 1 ELSE 0 END)
           AS interview,
         SUM(CASE WHEN stage = 'OFFERED' THEN 1 ELSE 0 END)
           AS offered,
         SUM(CASE WHEN stage = 'JOINED' THEN 1 ELSE 0 END)
           AS joined,
         SUM(CASE WHEN stage = 'REJECTED' THEN 1 ELSE 0 END)
           AS rejected,
         SUM(CASE WHEN stage = 'WITHDRAWN' THEN 1 ELSE 0 END)
           AS withdrawn
       FROM candidate_applications
       WHERE last_updated >= ?
         AND last_updated < DATE_ADD(?, INTERVAL 1 DAY)`,
      [startDate, endDate]
    );

    const [candidateApplications] = await pool.query(
      `SELECT
         candidate.full_name AS candidate_name,
         candidate.email AS candidate_email,
         candidate.phone AS candidate_phone,
         client.company_name,
         opening.title AS job_role,
         ca.stage,
         recruiter.full_name AS assigned_recruiter_name,
         creator.full_name AS candidate_added_by_name,
         ca.last_updated
       FROM candidate_applications ca
       JOIN candidates candidate
         ON candidate.id = ca.candidate_id
       JOIN job_openings opening
         ON opening.id = ca.opening_id
       JOIN clients client
         ON client.id = opening.client_id
       LEFT JOIN employees recruiter
         ON recruiter.id = ca.assigned_recruiter_id
       LEFT JOIN employees creator
         ON creator.id = candidate.created_by
       WHERE ca.last_updated >= ?
         AND ca.last_updated < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY ca.last_updated DESC`,
      [startDate, endDate]
    );

    const [[taskSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_tasks,
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)
           AS pending_tasks,
         SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END)
           AS in_progress_tasks,
         SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END)
           AS blocked_tasks,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)
           AS completed_tasks,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END)
           AS cancelled_tasks
       FROM tasks
       WHERE created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [startDate, endDate]
    );

    const [tasks] = await pool.query(
      `SELECT
         t.id,
         t.title,
         t.description,
         assignee.full_name AS assigned_to_name,
         assigner.full_name AS assigned_by_name,
         t.due_date,
         t.priority,
         t.status,
         t.progress,
         t.created_at,
         t.updated_at
       FROM tasks t
       JOIN employees assignee
         ON assignee.id = t.assigned_to
       LEFT JOIN employees assigner
         ON assigner.id = t.assigned_by
       WHERE t.created_at >= ?
         AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY t.created_at DESC`,
      [startDate, endDate]
    );

    let finance = null;

    if (canViewFinance) {
      const [[invoiceSummary]] = await pool.query(
        `SELECT
           COUNT(*) AS total_invoices,
           COALESCE(SUM(total_amount), 0)
             AS invoiced_amount,
           COALESCE(
             SUM(
               CASE
                 WHEN status = 'PAID'
                 THEN total_amount
                 ELSE 0
               END
             ),
             0
           ) AS paid_invoice_amount,
           COALESCE(
             SUM(
               CASE
                 WHEN status IN (
                   'PENDING',
                   'PARTIALLY_PAID',
                   'OVERDUE'
                 )
                 THEN total_amount
                 ELSE 0
               END
             ),
             0
           ) AS outstanding_invoice_amount
         FROM invoices
         WHERE invoice_date BETWEEN ? AND ?`,
        [startDate, endDate]
      );

      const [[expenseSummary]] = await pool.query(
        `SELECT
           COUNT(*) AS total_expenses,
           COALESCE(SUM(amount), 0)
             AS expense_amount
         FROM expenses
         WHERE expense_date BETWEEN ? AND ?`,
        [startDate, endDate]
      );

      const invoicedAmount = numberValue(
        invoiceSummary.invoiced_amount
      );

      const expenseAmount = numberValue(
        expenseSummary.expense_amount
      );

      finance = {
        invoices: {
          total: numberValue(
            invoiceSummary.total_invoices
          ),
          invoicedAmount,
          paidAmount: numberValue(
            invoiceSummary.paid_invoice_amount
          ),
          outstandingAmount: numberValue(
            invoiceSummary.outstanding_invoice_amount
          )
        },
        expenses: {
          total: numberValue(
            expenseSummary.total_expenses
          ),
          amount: expenseAmount
        },
        netResult: invoicedAmount - expenseAmount
      };
    }
await createReportNotification({
  recipientId: req.user.id,
  startDate,
  endDate
});

    res.json({
      success: true,
      data: {
        reportPeriod: {
          startDate,
          endDate
        },

        generatedAt: new Date().toISOString(),

        generatedBy: {
          id: req.user.id,
          role: req.user.role
        },

        summary: {
          employees: {
            total: numberValue(
              employeeSummary.total_employees
            ),
            active: numberValue(
              employeeSummary.active_employees
            ),
            inactive: numberValue(
              employeeSummary.inactive_employees
            ),
            joinedDuringPeriod: numberValue(
              employeeSummary.employees_joined
            )
          },

          attendance: {
            totalRecords: numberValue(
              attendanceSummary.total_records
            ),
            present: numberValue(
              attendanceSummary.present_count
            ),
            absent: numberValue(
              attendanceSummary.absent_count
            ),
            halfDay: numberValue(
              attendanceSummary.half_day_count
            ),
            leave: numberValue(
              attendanceSummary.leave_count
            ),
            holiday: numberValue(
              attendanceSummary.holiday_count
            ),
            weekOff: numberValue(
              attendanceSummary.week_off_count
            ),
            missingPunch: numberValue(
              attendanceSummary.missing_punch_count
            ),
            totalWorkMinutes: numberValue(
              attendanceSummary.total_work_minutes
            )
          },

          leaveRequests: {
            total: numberValue(
              leaveSummary.total_requests
            ),
            pending: numberValue(
              leaveSummary.pending_requests
            ),
            approved: numberValue(
              leaveSummary.approved_requests
            ),
            rejected: numberValue(
              leaveSummary.rejected_requests
            ),
            cancelled: numberValue(
              leaveSummary.cancelled_requests
            )
          },

          clients: {
            total: numberValue(
              clientSummary.total_clients
            ),
            addedDuringPeriod: numberValue(
              clientSummary.clients_added
            )
          },

          openings: {
            totalRequirements: numberValue(
              openingSummary.total_requirements
            ),
            totalPositions: numberValue(
              openingSummary.total_positions
            ),
            active: numberValue(
              openingSummary.active_requirements
            ),
            closed: numberValue(
              openingSummary.closed_requirements
            ),
            onHold: numberValue(
              openingSummary.on_hold_requirements
            )
          },

          candidates: {
            added: numberValue(
              candidateSummary.candidates_added
            ),
            applications: numberValue(
              applicationSummary.total_applications
            ),
            sourced: numberValue(
              applicationSummary.sourced
            ),
            screening: numberValue(
              applicationSummary.screening
            ),
            shortlisted: numberValue(
              applicationSummary.shortlisted
            ),
            interview: numberValue(
              applicationSummary.interview
            ),
            offered: numberValue(
              applicationSummary.offered
            ),
            joined: numberValue(
              applicationSummary.joined
            ),
            rejected: numberValue(
              applicationSummary.rejected
            ),
            withdrawn: numberValue(
              applicationSummary.withdrawn
            )
          },

          tasks: {
            total: numberValue(
              taskSummary.total_tasks
            ),
            pending: numberValue(
              taskSummary.pending_tasks
            ),
            inProgress: numberValue(
              taskSummary.in_progress_tasks
            ),
            blocked: numberValue(
              taskSummary.blocked_tasks
            ),
            completed: numberValue(
              taskSummary.completed_tasks
            ),
            cancelled: numberValue(
              taskSummary.cancelled_tasks
            )
          }
        },

        employees,
        attendanceByEmployee,
        leaveRequests,
        clients,
        openings: openingRows,
        candidateApplications,
        tasks,
        finance
      }
    });
  }
);

export const getHeadcountReport = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'reports', 'view');
  const asOf = req.query.asOfDate || new Date().toISOString().slice(0, 10);
  const companyIds = await getCompanyIdsForUser(req.user);

  if (req.user.role !== 'SUPER_ADMIN' && !companyIds.length) {
    throw new AppError(
      'No company scope is assigned. Ask Super Admin to grant company access.',
      403
    );
  }

  const scopeSql =
    req.user.role === 'SUPER_ADMIN' ? '' : ' AND e.company_id IN (?)';
  const summaryParams =
    req.user.role === 'SUPER_ADMIN'
      ? [asOf, asOf, asOf]
      : [asOf, asOf, asOf, companyIds];

  const [[summary]] = await pool.query(
    `SELECT
       SUM(CASE WHEN e.status = 'ACTIVE' AND (e.joining_date IS NULL OR e.joining_date <= ?) THEN 1 ELSE 0 END) AS active_employees,
       SUM(CASE WHEN e.status <> 'ACTIVE' THEN 1 ELSE 0 END) AS inactive_employees,
       SUM(CASE WHEN e.joining_date IS NOT NULL AND MONTH(e.joining_date) = MONTH(?) AND YEAR(e.joining_date) = YEAR(?) THEN 1 ELSE 0 END) AS joiners_this_month
     FROM employees e
     WHERE e.is_demo = 0${scopeSql}`,
    summaryParams
  );

  const [rows] = await pool.query(
    `SELECT e.id, e.employee_id, e.full_name, e.role, e.status, e.joining_date, c.name AS company_name, d.name AS department
     FROM employees e
     LEFT JOIN companies c ON c.id = e.company_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.is_demo = 0${scopeSql}
     ORDER BY e.full_name`,
    req.user.role === 'SUPER_ADMIN' ? [] : [companyIds]
  );

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      asOf,
      summary: summary || {},
      rows
    }
  });
});

export const getAttendanceReport = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'reports', 'view');
  const { startDate, endDate, employeeId, companyId } = req.query;
  if (!startDate || !endDate) throw new AppError('Start and end date are required.', 400);

  const companyIds = await getCompanyIdsForUser(req.user);
  let sql = `
    SELECT a.*, e.full_name, e.employee_id AS emp_code, c.name AS company_name
    FROM attendance a
    INNER JOIN employees e ON e.id = a.employee_id
    LEFT JOIN companies c ON c.id = e.company_id
    WHERE a.attendance_date BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) {
      throw new AppError(
        'No company scope is assigned. Ask Super Admin to grant company access.',
        403
      );
    }
    sql += ' AND e.company_id IN (?)';
    params.push(companyIds);
  }
  if (companyId) {
    await assertCompanyAccess(req.user, Number(companyId));
    sql += ' AND e.company_id = ?';
    params.push(Number(companyId));
  }
  if (employeeId) {
    sql += ' AND e.id = ?';
    params.push(Number(employeeId));
  }
  sql += ' ORDER BY a.attendance_date DESC, e.full_name';

  const [rows] = await pool.query(sql, params);
  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      startDate,
      endDate,
      summary: {
        total: rows.length,
        present: rows.filter((r) => r.status === 'PRESENT').length,
        absent: rows.filter((r) => r.status === 'ABSENT').length,
        exceptions: rows.filter((r) => ['MISSING_PUNCH', 'HALF_DAY'].includes(r.status)).length
      },
      rows
    }
  });
});

export const getPayrollReport = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'reports', 'view');
  const companyIds = await getCompanyIdsForUser(req.user);
  const { year, month, status } = req.query;

  let sql = `
    SELECT pr.*, c.name AS company_name,
      (SELECT COUNT(*) FROM payroll_run_items pri WHERE pri.run_id = pr.id) AS employee_count,
      (SELECT COALESCE(SUM(pri.net_pay),0) FROM payroll_run_items pri WHERE pri.run_id = pr.id) AS total_net
    FROM payroll_runs pr
    INNER JOIN companies c ON c.id = pr.company_id
    WHERE 1=1
  `;
  const params = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) {
      throw new AppError(
        'No company scope is assigned. Ask Super Admin to grant company access.',
        403
      );
    }
    sql += ' AND pr.company_id IN (?)';
    params.push(companyIds);
  }
  if (year) { sql += ' AND pr.period_year = ?'; params.push(Number(year)); }
  if (month) { sql += ' AND pr.period_month = ?'; params.push(Number(month)); }
  if (status) { sql += ' AND pr.status = ?'; params.push(status); }
  sql += ' ORDER BY pr.period_year DESC, pr.period_month DESC';

  const [rows] = await pool.query(sql, params);
  const summary = {
    run_count: rows.length,
    total_net: rows.reduce((sum, row) => sum + Number(row.total_net || 0), 0),
    employee_count: rows.reduce((sum, row) => sum + Number(row.employee_count || 0), 0),
    draft: rows.filter((r) => r.status === 'DRAFT').length,
    approved: rows.filter((r) => ['APPROVED', 'LOCKED', 'PAID'].includes(r.status)).length
  };

  res.json({
    success: true,
    data: { generatedAt: new Date().toISOString(), summary, rows }
  });
});

export const getClientWiseReport = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'reports', 'view');
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) throw new AppError('Start and end date are required.', 400);

  const companyIds = await getCompanyIdsForUser(req.user);
  if (req.user.role !== 'SUPER_ADMIN' && !companyIds.length) {
    throw new AppError(
      'No company scope is assigned. Ask Super Admin to grant company access.',
      403
    );
  }

  // Clients have no company_id — scope via onboarded_by employee or allocated employees.
  let clientSql = `
    SELECT
      c.id,
      c.company_name,
      c.status,
      COUNT(DISTINCT CASE
        WHEN jo.created_at >= ? AND jo.created_at < DATE_ADD(?, INTERVAL 1 DAY)
        THEN jo.id END) AS openings,
      COUNT(DISTINCT CASE
        WHEN ca.last_updated >= ? AND ca.last_updated < DATE_ADD(?, INTERVAL 1 DAY)
        THEN ca.id END) AS applications
    FROM clients c
    LEFT JOIN job_openings jo ON jo.client_id = c.id
    LEFT JOIN candidate_applications ca ON ca.opening_id = jo.id
    LEFT JOIN employees onboarder ON onboarder.id = c.onboarded_by
    WHERE 1=1
  `;
  const clientParams = [startDate, endDate, startDate, endDate];

  if (req.user.role !== 'SUPER_ADMIN') {
    clientSql += `
      AND (
        onboarder.company_id IN (?)
        OR EXISTS (
          SELECT 1
          FROM employee_client_allocations eca
          INNER JOIN employees e ON e.id = eca.employee_id
          WHERE eca.client_id = c.id
            AND e.company_id IN (?)
        )
      )
    `;
    clientParams.push(companyIds, companyIds);
  }

  clientSql += ' GROUP BY c.id ORDER BY c.company_name';

  const [clients] = await pool.query(clientSql, clientParams);

  const rows = [];
  for (const client of clients) {
    let allocSql = `
      SELECT eca.*, e.full_name, e.employee_id, e.company_id
      FROM employee_client_allocations eca
      INNER JOIN employees e ON e.id = eca.employee_id
      WHERE eca.client_id = ?
        AND eca.effective_from <= ?
        AND (eca.effective_to IS NULL OR eca.effective_to >= ?)
    `;
    const allocParams = [client.id, endDate, startDate];
    if (req.user.role !== 'SUPER_ADMIN') {
      allocSql += ' AND e.company_id IN (?)';
      allocParams.push(companyIds);
    }

    const [alloc] = await pool.query(allocSql, allocParams);

    let payrollCost = null;
    let payrollCostNote =
      'Payroll cost not shown: allocation method or assignment history incomplete.';
    if (alloc.length) {
      let total = 0;
      let complete = true;
      for (const row of alloc) {
        const [pay] = await pool.query(
          `SELECT COALESCE(SUM(pri.net_pay),0) AS amount
           FROM payroll_run_items pri
           INNER JOIN payroll_runs pr ON pr.id = pri.run_id
           WHERE pri.employee_id = ?
             AND pr.status IN ('APPROVED','LOCKED','PAID')
             AND STR_TO_DATE(CONCAT(pr.period_year, '-', LPAD(pr.period_month, 2, '0'), '-01'), '%Y-%m-%d')
                 BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND LAST_DAY(?)`,
          [row.employee_id, startDate, endDate]
        );
        if (pay[0].amount == null) complete = false;
        total += Number(pay[0].amount || 0) * (Number(row.allocation_percent) / 100);
      }
      if (complete) {
        payrollCost = Number(total.toFixed(2));
        payrollCostNote = null;
      }
    }

    rows.push({
      ...client,
      assigned_headcount: alloc.length,
      allocations: alloc,
      payroll_cost: payrollCost,
      payroll_cost_note: payrollCostNote
    });
  }

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      startDate,
      endDate,
      summary: {
        clients: rows.length,
        openings: rows.reduce((sum, r) => sum + Number(r.openings || 0), 0),
        applications: rows.reduce((sum, r) => sum + Number(r.applications || 0), 0),
        assigned_headcount: rows.reduce(
          (sum, r) => sum + Number(r.assigned_headcount || 0),
          0
        )
      },
      rows
    }
  });
});

export const exportReportAudit = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'reports', 'export');
  const reportType = String(req.body.reportType || 'UNKNOWN');
  await writeAuditLog({
    employeeId: req.user.id,
    action: 'REPORT_EXPORTED',
    entityType: 'reports',
    entityId: reportType,
    newValues: { format: req.body.format || 'CSV', filters: req.body.filters || {} },
    ipAddress: req.ip
  });
  res.json({ success: true, message: 'Export audited.' });
});

export const getOpsSummary = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'reports', 'view');

  const startDate =
    req.query.startDate ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);
  const endDate =
    req.query.endDate || new Date().toISOString().slice(0, 10);
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  const departmentId = req.query.departmentId
    ? Number(req.query.departmentId)
    : null;
  const status = req.query.status || null;

  const companyIds = await getCompanyIdsForUser(req.user);
  if (req.user.role !== 'SUPER_ADMIN' && !companyIds.length) {
    throw new AppError(
      'No company scope is assigned. Ask Super Admin to grant company access.',
      403
    );
  }
  if (companyId) {
    await assertCompanyAccess(req.user, companyId);
  }

  const empFilters = [];
  const empParams = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    empFilters.push('e.company_id IN (?)');
    empParams.push(companyIds);
  }
  if (companyId) {
    empFilters.push('e.company_id = ?');
    empParams.push(companyId);
  }
  if (departmentId) {
    empFilters.push('e.department_id = ?');
    empParams.push(departmentId);
  }
  if (status) {
    empFilters.push('e.status = ?');
    empParams.push(status);
  }
  empFilters.push('e.is_demo = 0');
  const empWhere = `WHERE ${empFilters.join(' AND ')}`;

  const [[employees]] = await pool.query(
    `SELECT
       COUNT(*) AS total_employees,
       SUM(e.status = 'ACTIVE') AS active_employees,
       SUM(e.status <> 'ACTIVE') AS inactive_employees,
       SUM(e.joining_date BETWEEN ? AND ?) AS new_joiners,
       SUM(
         e.status IN ('RESIGNED','TERMINATED','INACTIVE')
         AND e.updated_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
       ) AS employees_left
     FROM employees e
     ${empWhere}`,
    [startDate, endDate, startDate, endDate, ...empParams]
  );

  const attFilters = ['a.attendance_date BETWEEN ? AND ?'];
  const attParams = [startDate, endDate];
  if (req.user.role !== 'SUPER_ADMIN') {
    attFilters.push('e.company_id IN (?)');
    attParams.push(companyIds);
  }
  if (companyId) {
    attFilters.push('e.company_id = ?');
    attParams.push(companyId);
  }
  if (departmentId) {
    attFilters.push('e.department_id = ?');
    attParams.push(departmentId);
  }
  const [[attendance]] = await pool.query(
    `SELECT
       SUM(a.status = 'PRESENT') AS present,
       SUM(a.status = 'ABSENT') AS absent,
       SUM(a.status = 'HALF_DAY') AS half_day,
       SUM(a.status = 'LEAVE') AS on_leave
     FROM attendance a
     INNER JOIN employees e ON e.id = a.employee_id
     WHERE ${attFilters.join(' AND ')}`,
    attParams
  );

  const leaveFilters = [
    'lr.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)'
  ];
  const leaveParams = [startDate, endDate];
  if (req.user.role !== 'SUPER_ADMIN') {
    leaveFilters.push('e.company_id IN (?)');
    leaveParams.push(companyIds);
  }
  if (companyId) {
    leaveFilters.push('e.company_id = ?');
    leaveParams.push(companyId);
  }
  const [[leaves]] = await pool.query(
    `SELECT
       SUM(lr.status = 'PENDING') AS pending,
       SUM(lr.status = 'APPROVED') AS approved,
       SUM(lr.status = 'REJECTED') AS rejected
     FROM leave_requests lr
     INNER JOIN employees e ON e.id = lr.employee_id
     WHERE ${leaveFilters.join(' AND ')}`,
    leaveParams
  );

  const [[openings]] = await pool.query(
    `SELECT
       COUNT(*) AS total_requirements,
       SUM(jo.status NOT IN ('CLOSED','JOINED')) AS active_requirements
     FROM job_openings jo
     WHERE jo.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`,
    [startDate, endDate]
  );

  const [[candidates]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM candidates) AS total_candidates,
       (SELECT COUNT(*) FROM candidate_applications) AS total_applications,
       (SELECT COUNT(*) FROM candidate_applications WHERE stage = 'JOINED') AS joined_candidates`
  );

  const onbFilters = [];
  const onbParams = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    onbFilters.push('oc.company_id IN (?)');
    onbParams.push(companyIds);
  }
  if (companyId) {
    onbFilters.push('oc.company_id = ?');
    onbParams.push(companyId);
  }
  const onbWhere = onbFilters.length ? `WHERE ${onbFilters.join(' AND ')}` : '';
  const [[onboarding]] = await pool.query(
    `SELECT
       SUM(oc.status IN ('PENDING','IN_PROGRESS')) AS pending_cases,
       SUM(oc.status IN ('READY','ACTIVATED')) AS completed_cases
     FROM onboarding_cases oc
     ${onbWhere}`,
    onbParams
  );

  const docFilters = [
    "oci.requirement = 'REQUIRED'",
    "oci.status IN ('PENDING','UPLOADED','SUBMITTED','CORRECTION_REQUIRED','REJECTED')"
  ];
  const docParams = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    docFilters.push('oc.company_id IN (?)');
    docParams.push(companyIds);
  }
  if (companyId) {
    docFilters.push('oc.company_id = ?');
    docParams.push(companyId);
  }
  const [[docs]] = await pool.query(
    `SELECT COUNT(*) AS pending_document_verification
     FROM onboarding_checklist_items oci
     INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
     WHERE ${docFilters.join(' AND ')}`,
    docParams
  );

  const [[tasks]] = await pool.query(
    `SELECT SUM(status IN ('TODO','IN_PROGRESS','BLOCKED')) AS outstanding_tasks
     FROM tasks
     WHERE created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`,
    [startDate, endDate]
  );

  const assetFilters = [];
  const assetParams = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    assetFilters.push('a.company_id IN (?)');
    assetParams.push(companyIds);
  }
  if (companyId) {
    assetFilters.push('a.company_id = ?');
    assetParams.push(companyId);
  }
  const assetWhere = assetFilters.length
    ? `WHERE ${assetFilters.join(' AND ')}`
    : '';
  const [[assets]] = await pool.query(
    `SELECT
       SUM(a.status = 'ASSIGNED') AS assigned_assets,
       (
         SELECT COUNT(*)
         FROM asset_assignments aa
         INNER JOIN assets a2 ON a2.id = aa.asset_id
         WHERE aa.status = 'ACTIVE'
           ${companyId ? 'AND a2.company_id = ?' : ''}
           ${req.user.role !== 'SUPER_ADMIN' ? 'AND a2.company_id IN (?)' : ''}
       ) AS active_assignments
     FROM assets a
     ${assetWhere}`,
    [
      ...assetParams,
      ...(companyId ? [companyId] : []),
      ...(req.user.role !== 'SUPER_ADMIN' ? [companyIds] : [])
    ]
  );

  const summary = {
    totalEmployees: Number(employees.total_employees || 0),
    activeEmployees: Number(employees.active_employees || 0),
    inactiveEmployees: Number(employees.inactive_employees || 0),
    newJoiners: Number(employees.new_joiners || 0),
    employeesLeft: Number(employees.employees_left || 0),
    attendancePresent: Number(attendance.present || 0),
    attendanceAbsent: Number(attendance.absent || 0),
    attendanceHalfDay: Number(attendance.half_day || 0),
    leavePending: Number(leaves.pending || 0),
    leaveApproved: Number(leaves.approved || 0),
    leaveRejected: Number(leaves.rejected || 0),
    totalRequirements: Number(openings.total_requirements || 0),
    activeRequirements: Number(openings.active_requirements || 0),
    totalCandidates: Number(candidates.total_candidates || 0),
    totalApplications: Number(candidates.total_applications || 0),
    joinedCandidates: Number(candidates.joined_candidates || 0),
    pendingOnboarding: Number(onboarding.pending_cases || 0),
    completedOnboarding: Number(onboarding.completed_cases || 0),
    pendingDocumentVerification: Number(docs.pending_document_verification || 0),
    outstandingTasks: Number(tasks.outstanding_tasks || 0),
    assignedAssets: Number(assets.assigned_assets || 0),
    activeAssetAssignments: Number(assets.active_assignments || 0)
  };

  const cards = [
    { key: 'totalEmployees', label: 'Total Employees', value: summary.totalEmployees, path: '/admin/employees' },
    { key: 'activeEmployees', label: 'Active Employees', value: summary.activeEmployees, path: '/admin/employees' },
    { key: 'inactiveEmployees', label: 'Inactive Employees', value: summary.inactiveEmployees, path: '/admin/employees' },
    { key: 'newJoiners', label: 'New Joiners', value: summary.newJoiners, path: '/admin/employees' },
    { key: 'employeesLeft', label: 'Employees Left', value: summary.employeesLeft, path: '/admin/employees' },
    { key: 'attendancePresent', label: 'Attendance Present', value: summary.attendancePresent, path: '/admin/attendance' },
    { key: 'leavePending', label: 'Pending Leave', value: summary.leavePending, path: '/admin/requests' },
    { key: 'leaveApproved', label: 'Approved Leave', value: summary.leaveApproved, path: '/admin/requests' },
    { key: 'leaveRejected', label: 'Rejected Leave', value: summary.leaveRejected, path: '/admin/requests' },
    { key: 'totalRequirements', label: 'Requirements', value: summary.totalRequirements, path: '/admin/openings' },
    { key: 'totalCandidates', label: 'Candidates', value: summary.totalCandidates, path: '/admin/candidates' },
    { key: 'totalApplications', label: 'Applications', value: summary.totalApplications, path: '/admin/candidates' },
    { key: 'joinedCandidates', label: 'Joined Candidates', value: summary.joinedCandidates, path: '/admin/candidates' },
    { key: 'pendingOnboarding', label: 'Pending Onboarding', value: summary.pendingOnboarding, path: '/admin/onboarding' },
    { key: 'completedOnboarding', label: 'Completed Onboarding', value: summary.completedOnboarding, path: '/admin/onboarding' },
    { key: 'pendingDocumentVerification', label: 'Pending Doc Verification', value: summary.pendingDocumentVerification, path: '/admin/onboarding' },
    { key: 'outstandingTasks', label: 'Outstanding Tasks', value: summary.outstandingTasks, path: '/admin/tasks' },
    { key: 'assignedAssets', label: 'Assigned Assets', value: summary.assignedAssets, path: '/admin/assets' },
    { key: 'activeAssetAssignments', label: 'Active Asset Assignments', value: summary.activeAssetAssignments, path: '/admin/assets' }
  ];

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      startDate,
      endDate,
      summary,
      cards,
      rows: cards
    }
  });
});
