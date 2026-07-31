import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

dotenv.config({
  path: path.resolve(currentDirectory, '../.env')
});

async function runMigration() {
  let pool;

  try {
    const databaseModule = await import(
      './config/database.js'
    );

    pool = databaseModule.pool;

    const migrationPath = path.resolve(
      currentDirectory,
      '../migrations/001_create_notifications.sql'
    );

    const sql = await fs.readFile(migrationPath, 'utf8');

    await pool.query(sql);

    console.log(
      'Notifications table created successfully.'
    );
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

runMigration();