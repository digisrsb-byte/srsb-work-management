import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations'
);

/**
 * SQL migrations for the companies / permissions / onboarding / payroll /
 * assets / access modules. Order matters: later files alter tables created
 * by earlier ones.
 */
const MODULE_MIGRATIONS = [
  '005_companies_permissions_onboarding.sql',
  '006_upgrade_notifications_schema.sql',
  '007_salary_payroll_assets_access.sql',
  '008_company_config_permissions.sql',
  '009_asset_assignment_flow.sql',
  '010_salary_calculation_engine.sql',
  '011_asset_returns_repairs.sql',
  '011_attendance_correction_workflow.sql',
  '012_onboarding_demo_flags.sql',
  '012_optional_esi_configuration.sql',
  '013_onboarding_self_service.sql',
  '014_employee_account_invitations.sql',
  '015_document_withdrawal.sql',
  '016_document_draft_uploads.sql',
  '017_onboarding_bank_details.sql',
  '018_payroll_release_workflow.sql'
];

// The files were written for a single hard-coded database; the connection
// below already targets the tenant DB, so `USE <db>;` must not switch it.
function stripUseStatements(sql) {
  return sql.replace(/^\s*USE\s+[`\w]+\s*;\s*$/gim, '');
}

/**
 * Apply module migrations to one tenant database, once per file.
 * Applied files are recorded in `schema_migrations` in that tenant DB.
 */
export async function ensureHrmsModulesSchema({ dbName } = {}) {
  if (!dbName) {
    throw new Error('ensureHrmsModulesSchema requires { dbName }');
  }

  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: dbName,
    multipleStatements: true,
    dateStrings: ['DATE', 'DATETIME']
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(190) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await connection.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    for (const name of MODULE_MIGRATIONS) {
      if (applied.has(name)) {
        continue;
      }

      const sql = stripUseStatements(
        fs.readFileSync(path.join(migrationsDir, name), 'utf8')
      );

      try {
        await connection.query(sql);
      } catch (error) {
        throw new Error(
          `Migration ${name} failed on ${dbName}: ${error.code || ''} ${error.message}`
        );
      }

      await connection.query(
        'INSERT INTO schema_migrations (name) VALUES (?)',
        [name]
      );
    }
  } finally {
    await connection.end();
  }

  console.log(`HRMS module schema is ready (${dbName}).`);
}
