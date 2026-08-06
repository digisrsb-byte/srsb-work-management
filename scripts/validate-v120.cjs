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
  if (data.version !== '1.2.0') fail(`${relative} version is ${data.version}, expected 1.2.0`);
  else pass(`${relative} version 1.2.0`);
}

requireText('apps/backend/src/server.js', ['ensureV120Schema', 'await ensureV120Schema()']);
requireText('apps/backend/src/migrations/ensureV120Schema.js', ['invoice_items', 'invoice_settings', 'task_extension_requests', 'show_greeting', 'date_of_birth', 'bank_account_number VARCHAR(80) NULL']);
requireText('apps/backend/src/controllers/candidateController.js', ['getCandidateReferenceData', 'linkCandidateApplication', 'listCandidatePlacements']);
requireText('apps/backend/src/controllers/invoiceController.js', ['PERCENTAGE_CTC', 'invoice_items', 'getInvoiceSettings']);
requireText('apps/backend/src/routes/invoiceRoutes.js', ["router.use(authenticate, allowRoles('SUPER_ADMIN'))"]);
requireText('apps/backend/src/controllers/taskController.js', ['requestTaskExtension', 'reviewTaskExtension', 'getTaskHistory', 'normaliseTaskField', 'Enter a reason when changing the task due date.']);
requireText('apps/backend/src/controllers/attendanceController.js', ['attendanceCalendar', 'adminAdjustAttendance']);
requireText('apps/frontend/src/pages/admin/Invoices.jsx', ['Invoice Preview', 'Preview Invoice', 'Download PDF', 'Placed Candidates']);
requireText('apps/frontend/src/utils/invoicePdf.js', ['TAX INVOICE', 'RECRUITMENT & PLACEMENT SERVICES', 'downloadInvoicePdf', 'invoice-print-frame']);
requireText('apps/frontend/src/pages/admin/Holidays.jsx', ['MonthlyCalendar', 'Dashboard Greeting']);
requireText('apps/frontend/src/pages/Tasks.jsx', ['Request Due-Date Extension', 'Change History']);
requireText('apps/frontend/src/components/AttendanceCalendar.jsx', ["PRESENT: 'Present'", "ABSENT: 'Absent'", "HOLIDAY: 'Holiday'"]);
requireText('apps/frontend/src/pages/admin/Candidates.jsx', ['Source for Company', 'Placement & Employment History']);
requireText('apps/backend/src/controllers/clientController.js', ['c.state_code', 'state_code = ?']);
requireText('apps/frontend/src/pages/Tasks.jsx', ["nextStatus = task.status === 'BLOCKED'", 'Reason for Due-Date Change']);
requireText('apps/frontend/src/layouts/AppLayout.jsx', ["user?.role === 'SUPER_ADMIN'"]);

const migrationSource = read('apps/backend/src/migrations/ensureV120Schema.js');
if (!migrationSource.includes("       NULL,\n       NULL,\n       NULL,\n       NULL,\n       NULL,\n       'Authorised Signatory'")) {
  fail('Invoice bank defaults must remain empty and configurable from Invoice Settings.');
} else {
  pass('Invoice bank details are configurable and not hard-coded.');
}

const backendValidation = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-backend.cjs')], { encoding: 'utf8' });
process.stdout.write(backendValidation.stdout || '');
process.stderr.write(backendValidation.stderr || '');
if (backendValidation.status !== 0) fail('Backend JavaScript validation'); else pass('Backend JavaScript validation');

if (failed) process.exit(1);
console.log('\nSRSB Work Management 1.2.0 source validation: PASS');
