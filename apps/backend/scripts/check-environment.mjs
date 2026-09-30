// Read-only environment classification. Prints categories and aggregate counts only —
// never hostnames, usernames, passwords, keys, connection strings or row values.
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

function hostCategory(host) {
  const value = String(host || 'localhost').trim().toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(value)) return 'loopback (this machine)';
  if (net.isIP(value)) {
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(value)) {
      return 'private network address';
    }
    return 'public IP address';
  }
  return 'remote hostname';
}

const isLocalUrl = (value) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(value || '').trim());
const placeholder = (value, samples) => !value || samples.some((s) => String(value).includes(s));

const report = {
  NODE_ENV: process.env.NODE_ENV || '(unset → development)',
  DEMO_MODE: process.env.DEMO_MODE === 'true',
  db_host: hostCategory(process.env.DB_HOST),
  db_name_is_documented_production_name: (process.env.DB_NAME || 'srsb_hrms') === 'srsb_hrms',
  db_user_is_root: (process.env.DB_USER || 'root') === 'root',
  jwt_secret_is_placeholder_or_default: placeholder(process.env.JWT_SECRET, ['replace_with', 'development-only']),
  cors_origin_is_localhost: String(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').every(isLocalUrl),
  app_base_url_is_localhost: isLocalUrl(process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173'),
  smtp_configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
  field_encryption_keys_configured: Boolean(process.env.FIELD_ENCRYPTION_KEYS)
};
console.log('Configuration (classified):');
for (const [key, value] of Object.entries(report)) console.log(`  ${key}: ${value}`);

const password = String(process.env.DB_PASSWORD || '').replace(/^(['"])(.*)\1$/, '$2');
let conn;
try {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password,
    database: process.env.DB_NAME || 'srsb_hrms'
  });
  const [dbs] = await conn.query('SHOW DATABASES');
  const system = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
  const appDbs = dbs.map((d) => Object.values(d)[0]).filter((n) => !system.has(n));
  const [[employees]] = await conn.query(
    `SELECT COUNT(*) AS total, SUM(is_demo = 1) AS demo, SUM(account_type = 'SYSTEM') AS system_accounts
     FROM employees`
  );
  const [[bank]] = await conn.query(
    `SELECT COUNT(*) AS rows_total, SUM(e.is_demo = 1) AS demo_rows
     FROM employee_bank_details b INNER JOIN employees e ON e.id = b.employee_id`
  );
  const [[payroll]] = await conn.query(`SELECT COUNT(*) AS runs, SUM(status = 'PAID') AS paid FROM payroll_runs`);
  const [[audit]] = await conn.query(
    `SELECT COUNT(*) AS entries, DATEDIFF(MAX(created_at), MIN(created_at)) AS span_days FROM audit_logs`
  );
  console.log('\nDatabase server (aggregates only):');
  console.log(`  application databases on this server: ${appDbs.length} (${appDbs.includes('srsb_hrms_staging') ? 'a staging database exists' : 'no separate staging database found'})`);
  console.log(`  employees: ${employees.total} total, ${Number(employees.demo || 0)} flagged demo, ${Number(employees.system_accounts || 0)} system accounts`);
  console.log(`  bank detail rows: ${bank.rows_total} total, ${Number(bank.demo_rows || 0)} belong to demo-flagged employees`);
  console.log(`  payroll runs: ${payroll.runs} total, ${Number(payroll.paid || 0)} paid`);
  console.log(`  audit log: ${audit.entries} entries spanning ${audit.span_days ?? 0} days`);
} catch (error) {
  console.log(`\nDatabase check failed: ${error.code || 'error'}`);
} finally {
  await conn?.end();
}
