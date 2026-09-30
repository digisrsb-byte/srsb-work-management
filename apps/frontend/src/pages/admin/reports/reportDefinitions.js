import {
  MONTH_NAMES,
  formatDate,
  formatDateRange,
  humanizeCode,
  safeFilePart
} from '../../../services/reportExport.js';

export const OPS_TABS = [
  { id: 'summary', label: 'Summary', title: 'Operations Summary Report' },
  { id: 'headcount', label: 'Headcount', title: 'Headcount Report' },
  { id: 'attendance', label: 'Attendance', title: 'Attendance Report' },
  { id: 'payroll', label: 'Payroll', title: 'Payroll Report' },
  { id: 'clients', label: 'Clients', title: 'Client-wise Report' }
];

/** Filter controls shown for each tab. */
export const TAB_FILTERS = {
  summary: ['dateRange', 'company', 'status'],
  headcount: ['asOfDate', 'company', 'status'],
  attendance: ['dateRange', 'company'],
  payroll: ['payrollPeriod', 'company'],
  clients: ['dateRange', 'company']
};

/** Filter keys each tab's API request depends on (used to detect unapplied changes). */
const TAB_FILTER_KEYS = {
  summary: ['startDate', 'endDate', 'companyId', 'status'],
  headcount: ['asOfDate', 'companyId', 'status'],
  attendance: ['startDate', 'endDate', 'companyId', 'status'],
  payroll: ['year', 'month', 'companyId', 'status'],
  clients: ['startDate', 'endDate', 'companyId', 'status']
};

/**
 * Selections the current report APIs accept but do not use when building the result.
 * They stay visible so the workflow is unchanged, and the page explains that they have no effect.
 */
export const UNAPPLIED_FILTERS = {
  headcount: ['companyId', 'status'],
  payroll: ['companyId'],
  clients: ['companyId']
};

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'RESIGNED', 'TERMINATED'];

export function buildOpsRequest(tab, filters) {
  const common = {
    companyId: filters.companyId || undefined,
    status: filters.status || undefined
  };
  if (tab === 'summary') {
    return {
      url: '/reports/ops-summary',
      params: { startDate: filters.startDate, endDate: filters.endDate, ...common }
    };
  }
  if (tab === 'headcount') {
    return { url: '/reports/headcount', params: { asOfDate: filters.asOfDate, ...common } };
  }
  if (tab === 'attendance') {
    return {
      url: '/reports/attendance',
      params: { startDate: filters.startDate, endDate: filters.endDate, ...common }
    };
  }
  if (tab === 'payroll') {
    return { url: '/reports/payroll', params: { year: filters.year, month: filters.month, ...common } };
  }
  return {
    url: '/reports/clients',
    params: { startDate: filters.startDate, endDate: filters.endDate, ...common }
  };
}

export function filtersChanged(tab, current, applied) {
  if (!applied) return false;
  return TAB_FILTER_KEYS[tab].some((key) => String(current[key] ?? '') !== String(applied[key] ?? ''));
}

export function payrollPeriodLabel(year, month) {
  const m = Number(month);
  const monthName = m >= 1 && m <= 12 ? MONTH_NAMES[m - 1] : month ? `Month ${month}` : '';
  if (year && monthName) return `${monthName} ${year}`;
  if (year) return `Year ${year}`;
  if (monthName) return `${monthName} (all years)`;
  return 'All periods';
}

function companyName(companyId, companies) {
  if (!companyId) return 'All companies in your access';
  const match = companies.find((c) => String(c.id) === String(companyId));
  return match?.name || `Company #${companyId}`;
}

function appliedFilterList(tab, filters, companies) {
  const unapplied = UNAPPLIED_FILTERS[tab] || [];
  const list = [];
  const shows = TAB_FILTERS[tab];

  if (shows.includes('company')) {
    list.push({
      label: 'Company',
      value:
        filters.companyId && unapplied.includes('companyId')
          ? 'All companies in your access (selection not applied by this report)'
          : companyName(filters.companyId, companies)
    });
  }
  if (shows.includes('status')) {
    list.push({
      label: 'Employee status',
      value:
        filters.status && unapplied.includes('status')
          ? 'All statuses (selection not applied by this report)'
          : filters.status
            ? humanizeCode(filters.status)
            : 'All statuses'
    });
  }
  if (tab === 'payroll' && filters.status) {
    list.push({ label: 'Payroll run status', value: humanizeCode(filters.status) });
  }
  return list;
}
/* ---------------------------------------------------------------- Summary */

const SUMMARY_GROUPS = [
  ['Workforce', ['totalEmployees', 'activeEmployees', 'inactiveEmployees', 'newJoiners', 'employeesLeft']],
  ['Attendance', ['attendancePresent', 'attendanceAbsent', 'attendanceHalfDay']],
  ['Leave', ['leavePending', 'leaveApproved', 'leaveRejected']],
  ['Recruitment', ['totalRequirements', 'activeRequirements', 'totalCandidates', 'totalApplications', 'joinedCandidates']],
  ['Onboarding', ['pendingOnboarding', 'completedOnboarding', 'pendingDocumentVerification']],
  ['Tasks', ['outstandingTasks']],
  ['Assets', ['assignedAssets', 'activeAssetAssignments']]
];
const SUMMARY_LABELS = {
  attendanceAbsent: 'Attendance Absent',
  attendanceHalfDay: 'Attendance Half Day',
  activeRequirements: 'Active Requirements'
};
const SUMMARY_KEY_METRICS = [
  'totalEmployees',
  'activeEmployees',
  'newJoiners',
  'employeesLeft',
  'attendancePresent',
  'leavePending'
];

function camelToLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function summaryReport(data) {
  const summary = data.summary || {};
  const cards = data.cards || [];
  const cardFor = (key) => cards.find((card) => card.key === key);
  const labelFor = (key) => cardFor(key)?.label || SUMMARY_LABELS[key] || camelToLabel(key);
  const valueFor = (key) => (key in summary ? summary[key] : cardFor(key)?.value);

  const grouped = new Set();
  const rows = [];
  SUMMARY_GROUPS.forEach(([area, keys]) => {
    keys.forEach((key) => {
      if (!(key in summary) && !cardFor(key)) return;
      grouped.add(key);
      rows.push({ area, key, metric: labelFor(key), value: valueFor(key), path: cardFor(key)?.path });
    });
  });
  [...Object.keys(summary), ...cards.map((c) => c.key)].forEach((key) => {
    if (grouped.has(key)) return;
    grouped.add(key);
    rows.push({ area: 'Other', key, metric: labelFor(key), value: valueFor(key), path: cardFor(key)?.path });
  });

  return {
    summary: SUMMARY_KEY_METRICS.filter((key) => key in summary || cardFor(key)).map((key) => ({
      label: labelFor(key),
      value: valueFor(key),
      path: cardFor(key)?.path
    })),
    sections: [
      {
        id: 'areas',
        title: 'Operational Areas',
        groupKey: 'area',
        rows,
        emptyText: 'No operational metrics available for the selected filters.',
        columns: [
          { key: 'area', header: 'Area' },
          { key: 'metric', header: 'Metric', link: 'path' },
          { key: 'value', header: 'Value', type: 'number' },
          { key: 'key', header: 'Metric Key', pdf: false }
        ]
      }
    ]
  };
}

/* -------------------------------------------------------------- Headcount */

function headcountReport(data) {
  const rows = data.rows || [];
  const summary = data.summary || {};
  const asOf = data.asOf;
  const asOfDate = asOf ? new Date(`${String(asOf).slice(0, 10)}T00:00:00`) : null;
  const joinersLabel = asOfDate && !Number.isNaN(asOfDate.getTime())
    ? `Joiners in ${MONTH_NAMES[asOfDate.getMonth()]} ${asOfDate.getFullYear()}`
    : 'Joiners this month';

  const present = new Set(rows.map((r) => r.status).filter(Boolean));
  const statuses = [
    ...EMPLOYEE_STATUSES.filter((s) => present.has(s)),
    ...[...present].filter((s) => !EMPLOYEE_STATUSES.includes(s)).sort()
  ];
  const byDepartment = new Map();
  rows.forEach((row) => {
    const department = row.department || 'Not assigned';
    if (!byDepartment.has(department)) byDepartment.set(department, { department, total: 0 });
    const entry = byDepartment.get(department);
    entry[row.status] = (entry[row.status] || 0) + 1;
    entry.total += 1;
  });
  const breakdownRows = [...byDepartment.values()].sort((a, b) =>
    a.department === 'Not assigned' ? 1 : b.department === 'Not assigned' ? -1 : a.department.localeCompare(b.department)
  );
  const breakdownTotals = { total: rows.length };
  statuses.forEach((status) => {
    breakdownTotals[`s_${status}`] = rows.filter((r) => r.status === status).length;
  });

  return {
    summary: [
      { label: 'Active employees', value: summary.active_employees },
      { label: 'Inactive employees', value: summary.inactive_employees },
      { label: joinersLabel, value: summary.joiners_this_month },
      { label: 'Employee records', value: rows.length }
    ],
    sections: [
      {
        id: 'breakdown',
        title: 'Headcount by Department and Status',
        sheetName: 'By Department',
        csv: false,
        countLabel: `${breakdownRows.length} ${breakdownRows.length === 1 ? 'department' : 'departments'}`,
        rows: breakdownRows,
        emptyText: 'No employee records in your access.',
        columns: [
          { key: 'department', header: 'Department' },
          ...statuses.map((status) => ({
            key: `s_${status}`,
            header: humanizeCode(status),
            type: 'number',
            value: (row) => row[status] || 0
          })),
          { key: 'total', header: 'Total', type: 'number' }
        ],
        totals: { label: 'Total', values: breakdownTotals }
      },
      {
        id: 'employees',
        title: 'Employee List',
        rows,
        emptyText: 'No employee records in your access.',
        columns: [
          { key: 'employee_id', header: 'Employee ID' },
          { key: 'full_name', header: 'Employee Name' },
          { key: 'company_name', header: 'Company' },
          { key: 'department', header: 'Department' },
          { key: 'role', header: 'Role', type: 'status' },
          { key: 'status', header: 'Status', type: 'status', badge: true },
          { key: 'joining_date', header: 'Joining Date', type: 'date' },
          { key: 'id', header: 'Record ID', type: 'number', pdf: false }
        ]
      }
    ]
  };
}

/* ------------------------------------------------------------- Attendance */

function attendanceReport(data) {
  const summary = data.summary || {};
  return {
    summary: [
      { label: 'Attendance records', value: summary.total },
      { label: 'Present', value: summary.present },
      { label: 'Absent', value: summary.absent },
      { label: 'Exceptions (half day / missing punch)', value: summary.exceptions }
    ],
    sections: [
      {
        id: 'records',
        title: 'Attendance Records',
        rows: data.rows || [],
        emptyText: 'No attendance records for the selected date range and filters.',
        flagRow: (row) => ['MISSING_PUNCH', 'HALF_DAY'].includes(row.status),
        note: 'Exceptions are Half Day and Missing Punch records. Work time is the recorded total work minutes for the day.',
        columns: [
          { key: 'attendance_date', header: 'Date', type: 'date' },
          { key: 'emp_code', header: 'Employee ID' },
          { key: 'full_name', header: 'Employee Name' },
          { key: 'company_name', header: 'Company' },
          { key: 'status', header: 'Status', type: 'status', badge: true },
          { key: 'punch_in', header: 'Punch In', type: 'time' },
          { key: 'punch_out', header: 'Punch Out', type: 'time' },
          { key: 'total_work_minutes', header: 'Work Time', dataHeader: 'Work Minutes', type: 'minutes' },
          { key: 'remarks', header: 'Remarks' },
          { key: 'id', header: 'Record ID', type: 'number', pdf: false },
          { key: 'employee_id', header: 'Employee Ref', type: 'number', pdf: false },
          { key: 'created_at', header: 'Created At', type: 'datetime', pdf: false },
          { key: 'updated_at', header: 'Updated At', type: 'datetime', pdf: false }
        ]
      }
    ]
  };
}

/* ---------------------------------------------------------------- Payroll */

function payrollReport(data) {
  const summary = data.summary || {};
  return {
    summary: [
      { label: 'Payroll runs', value: summary.run_count },
      { label: 'Employees in runs', value: summary.employee_count },
      { label: 'Total net pay (INR)', value: summary.total_net, type: 'currency' },
      { label: 'Draft runs', value: summary.draft },
      { label: 'Approved / locked / paid runs', value: summary.approved }
    ],
    sections: [
      {
        id: 'runs',
        title: 'Payroll Run Register',
        sheetName: 'Payroll Runs',
        rows: data.rows || [],
        emptyText: 'No payroll runs for the selected period and filters.',
        note:
          'Figures are run-level totals from the payroll report: employee count and total net pay per run. ' +
          'Employee-wise earnings, deductions and employer contributions are not part of this report data.',
        columns: [
          { key: 'company_name', header: 'Company' },
          { key: 'period', header: 'Payroll Period', value: (row) => payrollPeriodLabel(row.period_year, row.period_month) },
          { key: 'status', header: 'Run Status', type: 'status', badge: true },
          { key: 'employee_count', header: 'Employees', type: 'number' },
          { key: 'working_days', header: 'Working Days', type: 'number' },
          { key: 'total_net', header: 'Total Net Pay (INR)', type: 'currency' },
          { key: 'submitted_at', header: 'Submitted', type: 'datetime' },
          { key: 'approved_at', header: 'Approved', type: 'datetime' },
          { key: 'locked_at', header: 'Locked', type: 'datetime' },
          { key: 'paid_at', header: 'Paid', type: 'datetime' },
          { key: 'notes', header: 'Notes' },
          { key: 'reopen_reason', header: 'Reopen Reason' },
          { key: 'id', header: 'Run ID', type: 'number', pdf: false },
          { key: 'company_id', header: 'Company Ref', type: 'number', pdf: false },
          { key: 'period_year', header: 'Period Year', type: 'number', pdf: false },
          { key: 'period_month', header: 'Period Month', type: 'number', pdf: false },
          { key: 'created_by', header: 'Created By (Employee Ref)', type: 'number', pdf: false },
          { key: 'submitted_by', header: 'Submitted By (Employee Ref)', type: 'number', pdf: false },
          { key: 'approved_by', header: 'Approved By (Employee Ref)', type: 'number', pdf: false },
          { key: 'locked_by', header: 'Locked By (Employee Ref)', type: 'number', pdf: false },
          { key: 'paid_by', header: 'Paid By (Employee Ref)', type: 'number', pdf: false },
          { key: 'created_at', header: 'Created At', type: 'datetime', pdf: false },
          { key: 'updated_at', header: 'Updated At', type: 'datetime', pdf: false }
        ],
        totals: {
          label: 'Total',
          values: { employee_count: summary.employee_count, total_net: summary.total_net }
        }
      }
    ]
  };
}

/* ---------------------------------------------------------------- Clients */

function allocationLines(row) {
  return (row.allocations || []).map((a) => {
    const range = a.effective_to
      ? `${formatDate(a.effective_from)} – ${formatDate(a.effective_to)}`
      : `from ${formatDate(a.effective_from)}`;
    return `${a.full_name || 'Employee'}${a.employee_id ? ` (${a.employee_id})` : ''} · ${Number(a.allocation_percent)}% · ${range}`;
  });
}

function clientsReport(data) {
  const summary = data.summary || {};
  return {
    summary: [
      { label: 'Clients', value: summary.clients },
      { label: 'Openings in period', value: summary.openings },
      { label: 'Applications in period', value: summary.applications },
      { label: 'Assigned headcount', value: summary.assigned_headcount }
    ],
    sections: [
      {
        id: 'clients',
        title: 'Client-wise Summary',
        sheetName: 'Clients',
        rows: data.rows || [],
        emptyText: 'No clients in your access for the selected filters.',
        columns: [
          { key: 'company_name', header: 'Client' },
          { key: 'status', header: 'Status', type: 'status', badge: true },
          { key: 'openings', header: 'Openings', type: 'number' },
          { key: 'applications', header: 'Applications', type: 'number' },
          { key: 'assigned_headcount', header: 'Assigned Employees', type: 'number' },
          { key: 'allocations', header: 'Allocations', type: 'list', value: allocationLines },
          { key: 'payroll_cost', header: 'Payroll Cost (INR)', type: 'currency' },
          { key: 'payroll_cost_note', header: 'Payroll Cost Note' },
          { key: 'id', header: 'Client ID', type: 'number', pdf: false }
        ],
        totals: {
          label: 'Total',
          values: {
            openings: summary.openings,
            applications: summary.applications,
            assigned_headcount: summary.assigned_headcount
          }
        }
      }
    ]
  };
}

const BUILDERS = {
  summary: summaryReport,
  headcount: headcountReport,
  attendance: attendanceReport,
  payroll: payrollReport,
  clients: clientsReport
};

/** Report definition for an Operational Reports tab, built from the loaded data and the filters used to load it. */
export function buildOpsReport(tab, data, filters, companies = []) {
  const meta = OPS_TABS.find((t) => t.id === tab) || OPS_TABS[0];
  let periodLabel;
  let periodSlug;
  if (tab === 'headcount') {
    const asOf = data?.asOf || filters.asOfDate;
    periodLabel = `As of ${formatDate(asOf)}`;
    periodSlug = `as-of-${String(asOf).slice(0, 10)}`;
  } else if (tab === 'payroll') {
    periodLabel = payrollPeriodLabel(filters.year, filters.month);
    periodSlug = [filters.year, filters.month && String(filters.month).padStart(2, '0')].filter(Boolean).join('-') || 'all-periods';
  } else {
    const start = data?.startDate || filters.startDate;
    const end = data?.endDate || filters.endDate;
    periodLabel = formatDateRange(start, end);
    periodSlug = `${start}-to-${end}`;
  }

  return {
    title: meta.title,
    fileBase: safeFilePart(`SRSB-${meta.title}-${periodSlug}`),
    periodLabel,
    generatedAt: data?.generatedAt,
    filters: appliedFilterList(tab, filters, companies),
    ...BUILDERS[tab](data || {})
  };
}

/* --------------------------------------------------------- Company report */

const PERIOD_NAMES = {
  TODAY: 'Today',
  THIS_WEEK: 'This week',
  THIS_MONTH: 'This month',
  LAST_MONTH: 'Last month',
  CUSTOM: 'Custom dates'
};

/** Report definition for the Company Performance Report (/admin/reports). */
export function buildCompanyReport(report, { period } = {}) {
  const s = report.summary;
  const metric = (category, label, value) => ({ category, metric: label, value });
  const overview = [
    metric('Employees', 'Total Employees', s.employees.total),
    metric('Employees', 'Active Employees', s.employees.active),
    metric('Employees', 'Joined During Period', s.employees.joinedDuringPeriod),
    metric('Attendance', 'Present', s.attendance.present),
    metric('Attendance', 'Absent', s.attendance.absent),
    metric('Attendance', 'Half Day', s.attendance.halfDay),
    metric('Leave', 'Total Requests', s.leaveRequests.total),
    metric('Leave', 'Approved', s.leaveRequests.approved),
    metric('Clients', 'Total Clients', s.clients.total),
    metric('Clients', 'Added During Period', s.clients.addedDuringPeriod),
    metric('Requirements', 'Total Requirements', s.openings.totalRequirements),
    metric('Requirements', 'Total Positions', s.openings.totalPositions),
    metric('Requirements', 'Active Requirements', s.openings.active),
    metric('Candidates', 'Candidates Added', s.candidates.added),
    metric('Candidates', 'Applications', s.candidates.applications),
    metric('Candidates', 'Joined', s.candidates.joined),
    metric('Tasks', 'Total Tasks', s.tasks.total),
    metric('Tasks', 'Completed Tasks', s.tasks.completed)
  ];

  const sections = [
    {
      id: 'overview',
      title: 'Company Overview',
      sheetName: 'Overview',
      rows: overview,
      columns: [
        { key: 'category', header: 'Category' },
        { key: 'metric', header: 'Metric' },
        { key: 'value', header: 'Value', type: 'number' }
      ]
    }
  ];

  if (report.finance) {
    const f = report.finance;
    sections.push({
      id: 'finance',
      title: 'Finance Summary',
      sheetName: 'Finance',
      rows: [
        { metric: 'Invoiced Amount', amount: f.invoices.invoicedAmount },
        { metric: 'Paid Amount', amount: f.invoices.paidAmount },
        { metric: 'Outstanding Amount', amount: f.invoices.outstandingAmount },
        { metric: 'Expenses', amount: f.expenses.amount },
        { metric: 'Net Result', amount: f.netResult }
      ],
      columns: [
        { key: 'metric', header: 'Metric' },
        { key: 'amount', header: 'Amount (INR)', type: 'currency' }
      ]
    });
  }

  sections.push(
    {
      id: 'attendance',
      title: 'Attendance by Employee',
      sheetName: 'Attendance',
      rows: report.attendanceByEmployee,
      emptyText: 'No employees in scope.',
      columns: [
        { key: 'employee_id', header: 'Employee ID' },
        { key: 'full_name', header: 'Employee Name' },
        { key: 'present_days', header: 'Present', type: 'number' },
        { key: 'absent_days', header: 'Absent', type: 'number' },
        { key: 'half_days', header: 'Half Day', type: 'number' },
        { key: 'leave_days', header: 'Leave', type: 'number' },
        { key: 'total_work_minutes', header: 'Work Minutes', type: 'number', pdf: false },
        {
          key: 'work_hours',
          header: 'Work Hours',
          type: 'number',
          decimals: 1,
          value: (row) => Number(row.total_work_minutes || 0) / 60
        }
      ]
    },
    {
      id: 'openings',
      title: 'Requirements and Positions',
      sheetName: 'Requirements',
      rows: report.openings,
      emptyText: 'No requirements created in this period.',
      columns: [
        { key: 'company_name', header: 'Client' },
        { key: 'title', header: 'Job Role' },
        { key: 'location', header: 'Location' },
        { key: 'openings_count', header: 'Total Positions', type: 'number' },
        { key: 'filled_positions', header: 'Filled', type: 'number' },
        { key: 'remaining_positions', header: 'Remaining', type: 'number' },
        { key: 'status', header: 'Status', type: 'status', badge: true },
        { key: 'assigned_recruiter_name', header: 'Handled By', value: (row) => row.assigned_recruiter_name || 'Not Assigned' }
      ]
    }
  );

  const { startDate, endDate } = report.reportPeriod;
  const filters = [
    { label: 'Period', value: PERIOD_NAMES[period] || 'Custom dates' },
    { label: 'Company scope', value: 'All companies in your access' }
  ];
  if (report.finance) filters.push({ label: 'Finance', value: 'Included' });

  return {
    title: 'Company Performance Report',
    fileBase: safeFilePart(`SRSB-Company-Report-${startDate}-to-${endDate}`),
    periodLabel: formatDateRange(startDate, endDate),
    generatedAt: report.generatedAt,
    filters,
    summary: [
      { label: 'Total employees', value: s.employees.total },
      { label: 'Active employees', value: s.employees.active },
      { label: 'Total clients', value: s.clients.total },
      { label: 'Requirements', value: s.openings.totalRequirements },
      { label: 'Candidates joined', value: s.candidates.joined },
      { label: 'Completed tasks', value: s.tasks.completed }
    ],
    sections
  };
}