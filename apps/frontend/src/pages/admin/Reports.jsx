import {
  useMemo,
  useState
} from 'react';
import api from '../../services/api.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatDate(date) {
  if (!date) return '-';

  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function getMonthDates(offset = 0) {
  const today = new Date();

  const start = new Date(
    today.getFullYear(),
    today.getMonth() + offset,
    1
  );

  const end = new Date(
    today.getFullYear(),
    today.getMonth() + offset + 1,
    0
  );

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="report-summary-card">
      <p>{title}</p>
      <h3>{value}</h3>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

export default function Reports() {
  const currentMonth = useMemo(() => getMonthDates(0), []);

  const [period, setPeriod] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState(
    currentMonth.startDate
  );
  const [endDate, setEndDate] = useState(
    currentMonth.endDate
  );

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function applyPeriod(value) {
    setPeriod(value);

    const today = new Date();
    const todayValue = today.toISOString().split('T')[0];

    if (value === 'TODAY') {
      setStartDate(todayValue);
      setEndDate(todayValue);
      return;
    }

    if (value === 'THIS_MONTH') {
      const dates = getMonthDates(0);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      return;
    }

    if (value === 'LAST_MONTH') {
      const dates = getMonthDates(-1);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      return;
    }

    if (value === 'THIS_WEEK') {
      const day = today.getDay();
      const difference = day === 0 ? -6 : 1 - day;

      const monday = new Date(today);
      monday.setDate(today.getDate() + difference);

      setStartDate(monday.toISOString().split('T')[0]);
      setEndDate(todayValue);
    }
  }

  async function generateReport() {
    if (!startDate || !endDate) {
      setError('Please select the start date and end date.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date cannot be after end date.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await api.get('/reports', {
        params: {
          startDate,
          endDate
        }
      });

      setReport(response.data.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to generate the report.'
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadExcel() {
    if (!report) return;

    const rows = [
      ['SRSB Workforce Solutions Company Report'],
      ['Start Date', report.reportPeriod.startDate],
      ['End Date', report.reportPeriod.endDate],
      ['Generated At', report.generatedAt],
      [],
      ['Category', 'Metric', 'Value'],
      [
        'Employees',
        'Total Employees',
        report.summary.employees.total
      ],
      [
        'Employees',
        'Active Employees',
        report.summary.employees.active
      ],
      [
        'Employees',
        'Joined During Period',
        report.summary.employees.joinedDuringPeriod
      ],
      [
        'Attendance',
        'Present',
        report.summary.attendance.present
      ],
      [
        'Attendance',
        'Absent',
        report.summary.attendance.absent
      ],
      [
        'Attendance',
        'Half Day',
        report.summary.attendance.halfDay
      ],
      [
        'Leave',
        'Total Requests',
        report.summary.leaveRequests.total
      ],
      [
        'Leave',
        'Approved',
        report.summary.leaveRequests.approved
      ],
      [
        'Clients',
        'Total Clients',
        report.summary.clients.total
      ],
      [
        'Clients',
        'Added During Period',
        report.summary.clients.addedDuringPeriod
      ],
      [
        'Requirements',
        'Total Requirements',
        report.summary.openings.totalRequirements
      ],
      [
        'Requirements',
        'Total Positions',
        report.summary.openings.totalPositions
      ],
      [
        'Candidates',
        'Candidates Added',
        report.summary.candidates.added
      ],
      [
        'Candidates',
        'Applications',
        report.summary.candidates.applications
      ],
      [
        'Candidates',
        'Joined',
        report.summary.candidates.joined
      ],
      [
        'Tasks',
        'Total Tasks',
        report.summary.tasks.total
      ],
      [
        'Tasks',
        'Completed Tasks',
        report.summary.tasks.completed
      ]
    ];

    if (report.finance) {
      rows.push(
        [],
        ['Finance', 'Invoiced Amount', report.finance.invoices.invoicedAmount],
        ['Finance', 'Paid Amount', report.finance.invoices.paidAmount],
        [
          'Finance',
          'Outstanding Amount',
          report.finance.invoices.outstandingAmount
        ],
        ['Finance', 'Expenses', report.finance.expenses.amount],
        ['Finance', 'Net Result', report.finance.netResult]
      );
    }

    rows.push(
      [],
      ['Employee ID', 'Employee Name', 'Present', 'Absent', 'Half Day', 'Leave', 'Work Minutes']
    );

    report.attendanceByEmployee.forEach((employee) => {
      rows.push([
        employee.employee_id,
        employee.full_name,
        employee.present_days,
        employee.absent_days,
        employee.half_days,
        employee.leave_days,
        employee.total_work_minutes
      ]);
    });

    rows.push(
      [],
      [
        'Client',
        'Job Role',
        'Location',
        'Total Positions',
        'Filled',
        'Remaining',
        'Status',
        'Handled By'
      ]
    );

    report.openings.forEach((opening) => {
      rows.push([
        opening.company_name,
        opening.title,
        opening.location,
        opening.openings_count,
        opening.filled_positions,
        opening.remaining_positions,
        opening.status,
        opening.assigned_recruiter_name || 'Not Assigned'
      ]);
    });

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? '');
            return `"${value.replaceAll('"', '""')}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `SRSB-Company-Report-${startDate}-to-${endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

 function downloadPDF() {
  if (!report) return;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFontSize(18);
  pdf.text(
    'SRSB Workforce Solutions Pvt. Ltd.',
    pageWidth / 2,
    15,
    { align: 'center' }
  );

  pdf.setFontSize(14);
  pdf.text(
    'Company Performance Report',
    pageWidth / 2,
    23,
    { align: 'center' }
  );

  pdf.setFontSize(10);
  pdf.text(
    `${formatDate(report.reportPeriod.startDate)} to ${formatDate(
      report.reportPeriod.endDate
    )}`,
    pageWidth / 2,
    30,
    { align: 'center' }
  );

  const overviewRows = [
    ['Total Employees', report.summary.employees.total],
    ['Active Employees', report.summary.employees.active],
    [
      'Employees Joined',
      report.summary.employees.joinedDuringPeriod
    ],
    ['Total Clients', report.summary.clients.total],
    [
      'Clients Added',
      report.summary.clients.addedDuringPeriod
    ],
    [
      'Total Requirements',
      report.summary.openings.totalRequirements
    ],
    [
      'Total Positions',
      report.summary.openings.totalPositions
    ],
    ['Active Requirements', report.summary.openings.active],
    ['Candidates Added', report.summary.candidates.added],
    ['Candidates Joined', report.summary.candidates.joined],
    ['Total Tasks', report.summary.tasks.total],
    ['Completed Tasks', report.summary.tasks.completed],
    ['Present Records', report.summary.attendance.present],
    ['Absent Records', report.summary.attendance.absent]
  ];

  autoTable(pdf, {
    startY: 36,
    head: [['Company Metric', 'Value']],
    body: overviewRows,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: {
      fillColor: [15, 139, 141]
    },
    margin: {
      left: 14,
      right: 14
    }
  });

  let nextY = pdf.lastAutoTable.finalY + 10;

  if (report.finance) {
    const financeRows = [
      [
        'Total Invoiced',
        formatCurrency(
          report.finance.invoices.invoicedAmount
        )
      ],
      [
        'Paid Amount',
        formatCurrency(report.finance.invoices.paidAmount)
      ],
      [
        'Outstanding Amount',
        formatCurrency(
          report.finance.invoices.outstandingAmount
        )
      ],
      [
        'Total Expenses',
        formatCurrency(report.finance.expenses.amount)
      ],
      [
        'Net Result',
        formatCurrency(report.finance.netResult)
      ]
    ];

    autoTable(pdf, {
      startY: nextY,
      head: [['Finance Metric', 'Amount']],
      body: financeRows,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [15, 139, 141]
      },
      margin: {
        left: 14,
        right: 14
      }
    });

    nextY = pdf.lastAutoTable.finalY + 10;
  }

  const attendanceRows = report.attendanceByEmployee.map(
    (employee) => [
      employee.employee_id,
      employee.full_name,
      employee.present_days,
      employee.absent_days,
      employee.half_days,
      employee.leave_days,
      (
        Number(employee.total_work_minutes || 0) / 60
      ).toFixed(1)
    ]
  );

  autoTable(pdf, {
    startY: nextY,
    head: [
      [
        'Employee ID',
        'Employee Name',
        'Present',
        'Absent',
        'Half Day',
        'Leave',
        'Work Hours'
      ]
    ],
    body: attendanceRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5
    },
    headStyles: {
      fillColor: [15, 139, 141]
    },
    margin: {
      left: 14,
      right: 14
    }
  });

  const openingRows = report.openings.map((opening) => [
    opening.company_name,
    opening.title,
    opening.location || '-',
    opening.openings_count,
    opening.filled_positions,
    opening.remaining_positions,
    opening.status,
    opening.assigned_recruiter_name || 'Not Assigned'
  ]);

  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 10,
    head: [
      [
        'Client',
        'Job Role',
        'Location',
        'Total',
        'Filled',
        'Remaining',
        'Status',
        'Handled By'
      ]
    ],
    body: openingRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5
    },
    headStyles: {
      fillColor: [15, 139, 141]
    },
    margin: {
      left: 14,
      right: 14
    }
  });

  const totalPages = pdf.internal.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(8);

    pdf.text(
      `Generated on ${formatDate(report.generatedAt)}`,
      14,
      pdf.internal.pageSize.getHeight() - 7
    );

    pdf.text(
      `Page ${page} of ${totalPages}`,
      pageWidth - 14,
      pdf.internal.pageSize.getHeight() - 7,
      { align: 'right' }
    );
  }

  pdf.save(
    `SRSB-Company-Report-${startDate}-to-${endDate}.pdf`
  );
}

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <p className="reports-label">Company Analytics</p>
          <h1>Company Reports</h1>
          <span>
            Generate and download complete company reports.
          </span>
        </div>
      </div>

      <div className="report-filter-card">
        <div className="report-filter-grid">
          <div className="report-field">
            <label>Report Period</label>

            <select
              value={period}
              onChange={(event) =>
                applyPeriod(event.target.value)
              }
            >
              <option value="TODAY">Today</option>
              <option value="THIS_WEEK">This Week</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_MONTH">Last Month</option>
              <option value="CUSTOM">Custom Date</option>
            </select>
          </div>

          <div className="report-field">
            <label>Start Date</label>

            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setPeriod('CUSTOM');
                setStartDate(event.target.value);
              }}
            />
          </div>

          <div className="report-field">
            <label>End Date</label>

            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setPeriod('CUSTOM');
                setEndDate(event.target.value);
              }}
            />
          </div>

          <button
            className="generate-report-button"
            onClick={generateReport}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {error && <div className="report-error">{error}</div>}
      </div>

      {!report && !loading && (
        <div className="report-empty">
          <div>📊</div>
          <h3>No report generated</h3>
          <p>
            Select a period and click Generate Report.
          </p>
        </div>
      )}

      {report && (
        <div className="report-content" id="company-report">
          <div className="report-title-row">
            <div>
              <p>SRSB Workforce Solutions Pvt. Ltd.</p>
              <h2>Company Performance Report</h2>
              <span>
                {formatDate(report.reportPeriod.startDate)}
                {' — '}
                {formatDate(report.reportPeriod.endDate)}
              </span>
            </div>

            <div className="report-download-actions">
              <button
                className="excel-button"
                onClick={downloadExcel}
              >
                Download Excel
              </button>

              <button
                className="pdf-button"
                onClick={downloadPDF}
              >
                Download PDF
              </button>
            </div>
          </div>

          <section className="report-section">
            <h3>Company Overview</h3>

            <div className="report-summary-grid">
              <SummaryCard
                title="Total Employees"
                value={report.summary.employees.total}
                subtitle={`${report.summary.employees.active} active`}
              />

              <SummaryCard
                title="Total Clients"
                value={report.summary.clients.total}
                subtitle={`${report.summary.clients.addedDuringPeriod} added`}
              />

              <SummaryCard
                title="Requirements"
                value={
                  report.summary.openings.totalRequirements
                }
                subtitle={`${report.summary.openings.active} active`}
              />

              <SummaryCard
                title="Total Positions"
                value={report.summary.openings.totalPositions}
              />

              <SummaryCard
                title="Candidates Added"
                value={report.summary.candidates.added}
              />

              <SummaryCard
                title="Candidates Joined"
                value={report.summary.candidates.joined}
              />

              <SummaryCard
                title="Tasks"
                value={report.summary.tasks.total}
                subtitle={`${report.summary.tasks.completed} completed`}
              />

              <SummaryCard
                title="Attendance Present"
                value={report.summary.attendance.present}
                subtitle={`${report.summary.attendance.absent} absent`}
              />
            </div>
          </section>

          {report.finance && (
            <section className="report-section">
              <h3>Finance Summary</h3>

              <div className="report-summary-grid">
                <SummaryCard
                  title="Total Invoiced"
                  value={formatCurrency(
                    report.finance.invoices.invoicedAmount
                  )}
                />

                <SummaryCard
                  title="Paid Amount"
                  value={formatCurrency(
                    report.finance.invoices.paidAmount
                  )}
                />

                <SummaryCard
                  title="Outstanding"
                  value={formatCurrency(
                    report.finance.invoices.outstandingAmount
                  )}
                />

                <SummaryCard
                  title="Expenses"
                  value={formatCurrency(
                    report.finance.expenses.amount
                  )}
                />

                <SummaryCard
                  title="Net Result"
                  value={formatCurrency(
                    report.finance.netResult
                  )}
                />
              </div>
            </section>
          )}

          <section className="report-section">
            <h3>Attendance by Employee</h3>

            <div className="report-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Half Day</th>
                    <th>Leave</th>
                    <th>Work Hours</th>
                  </tr>
                </thead>

                <tbody>
                  {report.attendanceByEmployee.map(
                    (employee) => (
                      <tr key={employee.employee_id}>
                        <td>
                          <strong>
                            {employee.full_name}
                          </strong>
                          <small>
                            {employee.employee_id}
                          </small>
                        </td>

                        <td>{employee.present_days}</td>
                        <td>{employee.absent_days}</td>
                        <td>{employee.half_days}</td>
                        <td>{employee.leave_days}</td>

                        <td>
                          {(
                            Number(
                              employee.total_work_minutes || 0
                            ) / 60
                          ).toFixed(1)}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="report-section">
            <h3>Requirements and Positions</h3>

            <div className="report-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Job Role</th>
                    <th>Total</th>
                    <th>Filled</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Handled By</th>
                  </tr>
                </thead>

                <tbody>
                  {report.openings.map((opening) => (
                    <tr key={opening.id}>
                      <td>{opening.company_name}</td>

                      <td>
                        <strong>{opening.title}</strong>
                        <small>
                          {opening.location || 'Location not added'}
                        </small>
                      </td>

                      <td>{opening.openings_count}</td>
                      <td>{opening.filled_positions}</td>
                      <td>{opening.remaining_positions}</td>
                      <td>{opening.status}</td>

                      <td>
                        {opening.assigned_recruiter_name ||
                          'Not Assigned'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="report-footer">
            Generated on {formatDate(report.generatedAt)}
          </div>
        </div>
      )}

      <style>{`
        .reports-page {
          padding: 28px;
          min-height: 100%;
          background: #f5f7fb;
        }

        .reports-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .reports-label {
          margin: 0 0 6px;
          color: #0f8b8d;
          font-weight: 700;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .reports-header h1 {
          margin: 0;
          color: #182230;
          font-size: 30px;
        }

        .reports-header span {
          display: block;
          margin-top: 6px;
          color: #667085;
        }

        .report-filter-card,
        .report-content,
        .report-empty {
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 18px;
          box-shadow: 0 8px 25px rgba(16, 24, 40, 0.05);
        }

        .report-filter-card {
          padding: 22px;
          margin-bottom: 24px;
        }

        .report-filter-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(160px, 1fr)) auto;
          gap: 16px;
          align-items: end;
        }

        .report-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .report-field label {
          color: #344054;
          font-size: 13px;
          font-weight: 700;
        }

        .report-field input,
        .report-field select {
          height: 44px;
          padding: 0 13px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
          background: white;
          font-size: 14px;
          outline: none;
        }

        .generate-report-button,
        .excel-button,
        .pdf-button {
          border: 0;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .generate-report-button {
          height: 44px;
          padding: 0 22px;
          background: #0f8b8d;
          color: white;
        }

        .generate-report-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .report-error {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          background: #fff1f1;
          color: #b42318;
          font-size: 14px;
        }

        .report-empty {
          padding: 70px 20px;
          text-align: center;
          color: #667085;
        }

        .report-empty div {
          font-size: 42px;
        }

        .report-empty h3 {
          margin: 12px 0 4px;
          color: #344054;
        }

        .report-empty p {
          margin: 0;
        }

        .report-content {
          padding: 28px;
        }

        .report-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 22px;
          border-bottom: 1px solid #eaecf0;
        }

        .report-title-row p {
          margin: 0 0 5px;
          color: #0f8b8d;
          font-weight: 700;
        }

        .report-title-row h2 {
          margin: 0;
          color: #182230;
        }

        .report-title-row span {
          display: block;
          margin-top: 7px;
          color: #667085;
        }

        .report-download-actions {
          display: flex;
          gap: 10px;
        }

        .excel-button,
        .pdf-button {
          padding: 11px 16px;
        }

        .excel-button {
          background: #e7f8ee;
          color: #08783e;
        }

        .pdf-button {
          background: #fff0f0;
          color: #c62828;
        }

        .report-section {
          margin-top: 28px;
        }

        .report-section h3 {
          margin: 0 0 16px;
          color: #182230;
        }

        .report-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(160px, 1fr));
          gap: 14px;
        }

        .report-summary-card {
          padding: 18px;
          border: 1px solid #eaecf0;
          border-radius: 14px;
          background: #fafbfc;
        }

        .report-summary-card p {
          margin: 0;
          color: #667085;
          font-size: 13px;
          font-weight: 600;
        }

        .report-summary-card h3 {
          margin: 8px 0 2px;
          color: #182230;
          font-size: 24px;
        }

        .report-summary-card span {
          color: #667085;
          font-size: 12px;
        }

        .report-table-wrapper {
          overflow-x: auto;
          border: 1px solid #eaecf0;
          border-radius: 14px;
        }

        .report-table-wrapper table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }

        .report-table-wrapper th {
          padding: 13px 15px;
          background: #f8fafc;
          color: #475467;
          text-align: left;
          font-size: 12px;
          text-transform: uppercase;
        }

        .report-table-wrapper td {
          padding: 14px 15px;
          border-top: 1px solid #eaecf0;
          color: #344054;
          font-size: 14px;
        }

        .report-table-wrapper td strong,
        .report-table-wrapper td small {
          display: block;
        }

        .report-table-wrapper td small {
          margin-top: 3px;
          color: #98a2b3;
        }

        .report-footer {
          margin-top: 28px;
          padding-top: 16px;
          border-top: 1px solid #eaecf0;
          color: #98a2b3;
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 1000px) {
          .report-filter-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .report-summary-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .reports-page {
            padding: 16px;
          }

          .report-filter-grid,
          .report-summary-grid {
            grid-template-columns: 1fr;
          }

          .report-title-row {
            flex-direction: column;
          }

          .report-download-actions {
            width: 100%;
          }

          .excel-button,
          .pdf-button {
            flex: 1;
          }
        }

        @media print {
          body * {
            visibility: hidden;
          }

          #company-report,
          #company-report * {
            visibility: visible;
          }

          #company-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none;
            box-shadow: none;
          }

          .report-download-actions {
            display: none;
          }

          .report-summary-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>
    </div>
  );
}