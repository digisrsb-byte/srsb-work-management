import crypto from 'node:crypto';
import { getMasterPool, testDatabaseConnection } from '../config/database.js';
import { ensurePlatformSchema } from '../migrations/ensurePlatformSchema.js';

function parseArgs(argv) {
  const options = {
    expiresDays: 90,
    note: null,
    createdBy: 'cli'
  };

  for (const arg of argv) {
    if (arg.startsWith('--expires-days=')) {
      options.expiresDays = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--note=')) {
      options.note = arg.slice('--note='.length);
    } else if (arg.startsWith('--created-by=')) {
      options.createdBy = arg.slice('--created-by='.length);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function generateActivationCode() {
  // Readable chunks: XXXX-XXXX-XXXX-XXXX
  const raw = crypto.randomBytes(8).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g).join('-');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(`Usage:
  npm run activation:create -- [--expires-days=90] [--note="Acme Corp"] [--created-by=you]

Creates an unused activation code in the master (platform) database.`);
    process.exit(0);
  }

  await ensurePlatformSchema();
  await testDatabaseConnection(getMasterPool());

  const code = generateActivationCode();
  let expiresAt = null;
  if (
    Number.isFinite(options.expiresDays) &&
    options.expiresDays > 0
  ) {
    expiresAt = new Date(
      Date.now() + options.expiresDays * 24 * 60 * 60 * 1000
    );
  }

  const master = getMasterPool();
  const [result] = await master.query(
    `INSERT INTO activation_codes (code, note, created_by, expires_at)
     VALUES (?, ?, ?, ?)`,
    [
      code,
      options.note || null,
      options.createdBy || 'cli',
      expiresAt
    ]
  );

  console.log('Activation code created:');
  console.log(`  id:         ${result.insertId}`);
  console.log(`  code:       ${code}`);
  console.log(
    `  expires_at: ${expiresAt ? expiresAt.toISOString() : '(none)'}`
  );
  if (options.note) {
    console.log(`  note:       ${options.note}`);
  }
}

main().catch((error) => {
  console.error('Failed to create activation code:', error.message);
  process.exit(1);
});
