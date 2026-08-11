import { getMasterPool, ensureDatabaseExists } from '../config/database.js';
import { env } from '../config/env.js';

/**
 * Ensures the platform / master registry database and tables exist.
 * Safe to run on every boot (additive only).
 */
export async function ensurePlatformSchema() {
  await ensureDatabaseExists(env.masterDbName);
  const pool = getMasterPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) NOT NULL,
      name VARCHAR(220) NOT NULL,
      display_name VARCHAR(220) NULL,
      db_name VARCHAR(64) NOT NULL,
      status ENUM('PENDING','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_companies_code (code),
      UNIQUE KEY uq_companies_db_name (db_name),
      INDEX idx_companies_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activation_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) NOT NULL,
      company_id INT NULL,
      note VARCHAR(255) NULL,
      created_by VARCHAR(160) NULL,
      expires_at DATETIME NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_activation_codes_code (code),
      INDEX idx_activation_codes_unused (used_at, expires_at),
      CONSTRAINT fk_activation_company
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(160) NOT NULL,
      full_name VARCHAR(160) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_platform_admins_email (email)
    )
  `);

  // Register the legacy default tenant (current DB_NAME) if missing.
  await pool.query(
    `INSERT INTO companies (code, name, display_name, db_name, status)
     SELECT ?, ?, ?, ?, 'ACTIVE'
     FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1 FROM companies WHERE code = ? OR db_name = ? LIMIT 1
     )`,
    [
      env.defaultCompanyCode,
      env.defaultCompanyName,
      env.defaultCompanyName,
      env.dbName,
      env.defaultCompanyCode,
      env.dbName
    ]
  );

  console.log(
    `Platform schema ready (master DB: ${env.masterDbName}).`
  );
}
