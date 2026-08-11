import bcrypt from 'bcryptjs';
import { getTenantPool, testDatabaseConnection } from '../config/database.js';
import { env } from '../config/env.js';

function parseArgs(argv) {
  const options = { email: '', password: '', help: false };
  for (const arg of argv) {
    if (arg.startsWith('--email=')) options.email = arg.slice('--email='.length).trim();
    else if (arg.startsWith('--password=')) options.password = arg.slice('--password='.length);
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.email || !options.password) {
    console.log(`Usage:
  node src/scripts/resetEmployeePassword.js --email=info@srsbworkforcesolutions.com --password=SRSB@12345

Resets password in the default tenant DB (DB_NAME).`);
    process.exit(options.help ? 0 : 1);
  }

  if (options.password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const pool = getTenantPool(env.dbName);
  await testDatabaseConnection(pool);

  const hash = await bcrypt.hash(options.password, 12);
  const [result] = await pool.query(
    `UPDATE employees
     SET password_hash = ?, must_change_password = FALSE, password_changed_at = NOW()
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [hash, options.email]
  );

  if (!result.affectedRows) {
    throw new Error(`No employee found with email: ${options.email}`);
  }

  console.log(`Password updated for ${options.email} in DB ${env.dbName}`);
}

main().catch((error) => {
  console.error('Password reset failed:', error.message);
  process.exit(1);
});
