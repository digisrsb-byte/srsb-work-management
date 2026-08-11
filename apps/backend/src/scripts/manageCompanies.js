import {
  getMasterPool,
  testDatabaseConnection
} from '../config/database.js';
import { ensurePlatformSchema } from '../migrations/ensurePlatformSchema.js';

function parseArgs(argv) {
  const options = {
    command: null,
    code: null,
    help: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--code=')) {
      options.code = arg.slice('--code='.length).trim().toUpperCase();
    } else if (!arg.startsWith('--') && !options.command) {
      options.command = arg.trim().toLowerCase();
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run companies:list
  npm run companies:suspend -- --code=ACME
  npm run companies:activate -- --code=ACME

Lists or updates company status in the master (platform) database.
Suspended companies cannot log in; their JWT sessions are rejected.`);
}

async function listCompanies() {
  const master = getMasterPool();
  const [rows] = await master.query(
    `SELECT id, code, name, display_name, db_name, status, created_at, updated_at
     FROM companies
     ORDER BY created_at ASC`
  );

  if (!rows.length) {
    console.log('No companies registered.');
    return;
  }

  console.log(`Companies (${rows.length}):`);
  for (const row of rows) {
    console.log(
      `  ${row.code.padEnd(12)} ${String(row.status).padEnd(10)} db=${row.db_name}  ${row.display_name || row.name}`
    );
  }
}

async function setStatus(code, status) {
  if (!code) {
    throw new Error('Missing --code=COMPANYCODE');
  }

  const master = getMasterPool();
  const [result] = await master.query(
    `UPDATE companies SET status = ? WHERE code = ?`,
    [status, code]
  );

  if (!result.affectedRows) {
    throw new Error(`Company not found: ${code}`);
  }

  const [[row]] = await master.query(
    `SELECT code, name, display_name, db_name, status FROM companies WHERE code = ? LIMIT 1`,
    [code]
  );

  console.log(
    `Updated ${row.code} → ${row.status} (${row.display_name || row.name}, db=${row.db_name})`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.command) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  await ensurePlatformSchema();
  await testDatabaseConnection(getMasterPool());

  if (options.command === 'list') {
    await listCompanies();
    return;
  }

  if (options.command === 'suspend') {
    await setStatus(options.code, 'SUSPENDED');
    return;
  }

  if (options.command === 'activate') {
    await setStatus(options.code, 'ACTIVE');
    return;
  }

  printHelp();
  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error('Company management failed:', error.message);
  process.exit(1);
});
