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

const password = normalizePassword(process.env.DB_PASSWORD);
const dbName = process.env.DB_NAME || 'srsb_hrms';
const host = process.env.DB_HOST || 'localhost';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';

async function main() {
  // Fresh local init used an empty root password; align it with .env.
  const bootstrap = await mysql.createConnection({
    host,
    port,
    user,
    password: '',
    multipleStatements: true
  });

  try {
    if (password) {
      await bootstrap.query(
        `ALTER USER 'root'@'localhost' IDENTIFIED BY ${mysql.escape(password)}`
      );
      await bootstrap.query('FLUSH PRIVILEGES');
      console.log('ROOT_PASSWORD_ALIGNED');
    }
  } finally {
    await bootstrap.end();
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true
  });

  try {
    const schemaPath = path.join(repoRoot, 'database', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await conn.query(schemaSql);
    console.log('SCHEMA_IMPORTED');

    const [tables] = await conn.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.tables
       WHERE table_schema = ?`,
      [dbName]
    );
    console.log('TABLE_COUNT', tables[0].c);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('SETUP_FAILED');
  console.error(error.code || '', error.message);
  process.exit(1);
});
