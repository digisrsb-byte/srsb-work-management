import { pool as defaultPool } from '../config/database.js';
import { env } from '../config/env.js';

function resolveOptions(options = {}) {
  return {
    pool: options.pool || defaultPool,
    dbName: options.dbName || env.dbName
  };
}

export async function ensureV110Schema(options = {}) {
  const { pool, dbName } = resolveOptions(options);

  async function columnExists(tableName, columnName) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [dbName, tableName, columnName]
    );

    return rows.length > 0;
  }

  async function addColumn(tableName, columnName, definition) {
    if (!(await columnExists(tableName, columnName))) {
      await pool.query(
        `ALTER TABLE \`${tableName}\`
         ADD COLUMN \`${columnName}\` ${definition}`
      );
    }
  }

  async function indexExists(tableName, indexName) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
       LIMIT 1`,
      [dbName, tableName, indexName]
    );

    return rows.length > 0;
  }

  await addColumn('employees', 'account_type', "ENUM('EMPLOYEE','SYSTEM') NOT NULL DEFAULT 'EMPLOYEE' AFTER role");
  await addColumn('employees', 'date_of_birth', 'DATE NULL AFTER phone');
  await addColumn('employees', 'password_changed_at', 'DATETIME NULL AFTER must_change_password');

  await pool.query(
    `CREATE TABLE IF NOT EXISTS notifications (
       id INT AUTO_INCREMENT PRIMARY KEY,
       recipient_id INT NOT NULL,
       actor_id INT NULL,
       type VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
       title VARCHAR(180) NOT NULL,
       message VARCHAR(1000) NOT NULL,
       reference_type VARCHAR(100) NULL,
       reference_id VARCHAR(100) NULL,
       is_read BOOLEAN NOT NULL DEFAULT FALSE,
       read_at DATETIME NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_notifications_recipient_read (recipient_id, is_read, created_at)
     )`
  );

  await addColumn('notifications', 'recipient_id', 'INT NULL AFTER id');
  await addColumn('notifications', 'actor_id', 'INT NULL AFTER recipient_id');
  await addColumn('notifications', 'reference_type', 'VARCHAR(100) NULL AFTER message');
  await addColumn('notifications', 'reference_id', 'VARCHAR(100) NULL AFTER reference_type');
  await addColumn('notifications', 'read_at', 'DATETIME NULL AFTER is_read');

  if (await columnExists('notifications', 'employee_id')) {
    await pool.query(
      `UPDATE notifications
       SET recipient_id = COALESCE(recipient_id, employee_id)
       WHERE recipient_id IS NULL`
    );
    await pool.query('ALTER TABLE notifications MODIFY employee_id INT NULL');
  }

  await pool.query('ALTER TABLE notifications MODIFY recipient_id INT NOT NULL');

  if (!(await indexExists('notifications', 'idx_notifications_recipient_read'))) {
    await pool.query(
      `CREATE INDEX idx_notifications_recipient_read
       ON notifications (recipient_id, is_read, created_at)`
    );
  }

  await pool.query(
    `INSERT IGNORE INTO departments (name, description)
     VALUES
       ('Technical', 'Technical and software team'),
       ('HR', 'Human resources and recruitment team')`
  );

  await addColumn('clients', 'gst_number', 'VARCHAR(32) NULL AFTER company_name');
  await addColumn('clients', 'address_line', 'TEXT NULL AFTER gst_number');
  await addColumn('clients', 'city', 'VARCHAR(120) NULL AFTER address_line');
  await addColumn('clients', 'state', 'VARCHAR(120) NULL AFTER city');
  await addColumn('clients', 'postal_code', 'VARCHAR(16) NULL AFTER state');
  await addColumn('clients', 'company_email', 'VARCHAR(160) NULL AFTER website');
  await addColumn('clients', 'company_phone', 'VARCHAR(25) NULL AFTER company_email');
  await addColumn('clients', 'contact_person_name', 'VARCHAR(120) NULL AFTER company_phone');
  await addColumn('clients', 'contact_person_email', 'VARCHAR(160) NULL AFTER contact_person_name');
  await addColumn('clients', 'contact_person_phone', 'VARCHAR(25) NULL AFTER contact_person_email');

  await pool.query(
    `UPDATE clients
     SET
       company_email = COALESCE(company_email, contact_email),
       company_phone = COALESCE(company_phone, contact_phone),
       contact_person_name = COALESCE(contact_person_name, contact_name),
       contact_person_email = COALESCE(contact_person_email, contact_email),
       contact_person_phone = COALESCE(contact_person_phone, contact_phone)`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS candidate_employment_history (
       id INT AUTO_INCREMENT PRIMARY KEY,
       candidate_id INT NOT NULL,
       client_id INT NULL,
       company_name_snapshot VARCHAR(180) NOT NULL,
       position VARCHAR(180) NOT NULL,
       ctc DECIMAL(14,2) NOT NULL DEFAULT 0,
       joining_date DATE NULL,
       leaving_date DATE NULL,
       employment_status ENUM(
         'OFFERED',
         'JOINED',
         'ACTIVE',
         'LEFT',
         'NO_SHOW',
         'TERMINATED'
       ) NOT NULL DEFAULT 'JOINED',
       reason_for_leaving VARCHAR(500) NULL,
       notes VARCHAR(1000) NULL,
       recorded_by INT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       INDEX idx_candidate_history_candidate (candidate_id),
       INDEX idx_candidate_history_client (client_id),
       CONSTRAINT fk_candidate_history_candidate
         FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
       CONSTRAINT fk_candidate_history_client
         FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
       CONSTRAINT fk_candidate_history_recorder
         FOREIGN KEY (recorded_by) REFERENCES employees(id) ON DELETE SET NULL
     )`
  );

  await addColumn('invoices', 'service_charges', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER billing_model');
  await addColumn('invoices', 'gst_type', "ENUM('NONE','IGST','CGST_SGST') NOT NULL DEFAULT 'NONE' AFTER service_charges");
  await addColumn('invoices', 'igst_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER gst_type');
  await addColumn('invoices', 'cgst_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER igst_amount');
  await addColumn('invoices', 'sgst_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER cgst_amount');
  await addColumn('invoices', 'paid_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER total_amount');
  await addColumn('invoices', 'payment_released', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER paid_amount');
  await addColumn('invoices', 'payment_date', 'DATE NULL AFTER payment_released');
  await addColumn('invoices', 'gst_file_name', 'VARCHAR(255) NULL AFTER payment_date');
  await addColumn('invoices', 'gst_file_mime', 'VARCHAR(120) NULL AFTER gst_file_name');
  await addColumn('invoices', 'gst_file_data', 'LONGBLOB NULL AFTER gst_file_mime');
  await addColumn('invoices', 'notes', 'VARCHAR(1000) NULL AFTER gst_file_data');

  await addColumn(
    'attendance_correction_requests',
    'issue_type',
    "ENUM('FORGOT_PUNCH_IN','FORGOT_PUNCH_OUT','FORGOT_BOTH','INCORRECT_TIME','ATTENDANCE_MISSING','OTHER') NOT NULL DEFAULT 'OTHER' AFTER correction_date"
  );
  await addColumn(
    'attendance_correction_requests',
    'original_punch_in',
    'DATETIME NULL AFTER issue_type'
  );
  await addColumn(
    'attendance_correction_requests',
    'original_punch_out',
    'DATETIME NULL AFTER original_punch_in'
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS holidays (
       id INT AUTO_INCREMENT PRIMARY KEY,
       holiday_name VARCHAR(180) NOT NULL,
       holiday_date DATE NOT NULL,
       holiday_type ENUM(
         'NATIONAL',
         'COMPANY',
         'OPTIONAL',
         'REGIONAL',
         'WEEKEND'
       ) NOT NULL DEFAULT 'COMPANY',
       description VARCHAR(500) NULL,
       department_id INT NULL,
       created_by INT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       UNIQUE KEY uq_holiday_date_department (holiday_date, department_id),
       INDEX idx_holiday_date (holiday_date),
       CONSTRAINT fk_holiday_department
         FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
       CONSTRAINT fk_holiday_creator
         FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
     )`
  );

  console.log(`Version 1.1.0 database schema is ready (${dbName}).`);
}
