const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let failed = false;

function pass(message) { console.log(`PASS: ${message}`); }
function fail(message) { console.error(`FAIL: ${message}`); failed = true; }
function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { fail(`Missing ${relative}`); return ''; }
  return fs.readFileSync(file, 'utf8');
}
function requireText(relative, values) {
  const content = read(relative);
  for (const value of values) {
    if (!content.includes(value)) fail(`${relative} is missing: ${value}`);
  }
  if (content) pass(`${relative}`);
}

const packages = ['package.json','apps/backend/package.json','apps/frontend/package.json','apps/desktop/package.json'];
for (const relative of packages) {
  const data = JSON.parse(read(relative));
  if (data.version !== '1.2.2') fail(`${relative} version is ${data.version}, expected 1.2.2`);
  else pass(`${relative} version 1.2.2`);
}

requireText('apps/backend/src/server.js', ['ensureV120Schema', 'await ensureV120Schema()']);
requireText('apps/backend/src/migrations/ensureV120Schema.js', ['invoice_items', 'invoice_settings', 'task_extension_requests', 'show_greeting', 'date_of_birth', 'bank_account_number VARCHAR(80) NULL']);
requireText('apps/backend/src/controllers/candidateController.js', ['getCandidateReferenceData', 'linkCandidateApplication', 'listCandidatePlacements']);
requireText('apps/backend/src/controllers/invoiceController.js', ['PERCENTAGE_CTC', 'invoice_items', 'getInvoiceSettings']);
requireText('apps/backend/src/routes/invoiceRoutes.js', ["router.use(authenticate, allowRoles('SUPER_ADMIN'))"]);
requireText('apps/backend/src/controllers/taskController.js', ['requestTaskExtension', 'reviewTaskExtension', 'getTaskHistory', 'normaliseTaskField', 'Enter a reason when changing the task due date.']);
requireText('apps/backend/src/controllers/attendanceController.js', [
  'attendanceCalendar',
  'attendanceDayOverview',
  'adminAdjustAttendance',
  "weekday === 'SATURDAY'",
  "status = 'NOT_MARKED'",
  'workedOnHoliday',
  "THEN 'HALF_DAY'",
  "DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date",
  'totalWorkMinutes: 0'
]);
requireText('apps/frontend/src/pages/admin/Invoices.jsx', ['Invoice Preview', 'Preview Invoice', 'Download PDF', 'Placed Candidates', 'Location & Grade', 'Billing CTC', 'Duty Rate %']);
requireText('apps/frontend/src/utils/invoicePdf.js', ['TAX INVOICE', 'Value of Service Rendered', 'downloadInvoicePdf', 'invoice-print-frame', 'authorised-signature.png', 'Total (']);
requireText('apps/frontend/src/pages/admin/Holidays.jsx', ['MonthlyCalendar', 'Dashboard Greeting', 'All holidays from January to December.', 'No holidays found in {selectedYear}.']);
requireText('apps/frontend/src/pages/Tasks.jsx', ['Request Due-Date Extension', 'Change History']);
requireText('apps/frontend/src/components/AttendanceCalendar.jsx', [
  "PRESENT: 'Present'",
  "HOLIDAY: 'Holiday'",
  "NOT_MARKED: 'No Punch / Not Marked'",
  'Worked on Holiday',
  'Punch In:',
  'Punch Out:'
]);
requireText('apps/frontend/src/pages/admin/Candidates.jsx', ['Source for Company', 'Placement & Employment History']);
requireText('apps/backend/src/controllers/clientController.js', ['c.state_code', 'state_code = ?']);
requireText('apps/frontend/src/pages/Tasks.jsx', [
  "nextStatus = task.status === 'BLOCKED'",
  'Reason for Due-Date Change',
  'Edit assigned work',
  'Delete assigned work',
  "const taskAdminRoles = ['SUPER_ADMIN','ADMIN']"
]);
requireText('apps/frontend/src/layouts/AppLayout.jsx', ["user?.role === 'SUPER_ADMIN'"]);
requireText('apps/backend/src/routes/taskRoutes.js', [
  "router.put('/:id', allowRoles('SUPER_ADMIN','ADMIN'), updateTask)",
  "router.delete('/:id', allowRoles('SUPER_ADMIN','ADMIN'), deleteTask)"
]);
requireText('apps/backend/src/utils/attendanceScheduler.js', [
  "UPPER(DAYNAME(${INDIA_DATE_SQL})) <> 'SATURDAY'",
  "COALESCE(e.weekly_off_day, 'SUNDAY')"
]);
requireText('apps/backend/src/controllers/taskController.js', [
  "'TASK_DELETED'",
  "Assigned work \"${task.title}\" deleted successfully."
]);

requireText('apps/backend/src/controllers/openingController.js', [
  'deleteOpening',
  "'JOB_REQUIREMENT_DELETED'",
  'Change its status to Closed instead of deleting it.'
]);
requireText('apps/backend/src/routes/openingRoutes.js', [
  "router.delete(",
  "allowRoles('SUPER_ADMIN', 'ADMIN')"
]);
requireText('apps/frontend/src/pages/admin/Openings.jsx', [
  'Add Requirement',
  'Delete',
  'canManageRequirement',
  'startEditingRequirement',
  'deleteOpening'
]);
requireText('apps/frontend/src/pages/employee/MyAttendance.jsx', [
  'monthlyWorkMinutes',
  'Punch In:',
  'Calculated from this calendar month'
]);

const attendanceSource = read('apps/backend/src/controllers/attendanceController.js');
if (attendanceSource.includes("status = 'ABSENT';\n      remarks = 'Attendance not recorded'")) {
  fail('Attendance calendar must not automatically mark no-punch days absent.');
} else {
  pass('No-punch days remain Not Marked instead of automatic Absent.');
}
if (/THEN\s+'ABSENT'/m.test(attendanceSource)) {
  fail('Punch-out duration must not automatically create Absent status.');
} else {
  pass('Punch-out duration never creates automatic Absent status.');
}

const taskRouteSource = read('apps/backend/src/routes/taskRoutes.js');
if (taskRouteSource.includes("allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER')")) {
  fail('Task create/edit/delete management must be restricted to Admin and Super Admin.');
} else {
  pass('Task management is restricted to Admin and Super Admin.');
}

const migrationSource = read('apps/backend/src/migrations/ensureV120Schema.js');
for (const fixedInvoiceValue of [
  'SRSB WORKFORCE SOLUTIONS PVT LTD',
  '29ABQCS9374K1Z6',
  '13340200111222',
  'FDRL0001334',
  'Federal Bank',
  'Rajajinagar'
]) {
  if (!migrationSource.includes(fixedInvoiceValue)) {
    fail(`Fixed invoice setting is missing: ${fixedInvoiceValue}`);
  }
}
if (!failed) pass('Fixed SRSB invoice and bank details are present.');

requireText('apps/backend/src/routes/attendanceRoutes.js', [
  "'/day-overview'",
  "allowRoles('SUPER_ADMIN', 'ADMIN')",
  'attendanceDayOverview'
]);
requireText('apps/frontend/src/pages/admin/AttendanceManagement.jsx', [
  'Daily Attendance Calendar',
  '/attendance/day-overview',
  'Total Work Time',
  'Past dates show Present or Absent',
  'Future dates never show Absent'
]);
requireText('apps/frontend/src/pages/admin/Clients.jsx', [
  'client-accordion-list',
  'Sorted by company name',
  'Edit Client',
  'Delete Client'
]);
requireText('apps/backend/src/controllers/clientController.js', ['ORDER BY c.company_name ASC']);

const signatureFile = path.join(root, 'apps', 'frontend', 'public', 'authorised-signature.png');
if (!fs.existsSync(signatureFile) || fs.statSync(signatureFile).size < 1000) {
  fail('Authorised signature image is missing or empty.');
} else {
  pass('Authorised signature image is bundled.');
}

requireText('apps/backend/src/utils/indiaTime.js', ['INDIA_DATE_SQL', 'FULL_DAY_MINUTES = 480', 'deriveAttendanceStatus']);
requireText('apps/backend/src/config/database.js', ["dateStrings: ['DATE', 'DATETIME']"]);
requireText('apps/backend/src/controllers/candidateController.js', ['Complete placement details before marking this candidate as JOINED.', "h.employment_status IN ('JOINED','ACTIVE')"]);
requireText('apps/frontend/src/pages/admin/Candidates.jsx', ['Complete Placement', 'Billing CTC *']);

const backendValidation = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-backend.cjs')], { encoding: 'utf8' });
process.stdout.write(backendValidation.stdout || '');
process.stderr.write(backendValidation.stderr || '');
if (backendValidation.status !== 0) fail('Backend JavaScript validation'); else pass('Backend JavaScript validation');

if (failed) process.exit(1);
console.log('\nSRSB Work Management 1.2.2 source validation: PASS');
