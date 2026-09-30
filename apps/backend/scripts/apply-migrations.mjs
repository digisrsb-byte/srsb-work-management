import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '../..');

dotenv.config({ path: path.join(backendRoot, '.env') });

function normalizePassword(value) {
  let password = value || '';
  if (
    (password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'"))
  ) {
    password = password.slice(1, -1);
  }
  return password;
}

const files = [
  path.join(repoRoot, 'database', 'migrations', '003_employee_profile.sql'),
  path.join(backendRoot, 'migrations', '001_create_notifications.sql'),
  path.join(backendRoot, 'migrations', '002_add_opening_closed_by.sql'),
  path.join(backendRoot, 'migrations', '003_add_password_changed_at.sql'),
  path.join(backendRoot, 'migrations', '004_create_password_reset_otps.sql'),
  path.join(backendRoot, 'migrations', '005_companies_permissions_onboarding.sql'),
  path.join(backendRoot, 'migrations', '006_upgrade_notifications_schema.sql'),
  path.join(backendRoot, 'migrations', '007_salary_payroll_assets_access.sql'),
  path.join(backendRoot, 'migrations', '008_company_config_permissions.sql'),
  path.join(backendRoot, 'migrations', '009_asset_assignment_flow.sql'),
  path.join(backendRoot, 'migrations', '010_salary_calculation_engine.sql'),
  path.join(backendRoot, 'migrations', '011_asset_returns_repairs.sql'),
  path.join(backendRoot, 'migrations', '011_attendance_correction_workflow.sql'),
  path.join(backendRoot, 'migrations', '012_onboarding_demo_flags.sql'),
  path.join(backendRoot, 'migrations', '012_optional_esi_configuration.sql'),
  path.join(backendRoot, 'migrations', '013_onboarding_self_service.sql'),
  path.join(backendRoot, 'migrations', '014_employee_account_invitations.sql'),
  path.join(backendRoot, 'migrations', '015_document_withdrawal.sql'),
  path.join(backendRoot, 'migrations', '016_document_draft_uploads.sql'),
  path.join(backendRoot, 'migrations', '017_onboarding_bank_details.sql')
];

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: normalizePassword(process.env.DB_PASSWORD),
  database: process.env.DB_NAME || 'srsb_hrms',
  multipleStatements: true
});

// Optional filters, e.g. `node scripts/apply-migrations.mjs 014` runs only matching files.
const only = process.argv.slice(2);
const selected = only.length
  ? files.filter((file) => only.some((name) => path.basename(file).startsWith(name)))
  : files;

try {
  for (const file of selected) {
    if (!fs.existsSync(file)) {
      console.log('SKIP_MISSING', path.basename(file));
      continue;
    }
    const sql = fs.readFileSync(file, 'utf8');
    try {
      await conn.query(sql);
      console.log('APPLIED', path.basename(file));
    } catch (error) {
      // Ignore already-applied column/table errors.
      if (
        error.code === 'ER_DUP_FIELDNAME' ||
        error.code === 'ER_TABLE_EXISTS_ERROR' ||
        error.errno === 1060 ||
        error.errno === 1050
      ) {
        console.log('ALREADY_APPLIED', path.basename(file));
      } else {
        console.log('FAILED', path.basename(file), error.code || '', error.message);
      }
    }
  }
} finally {
  await conn.end();
}
