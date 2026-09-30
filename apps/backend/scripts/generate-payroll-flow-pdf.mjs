/**
 * Generates SRSB HRMS Salary & Payroll Complete Flow Analysis PDF
 * Run: node apps/backend/scripts/generate-payroll-flow-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../../../docs/SRSB_HRMS_Salary_Payroll_Complete_Flow.pdf');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const margin = 14;
const maxW = pageW - margin * 2;
let y = margin;
const lineH = 5;

function ensureSpace(need = 12) {
  if (y + need > pageH - 16) {
    doc.addPage();
    y = margin;
    addFooter();
  }
}

function addFooter() {
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `SRSB HRMS — Salary & Payroll Complete Flow | Page ${pageCount}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );
  doc.setTextColor(0);
}

function title(text) {
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, margin, y);
  y += lines.length * 7 + 3;
}

function h2(text) {
  ensureSpace(14);
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 64, 175);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, margin, y);
  y += lines.length * 6 + 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageW - margin, y);
  y += 4;
  doc.setTextColor(0);
}

function h3(text) {
  ensureSpace(10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(text, margin, y);
  y += 6;
  doc.setTextColor(0);
}

function para(text) {
  ensureSpace(8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    ensureSpace(lineH);
    doc.text(line, margin, y);
    y += lineH;
  }
  y += 1.5;
}

function bullet(text) {
  ensureSpace(8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(`•  ${text}`, maxW - 2);
  for (const line of lines) {
    ensureSpace(lineH);
    doc.text(line, margin + 2, y);
    y += lineH;
  }
}

function mono(text) {
  ensureSpace(8);
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    ensureSpace(4.2);
    doc.text(line, margin, y);
    y += 4.2;
  }
  y += 2;
  doc.setFont('helvetica', 'normal');
}

function table(headers, rows) {
  ensureSpace(16);
  const colCount = headers.length;
  const colW = maxW / colCount;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 3.5, maxW, 7, 'F');
  headers.forEach((h, i) => {
    doc.text(String(h).slice(0, 28), margin + i * colW + 1, y);
  });
  y += 6;
  doc.setFont('helvetica', 'normal');
  for (const row of rows) {
    const cellLines = row.map((cell) =>
      doc.splitTextToSize(String(cell ?? ''), colW - 2)
    );
    const rowH = Math.max(...cellLines.map((l) => l.length), 1) * 4 + 2;
    ensureSpace(rowH + 2);
    cellLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        doc.text(line, margin + i * colW + 1, y + li * 4);
      });
    });
    y += rowH;
  }
  y += 3;
}

// ========== COVER ==========
doc.setFillColor(15, 23, 42);
doc.rect(0, 0, pageW, 48, 'F');
doc.setTextColor(255);
doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.text('SRSB HRMS', margin, 22);
doc.setFontSize(13);
doc.text('Complete Salary & Payroll Flow Analysis', margin, 32);
doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.text('Technical + Business documentation (code-verified, read-only analysis)', margin, 40);
doc.setTextColor(0);
y = 58;

para(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
para('Source: Existing SRSB HRMS codebase (frontend, backend, migrations, RBAC). No assumptions of unimplemented features.');
para('Purpose: Reference document before further implementation. Accuracy prioritized over completeness of wish-list features.');

h2('1. Executive Summary');
para('Salary & Payroll is a company-scoped, CTC-driven, backend-calculated pipeline:');
bullet('Employee is created without salary.');
bullet('Admin/HR/SA enter Annual CTC; engine builds components from salary_configurations.');
bullet('Employee punches daily into attendance.');
bullet('Admin/HR create a payroll run, then Calculate (live attendance + active CTC).');
bullet('Status: DRAFT → SUBMITTED → APPROVED → LOCKED → PAID.');
bullet('On Mark Paid, payslip_records are created; employee downloads via My Payslips (client-side jsPDF).');
para('Employee portal does NOT show live CTC/structure — only generated payslips.');

h2('2. Salary & Payroll Business Flow');
mono(`SUPER ADMIN / ADMIN / HR
  → Create employee (employees)
  → Company salary configuration (salary_configurations)
  → Enter employee Annual CTC (employee_salary_structures + salary_components)

EMPLOYEE
  → Punch In / Punch Out (attendance)
  → Optional: Attendance correction request
  → Optional: Leave request (leave_requests — NOT written into attendance on approve)

MANAGER / ADMIN / HR / SUPER ADMIN
  → Approve/reject correction (updates attendance)
  → Approve/reject leave (leave_requests only)

ADMIN / HR (/ SUPER ADMIN)
  → Create payroll period → Calculate → Submit

SUPER ADMIN / ADMIN
  → Approve → Lock → Mark Paid / Generate payslips

EMPLOYEE (+ ADMIN/HR/MANAGER scoped list)
  → View/download payslip`);

table(
  ['Question', 'Actual answer'],
  [
    ['Who creates employee?', 'SUPER_ADMIN, ADMIN, HR (POST /employees)'],
    ['Who configures company salary %?', 'SUPER_ADMIN, ADMIN, HR (PUT /payroll/config)'],
    ['Who configures employee CTC?', 'SUPER_ADMIN, ADMIN, HR (PUT /payroll/employee/:id/setup)'],
    ['Who views salary setup?', 'Route allows MANAGER; salary:view seed missing → likely 403'],
    ['Who edits salary?', 'SUPER_ADMIN, ADMIN, HR'],
    ['Who manages attendance list?', 'SUPER_ADMIN, ADMIN, HR, MANAGER'],
    ['Who approves correction?', 'SUPER_ADMIN, ADMIN, HR, MANAGER'],
    ['Who calculates payroll?', 'SUPER_ADMIN, ADMIN, HR'],
    ['Who submits payroll?', 'SUPER_ADMIN, ADMIN, HR'],
    ['Who approves/locks/pays?', 'SUPER_ADMIN, ADMIN only'],
    ['Who reopens payroll?', 'SUPER_ADMIN only'],
    ['Who downloads payslip?', 'Owner + ADMIN/HR/MANAGER list; SA page hidden']
  ]
);

h2('3. Super Admin Role');
bullet('Salary Configuration: Yes (permission always true for SA)');
bullet('Employee CTC, payroll full lifecycle including reopen: Yes');
bullet('Employee Payslips nav page: Hidden in AppLayout');
bullet('Open payslip by ID: Allowed');
bullet('My Employee Portal shortcut: No (non-SA only)');
para('Files: payrollRoutes.js, AppLayout.jsx, permissionService.js');

h2('4. Admin Role');
bullet('Create/update employees, salary config, CTC: Yes');
bullet('Payroll create/calculate/submit/approve/lock/paid: Yes');
bullet('Reopen: No');
bullet('Attendance, corrections, override: Yes');
bullet('Employee Payslips + My Employee Portal: Yes');

h2('5. HR Role');
bullet('Employees, salary config, CTC: Yes');
bullet('Payroll create/calculate/submit: Yes');
bullet('Approve/Lock/Mark Paid: Route blocked (SA/ADMIN only)');
bullet('Corrections + override + Employee Payslips + Employee Portal: Yes');

h2('6. Manager Role');
bullet('List employees: Yes; Create employee: No');
bullet('Salary config update: No; salary setup GET: permission gap risk');
bullet('Payroll runs/dashboard: View only');
bullet('Calculate/submit/approve: No');
bullet('Attendance + correction approval: Yes; Manual override: No');
bullet('Employee Payslips + My Employee Portal: Yes');
para('Seed: 007_salary_payroll_assets_access.sql — MANAGER payroll view only, no salary row.');

h2('7. Employee Role');
bullet('Punch in/out, my attendance, correction request, leave: Yes');
bullet('Live My Salary / CTC screen: NOT IMPLEMENTED');
bullet('My Payslips (own only): Yes');
para('Nav: employeeNavigation in navigation.js');

h2('8. Employee Creation → Salary Flow');
mono(`Employees form → POST /employees → employeeController.createEmployee
→ INSERT employees (NO ctc, NO salary tables)
→ optional user_company_scopes for ADMIN/HR/MANAGER`);
para('Payroll Calculate selects ACTIVE employees of run.company_id excluding SUPER_ADMIN. Missing structure → item notes "Salary setup missing…", net_pay null. Salary is a separate step on /admin/payroll.');

h2('9. CTC → Salary Components');
para('Input: Annual CTC only. Monthly CTC = annual / 12. Engine: calculateSalaryStructure in salaryCalculationService.js.');
table(
  ['Component', 'Formula', 'Source'],
  [
    ['Monthly CTC', 'annualCtc / 12', 'computed'],
    ['Basic', 'monthlyCtc × basic_percent/100', 'config (default 40)'],
    ['DA', 'basic × da_percent_of_basic/100', 'config (default 0)'],
    ['HRA', 'basic × hra_percent_of_basic/100', 'config (default 50)'],
    ['Employer PF', 'min(Basic+DA, ceiling) × er%', 'config'],
    ['Gratuity', 'if enabled: basic × gratuity%', 'config + flags'],
    ['Special Allowance', 'monthlyCtc − basic−da−hra−erPF−gratuity', 'residual'],
    ['Bonus', 'optional % of basic by type', 'config + flags'],
    ['Attendance Bonus', 'flat if attendance% ≥ min', 'config + flags'],
    ['Conveyance / Other', 'NOT IMPLEMENTED', '—'],
    ['Gross (month)', 'payable earnings + bonuses', 'engine'],
    ['Net', 'Gross − Emp PF − PT − ESI − other', 'engine']
  ]
);
para('APIs: POST /payroll/calculate-preview, PUT /payroll/employee/:id/setup. Display: PayrollPage Breakdown. Employee portal: not until payslip.');

h2('10. Salary Configuration → Payroll Connection');
para('CONNECTED: salary_configurations → getSalaryConfiguration → calculateSalaryStructure / calculateEmployeeSalary → CTC save + payroll Calculate.');
bullet('Used: basic/da/hra %, PF, PT, optional ESI, bonus, attendance bonus, gratuity, payroll_day_basis, company_address');
bullet('statutory_rules can merge PT; ESI is config-driven');

h2('11. Punch In → Punch Out Flow');
mono(`MyAttendance.jsx
  → POST /attendance/punch-in → punch_in=NOW(), status=PRESENT
  → POST /attendance/punch-out → punch_out=NOW(),
     total_work_minutes=TIMESTAMPDIFF(MINUTE, punch_in, NOW()),
     status by minutes (see Daily Status)`);
para('Table: attendance (database/schema.sql)');

h2('12. Working Hours Calculation');
para('Actual: TIMESTAMPDIFF(MINUTE, punch_in, punch_out) → total_work_minutes.');
table(
  ['Feature', 'Status'],
  [
    ['Break deduction', 'NOT IMPLEMENTED'],
    ['Grace / late / early leave', 'NOT IMPLEMENTED'],
    ['Overtime', 'NOT IMPLEMENTED'],
    ['Min hours Present/Half/Absent', 'Yes via punch-out CASE'],
    ['Hours → salary directly', 'No — via status → paid/LOP → pro-rata']
  ]
);

h2('13. Daily Attendance Status');
table(
  ['Status', 'How determined', 'Payroll effect'],
  [
    ['PRESENT', 'Punch-in; punch-out ≥480 min', '+1 paid day'],
    ['HALF_DAY', 'Punch-out 180–479 min', '+0.5 paid'],
    ['ABSENT', 'Punch-out <180 min', '+1 LOP'],
    ['LEAVE', 'Enum; leave approve does NOT write attendance', 'Would be paid if present'],
    ['WEEK_OFF', 'Enum; no writer found', 'Would be paid'],
    ['HOLIDAY', 'Enum; no writer found', 'Would be paid'],
    ['MISSING_PUNCH', 'Enum; no auto-writer found', '+1 LOP'],
    ['Unmarked (no row)', 'No punch', 'Credited as paid (not LOP)']
  ]
);
para('File: attendanceController.js punchOut CASE.');

h2('14. Monthly Attendance Calculation');
para('Function: getAttendanceSummary(employeeId, year, month) — queries attendance for month, groups by status. No separate monthly attendance table.');

h2('15. Attendance → Paid Days → LOP');
mono(`lopDays = ABSENT + MISSING_PUNCH
paidDays ≈ PRESENT + 0.5*HALF_DAY + LEAVE + WEEK_OFF + HOLIDAY + unmarked credited
If no attendance rows → paidDays = full basis, lopDays = 0
If FIXED_30_DAYS → paidDays = max(0, 30 − lopDays)

coreGross = Basic+DA+HRA+SpecialAllowance
payableCore = (coreGross / basisDays) × paidDays
components scaled by attendanceRatio = paidDays/basisDays
grossSalary = payable earnings + bonuses
netPay = gross − PF − PT − ESI − otherDeductions`);
para('other_deductions on run item stores LOP amount (not loan).');

h2('16. Attendance Correction Flow');
mono(`Employee → POST /attendance/corrections → PENDING
Reviewer → POST .../approve|reject
  Approve: upsertAttendanceForDate (UPDATE/INSERT attendance)
  Reject: status REJECTED; attendance unchanged`);
h3('review_comment error (root cause)');
bullet('DB column: reviewer_comment (schema.sql)');
bullet('Historical bug: controller used review_comment → unknown column');
bullet('Current code: uses reviewer_comment');
bullet('API: POST /attendance/corrections/:id/approve (and reject)');
para('If deployed build still has old SQL, approve fails until that code is deployed.');

h2('17. Attendance Correction → Payroll');
para('Approve updates attendance in place. Next Calculate reads getAttendanceSummary → uses corrected data. Locked/calculated items are not auto-refreshed; recalculate while DRAFT/SUBMITTED. Rejected corrections ignored.');

h2('18. Salary Calculation Layers');
table(
  ['Layer', 'Location'],
  [
    ['Engine', 'salaryCalculationService.calculateSalaryStructure'],
    ['+ attendance', 'calculateEmployeeSalary → getAttendanceSummary'],
    ['Payroll item', 'payrollService.calculateEmployeePayrollItem'],
    ['Persist', 'payrollController.calculatePayrollRun → payroll_run_items']
  ]
);

h2('19. PF Calculation');
mono(`pfBase = min(Basic + DA, pf_wage_ceiling)  // default 15000
employeePf = pfBase × (employee_pf_percent/100)  // default 12
employerPf = pfBase × (employer_pf_percent/100)  // default 13`);
para('Matches expected 12%/13% with ₹15k ceiling (15000×0.12=1800). Not hardcoded 1800/1950. Payroll month uses attendance-scaled Basic+DA.');

h2('20. ESI');
para('IMPLEMENTED (optional) via migration 012_optional_esi_configuration.sql. Default enable_esi=0 → ₹0. If enabled: gross × configured %. Above esi_wage_ceiling → ₹0. Stored on payroll_run_items.esi_*. UI: ESI card on PayrollPage.jsx.');

h2('21. Payroll Run Stages');
table(
  ['Stage', 'Who', 'API', 'DB Status'],
  [
    ['Create', 'SA/ADMIN/HR', 'POST /payroll/runs', 'DRAFT'],
    ['Calculate / Import Att.', 'SA/ADMIN/HR', 'POST .../calculate', 'unchanged; rebuilds items'],
    ['Submit', 'SA/ADMIN/HR', 'POST .../submit', 'SUBMITTED'],
    ['Approve', 'SA/ADMIN', 'POST .../approve', 'APPROVED'],
    ['Lock', 'SA/ADMIN', 'POST .../lock', 'LOCKED'],
    ['Mark Paid + payslips', 'SA/ADMIN', 'POST .../payment', 'PAID + payslip_records'],
    ['Reopen', 'SA only', 'POST .../reopen', 'DRAFT']
  ]
);
para('No DB status CALCULATED. Dashboard: GET /payroll/dashboard. Approve blocks missing structure / null net.');

h2('22. Payroll Approval');
para('transitionPayroll + permission payroll:approve for APPROVED/LOCKED. HR UI may show Approve; API rejects non-SA/ADMIN.');

h2('23. Payslip Generation');
bullet('On Mark Paid: insert payslip_records (PS-{runId}-{employeeId}-{timestamp})');
bullet('Notify PAYSLIP_GENERATED; amounts from payroll_run_items snapshot');
bullet('PDF: frontend jsPDF (MyPayslips.jsx / EmployeePayslipsPage.jsx)');
bullet('Email payslip: NOT IMPLEMENTED');

h2('24. Role-Based Payslip Access');
table(
  ['Role', 'Access'],
  [
    ['EMPLOYEE', 'Own only'],
    ['ADMIN/HR/MANAGER', 'Scoped company list GET /payroll/payslips'],
    ['SUPER_ADMIN', 'List page blocked in UI; by-ID allowed']
  ]
);

h2('25. Database Structure');
mono(`companies
employees ──┬── attendance
            ├── attendance_correction_requests
            ├── leave_requests  (not auto-synced to attendance)
            ├── employee_salary_structures ── salary_components
            ├── user_company_scopes
            └── payslip_records

salary_configurations (company)
statutory_rules (optional PT merge)
payroll_runs ── payroll_run_items ── payslip_records
             └── payroll_adjustments
role_permissions + audit logs`);

h2('26. Key API Map');
table(
  ['Function', 'Endpoint'],
  [
    ['Create employee', 'POST /employees'],
    ['Salary config', 'GET/PUT /payroll/config'],
    ['Preview CTC', 'POST /payroll/calculate-preview'],
    ['Employee setup', 'GET/PUT /payroll/employee/:id/setup'],
    ['Dashboard', 'GET /payroll/dashboard'],
    ['Runs', 'GET/POST /payroll/runs'],
    ['Calculate', 'POST /payroll/runs/:id/calculate'],
    ['Submit/Approve/Lock/Paid/Reopen', 'POST .../submit|approve|lock|payment|reopen'],
    ['My payslips', 'GET /payroll/me/payslips'],
    ['Staff payslips', 'GET /payroll/payslips'],
    ['Payslip detail', 'GET /payroll/payslips/:id'],
    ['Punch', 'POST /attendance/punch-in|out'],
    ['Corrections', '/attendance/corrections…'],
    ['Leave', '/leave…']
  ]
);

h2('27. Frontend Structure');
table(
  ['Screen', 'Route', 'Component'],
  [
    ['Salary & Payroll', '/admin/payroll', 'PayrollPage.jsx'],
    ['Employee Payslips', '/admin/employee-payslips', 'EmployeePayslipsPage.jsx'],
    ['Corrections', '/admin/attendance-corrections', 'AttendanceCorrectionsPage.jsx'],
    ['Attendance admin', '/admin/attendance', 'AttendanceManagement.jsx'],
    ['My Attendance', '/employee/attendance', 'MyAttendance.jsx'],
    ['My Payslips', '/employee/payslips', 'MyPayslips.jsx']
  ]
);
para('No separate SA/HR/Manager payroll apps — shared admin layout.');

h2('28. Complete Technical Flow');
mono(`Punch In → MyAttendance → POST /attendance/punch-in → attendance
Punch Out → minutes + PRESENT|HALF_DAY|ABSENT
Correction approve → upsertAttendanceForDate
Admin Calculate → POST /payroll/runs/:id/calculate
  → calculateEmployeePayrollItem
  → getActiveSalaryStructure + getSalaryConfiguration
  → getAttendanceSummary + calculateSalaryStructure
  → INSERT payroll_run_items
Submit → Approve → Lock → payment → payslip_records
Employee → MyPayslips → GET payslip → jsPDF download`);

h2('29. Complete Business Flow');
para('1) HR/Admin creates employee. 2) Sets Annual CTC (and optional company %). 3) Employee marks attendance. 4) Forgotten punch → correction → approve → attendance fixed. 5) HR/Admin Calculate payroll. 6) Admin/SA approve, lock, mark paid. 7) Employee downloads payslip. Leave approval alone does not mark attendance LEAVE for payroll.');

h2('30. Current Working Features');
bullet('CTC auto structure + company config wired to calc; PF ceiling; optional ESI');
bullet('Punch + hour-based Present/Half/Absent; correction → next Calculate');
bullet('Payroll status machine + payslip records; client PDF');
bullet('RBAC routes + role_permissions + company scopes; audit on key actions');

h2('31. Current Missing Features');
table(
  ['Item', 'Status'],
  [
    ['Employee live salary view', 'NOT IMPLEMENTED'],
    ['Leave → attendance LEAVE rows', 'NOT CONNECTED'],
    ['Auto WEEK_OFF / HOLIDAY / MISSING_PUNCH', 'NOT FOUND'],
    ['Conveyance, TDS, loan', 'NOT IMPLEMENTED'],
    ['Server PDF / email payslip', 'NOT IMPLEMENTED'],
    ['CALCULATED status', 'NOT (stays DRAFT/SUBMITTED)'],
    ['Break/OT/grace salary rules', 'NOT IMPLEMENTED']
  ]
);

h2('32. Current Bugs / Fragile Points');
table(
  ['Issue', 'Nature'],
  [
    ['review_comment vs reviewer_comment', 'Was broken; repo now uses reviewer_comment'],
    ['HR Approve button vs API', 'UI may offer; API forbids'],
    ['MANAGER GET salary setup', 'Route allows; salary:view seed missing'],
    ['Unmarked days = paid', 'Soft attendance → low LOP if no punch'],
    ['Leave ignored by payroll', 'Unless attendance has LEAVE'],
    ['Import Attendance = Calculate', 'Same endpoint']
  ]
);

h2('33. Architecture Diagram');
mono(`SUPER ADMIN
  ├── salary_configurations / payroll reopen / approve-lock-pay
  └── Salary & Payroll page (no Employee Payslips nav)

ADMIN / HR
  ├── employees + employee_salary_structures
  ├── attendance / override (HR+)
  ├── payroll_runs: create → calculate → submit
  └── ADMIN: approve → lock → paid → payslip_records

MANAGER
  ├── attendance + correction approve
  ├── payroll view + employee payslips
  └── salary setup API: permission gap risk

EMPLOYEE
  ├── punch → attendance
  ├── corrections + leave_requests
  └── payslip_records → My Payslips

attendance → getAttendanceSummary → calculateSalaryStructure
salary_configurations ──────────────────┘
employee_salary_structures (CTC) ───────┘
        → payroll_run_items → (PAID) payslip_records → Employee`);

h2('34. Recommended Implementation Order');
para('(Guidance only)');
bullet('1. Confirm correction approve on deployed code uses reviewer_comment');
bullet('2. Leave approve → write attendance LEAVE (or payroll read leave_requests)');
bullet('3. Decide unmarked-day policy (credit vs LOP)');
bullet('4. Auto MISSING_PUNCH / WEEK_OFF / HOLIDAY if required');
bullet('5. Fix MANAGER salary permission vs route');
bullet('6. Align HR payroll UI with approve restrictions');
bullet('7. Optional: employee read-only My Salary Structure');
bullet('8. TDS/loan/conveyance only if product requires');

h2('Role Access Summary');
table(
  ['Role', 'Salary', 'Payroll', 'Payslip'],
  [
    ['SUPER_ADMIN', 'Full', 'Full + reopen', 'By ID; list hidden'],
    ['ADMIN', 'Full', 'Full except reopen', 'Staff list'],
    ['HR', 'Full', 'Create/calc/submit', 'Staff list'],
    ['MANAGER', 'Fragile view', 'View only', 'Staff list'],
    ['EMPLOYEE', 'None live', 'Own payslips', 'Own only']
  ]
);

y += 6;
ensureSpace(20);
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.text('End of document', margin, y);
y += 6;
doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
para('This PDF is a code-verified analysis of the existing SRSB HRMS. It must not be treated as a specification of unimplemented features.');

// Footer on all pages
const total = doc.internal.getNumberOfPages();
for (let i = 1; i <= total; i++) {
  doc.setPage(i);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `SRSB HRMS — Salary & Payroll Complete Flow | Page ${i} of ${total}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const buf = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outPath, buf);
console.log('PDF_WRITTEN', outPath);
console.log('PAGES', total);
console.log('BYTES', buf.length);
