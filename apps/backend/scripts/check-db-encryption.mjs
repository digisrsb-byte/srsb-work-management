// Read-only report of MySQL at-rest encryption and TLS status for the app database.
// Prints settings and flags only — no row values, credentials, keys or file paths.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const SENSITIVE_TABLES = ['employee_bank_details', 'employee_documents', 'document_versions', 'document_submissions'];
const password = String(process.env.DB_PASSWORD || '').replace(/^(['"])(.*)\1$/, '$2');
const database = process.env.DB_NAME || 'srsb_hrms';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password,
  database
});

async function variables(names) {
  const [rows] = await conn.query('SHOW GLOBAL VARIABLES WHERE Variable_name IN (?)', [names]);
  return Object.fromEntries(rows.map((r) => [r.Variable_name, r.Value]));
}

try {
  const [[id]] = await conn.query(
    'SELECT @@server_uuid AS server_uuid, @@port AS port, VERSION() AS version, DATABASE() AS db'
  );
  console.log('Server fingerprint (compare with your session):');
  console.log(`  server_uuid: ${id.server_uuid}`);
  console.log(`  port: ${id.port}, version: ${id.version}, database: ${id.db}`);

  const [spaces] = await conn.query(
    `SELECT SUBSTRING_INDEX(NAME, '/', -1) AS table_name, ENCRYPTION
     FROM information_schema.INNODB_TABLESPACES
     WHERE NAME IN (?)`,
    [SENSITIVE_TABLES.map((t) => `${database}/${t}`)]
  );
  const [options] = await conn.query(
    `SELECT TABLE_NAME, CREATE_OPTIONS FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)`,
    [database, SENSITIVE_TABLES]
  );
  const [[schema]] = await conn.query(
    'SELECT DEFAULT_ENCRYPTION FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [database]
  );
  console.log('\nTablespace encryption:');
  console.log(`  schema default encryption: ${schema.DEFAULT_ENCRYPTION}`);
  for (const table of SENSITIVE_TABLES) {
    const space = spaces.find((s) => s.table_name === table);
    const opt = options.find((o) => o.TABLE_NAME === table);
    console.log(`  ${table}: ENCRYPTION=${space?.ENCRYPTION ?? 'n/a'}; create options="${opt?.CREATE_OPTIONS ?? ''}"`);
  }
  const [[shared]] = await conn.query(
    `SELECT SUM(ENCRYPTION = 'Y') AS encrypted, COUNT(*) AS total
     FROM information_schema.INNODB_TABLESPACES WHERE NAME LIKE CONCAT(?, '/%')`,
    [database]
  );
  console.log(`  all ${database} tablespaces: ${Number(shared.encrypted || 0)} of ${shared.total} encrypted`);

  console.log('\nServer encryption settings:');
  const enc = await variables([
    'default_table_encryption', 'innodb_redo_log_encrypt', 'innodb_undo_log_encrypt',
    'binlog_encryption', 'table_encryption_privilege_check', 'log_bin', 'innodb_file_per_table'
  ]);
  for (const [k, v] of Object.entries(enc)) console.log(`  ${k}: ${v}`);

  const [keyringPlugins] = await conn.query(
    `SELECT PLUGIN_NAME, PLUGIN_STATUS FROM information_schema.PLUGINS WHERE PLUGIN_NAME LIKE 'keyring%'`
  );
  let componentStatus = 'not available';
  try {
    const [rows] = await conn.query('SELECT STATUS_KEY, STATUS_VALUE FROM performance_schema.keyring_component_status');
    const active = rows.find((r) => r.STATUS_KEY === 'Component_status');
    componentStatus = rows.length ? (active?.STATUS_VALUE || 'present') : 'no keyring component loaded';
  } catch {
    componentStatus = 'status table not available';
  }
  console.log('\nKeyring:');
  console.log(`  keyring plugins: ${keyringPlugins.length ? keyringPlugins.map((p) => `${p.PLUGIN_NAME}=${p.PLUGIN_STATUS}`).join(', ') : 'none'}`);
  console.log(`  keyring component: ${componentStatus}`);

  console.log('\nTLS:');
  const tls = await variables(['have_ssl', 'require_secure_transport', 'tls_version', 'admin_tls_version']);
  for (const [k, v] of Object.entries(tls)) console.log(`  ${k}: ${v}`);
  const [certVars] = await conn.query(`SHOW GLOBAL VARIABLES WHERE Variable_name IN ('ssl_ca','ssl_cert','ssl_key')`);
  for (const v of certVars) console.log(`  ${v.Variable_name} configured: ${Boolean(v.Value)}`);
  const [[cipher]] = await conn.query(`SHOW SESSION STATUS LIKE 'Ssl_cipher'`);
  console.log(`  this app connection uses TLS: ${Boolean(cipher?.Value)}${cipher?.Value ? ` (${cipher.Value})` : ''}`);
  const [[expiry]] = await conn.query(`SHOW GLOBAL STATUS LIKE 'Ssl_server_not_after'`);
  console.log(`  server certificate valid until: ${expiry?.Value || 'n/a'}`);

  console.log('\nLogs that could capture query values:');
  const logs = await variables(['general_log', 'slow_query_log', 'log_output']);
  for (const [k, v] of Object.entries(logs)) console.log(`  ${k}: ${v}`);

  const [[accounts]] = await conn.query(
    `SELECT COUNT(*) AS total, SUM(ssl_type <> '') AS require_tls, SUM(Host = '%') AS any_host
     FROM mysql.user WHERE User NOT IN ('mysql.sys','mysql.session','mysql.infoschema')`
  ).catch(() => [[{ total: 'n/a' }]]);
  console.log('\nMySQL accounts (counts only):');
  console.log(`  accounts: ${accounts.total}, requiring TLS: ${accounts.require_tls ?? 'n/a'}, allowed from any host: ${accounts.any_host ?? 'n/a'}`);
} finally {
  await conn.end();
}
