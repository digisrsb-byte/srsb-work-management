import { pool } from '../config/database.js';

async function columnExists(
  databaseName,
  columnName
) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'employees'
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [
      databaseName,
      columnName
    ]
  );

  return rows.length > 0;
}

export async function ensureTenantSecuritySchema(
  databaseName
) {
  await pool.query(
    'ALTER TABLE employees MODIFY employee_id VARCHAR(30) NULL'
  );

  if (
    !(await columnExists(
      databaseName,
      'username'
    ))
  ) {
    await pool.query(
      'ALTER TABLE employees ADD COLUMN username VARCHAR(80) NULL UNIQUE AFTER employee_id'
    );
  }

  if (
    !(await columnExists(
      databaseName,
      'recovery_email'
    ))
  ) {
    await pool.query(
      'ALTER TABLE employees ADD COLUMN recovery_email VARCHAR(160) NULL AFTER email'
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_employee (employee_id),
      INDEX idx_password_reset_expiry (expires_at),
      CONSTRAINT fk_password_reset_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL UNIQUE,
      status ENUM(
        'PENDING',
        'RESOLVED',
        'REJECTED'
      ) NOT NULL DEFAULT 'PENDING',
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      resolved_by INT NULL,
      CONSTRAINT fk_password_reset_request_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_password_reset_request_admin
        FOREIGN KEY (resolved_by)
        REFERENCES employees(id)
        ON DELETE SET NULL
    )
  `);
}
