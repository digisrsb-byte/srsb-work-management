import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

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
       WHERE employee_id <> 'FOUNDER'`,
      [startDate, endDate]
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
       WHERE e.employee_id <> 'FOUNDER'
       ORDER BY e.full_name ASC`
    );

    const [[attendanceSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_records,
         SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END)
           AS present_count,
         SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)
           AS absent_count,
         SUM(CASE WHEN status = 'HALF_DAY' THEN 1 ELSE 0 END)
           AS half_day_count,
         SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END)
           AS leave_count,
         SUM(CASE WHEN status = 'HOLIDAY' THEN 1 ELSE 0 END)
           AS holiday_count,
         SUM(CASE WHEN status = 'WEEK_OFF' THEN 1 ELSE 0 END)
           AS week_off_count,
         SUM(CASE WHEN status = 'MISSING_PUNCH' THEN 1 ELSE 0 END)
           AS missing_punch_count,
         COALESCE(SUM(total_work_minutes), 0)
           AS total_work_minutes
       FROM attendance
       WHERE attendance_date BETWEEN ? AND ?`,
      [startDate, endDate]
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
       WHERE e.employee_id <> 'FOUNDER'
       GROUP BY
         e.id,
         e.employee_id,
         e.full_name
       ORDER BY e.full_name ASC`,
      [startDate, endDate]
    );

    const [[leaveSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)
           AS pending_requests,
         SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END)
           AS approved_requests,
         SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END)
           AS rejected_requests,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END)
           AS cancelled_requests
       FROM leave_requests
       WHERE created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [startDate, endDate]
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
         AND lr.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY lr.created_at DESC`,
      [startDate, endDate]
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