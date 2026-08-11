import { pool as defaultPool } from '../config/database.js';
import { env } from '../config/env.js';

function resolveOptions(options = {}) {
  return {
    pool: options.pool || defaultPool,
    dbName: options.dbName || env.dbName,
    // Only force the hard-coded SRSB invoice profile onto the legacy default DB.
    forceSrsbInvoiceProfile:
      options.forceSrsbInvoiceProfile ??
      (options.dbName
        ? options.dbName === env.dbName
        : true)
  };
}

export async function ensureV120Schema(options = {}) {
  const { pool, dbName, forceSrsbInvoiceProfile } =
    resolveOptions(options);

  async function columnExists(tableName, columnName) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [dbName, tableName, columnName]
    );
    return rows.length > 0;
  }

  async function getColumnDefinition(tableName, columnName) {
    const [rows] = await pool.query(
      `SELECT COLUMN_TYPE AS columnType, COLUMN_DEFAULT AS columnDefault
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [dbName, tableName, columnName]
    );
    return rows[0] || null;
  }

  async function addColumn(tableName, columnName, definition) {
    if (!(await columnExists(tableName, columnName))) {
      await pool.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
      );
    }
  }

  async function indexExists(tableName, indexName) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
       LIMIT 1`,
      [dbName, tableName, indexName]
    );
    return rows.length > 0;
  }

  async function addIndex(tableName, indexName, columnsSql) {
    if (!(await indexExists(tableName, indexName))) {
      await pool.query(
        `CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columnsSql})`
      );
    }
  }

  // Client billing metadata.
  await addColumn('clients', 'state_code', 'VARCHAR(8) NULL');

  // Candidate enrolment and birthday information.
  await addColumn('candidates', 'date_of_birth', 'DATE NULL');
  await addColumn('candidates', 'candidate_source', 'VARCHAR(80) NULL');
  await addColumn('candidates', 'source_details', 'VARCHAR(255) NULL');
  await addColumn('candidates', 'enrollment_date', 'DATE NULL');
  await pool.query(
    `UPDATE candidates
     SET enrollment_date = COALESCE(enrollment_date, DATE(created_at))
     WHERE enrollment_date IS NULL`
  );

  // Candidate sourcing history can contain multiple company requirements.
  await addColumn('candidate_applications', 'sourced_date', 'DATE NULL');
  await addColumn('candidate_applications', 'sourcing_notes', 'VARCHAR(1000) NULL');
  await pool.query(
    `UPDATE candidate_applications
     SET sourced_date = COALESCE(sourced_date, DATE(last_updated))
     WHERE sourced_date IS NULL`
  );

  // Placement/employment history used by recruitment invoices.
  await addColumn('candidate_employment_history', 'application_id', 'INT NULL');
  await addColumn('candidate_employment_history', 'opening_id', 'INT NULL');
  await addColumn('candidate_employment_history', 'location', 'VARCHAR(160) NULL');
  await addColumn('candidate_employment_history', 'gross_salary', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
  await addColumn('candidate_employment_history', 'offered_ctc', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
  await addColumn('candidate_employment_history', 'offer_date', 'DATE NULL');
  await addColumn('candidate_employment_history', 'placement_fee', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
  await addColumn('candidate_employment_history', 'replacement_period_days', 'INT NULL');
  await addColumn('candidate_employment_history', 'recruiter_id', 'INT NULL');
  await addIndex('candidate_employment_history', 'idx_candidate_history_application', '`application_id`');
  await addIndex('candidate_employment_history', 'idx_candidate_history_opening', '`opening_id`');
  await addIndex('candidate_employment_history', 'idx_candidate_history_recruiter', '`recruiter_id`');

  // Recruitment invoice header fields. Legacy due-date/file columns remain for compatibility,
  // but version 1.2.0 no longer exposes or uses them.
  await addColumn('invoices', 'sac_code', "VARCHAR(24) NOT NULL DEFAULT '998616'");
  await addColumn('invoices', 'place_of_supply', 'VARCHAR(160) NULL');
  await addColumn('invoices', 'cgst_rate', 'DECIMAL(6,3) NOT NULL DEFAULT 0');
  await addColumn('invoices', 'sgst_rate', 'DECIMAL(6,3) NOT NULL DEFAULT 0');
  await addColumn('invoices', 'igst_rate', 'DECIMAL(6,3) NOT NULL DEFAULT 0');
  await pool.query(
    `UPDATE invoices
     SET status = CASE
       WHEN paid_amount >= total_amount AND total_amount > 0 THEN 'PAID'
       WHEN paid_amount > 0 THEN 'PARTIALLY_PAID'
       ELSE 'PENDING'
     END
     WHERE status = 'OVERDUE'`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS invoice_items (
       id INT AUTO_INCREMENT PRIMARY KEY,
       invoice_id INT NOT NULL,
       candidate_id INT NULL,
       placement_history_id INT NULL,
       candidate_name_snapshot VARCHAR(180) NOT NULL,
       designation_snapshot VARCHAR(180) NULL,
       location_snapshot VARCHAR(160) NULL,
       joining_date DATE NULL,
       annual_ctc DECIMAL(14,2) NOT NULL DEFAULT 0,
       gross_salary DECIMAL(14,2) NOT NULL DEFAULT 0,
       fee_type ENUM('PERCENTAGE_CTC','PERCENTAGE_GROSS','FIXED','CUSTOM') NOT NULL DEFAULT 'FIXED',
       fee_rate DECIMAL(8,3) NOT NULL DEFAULT 0,
       taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       INDEX idx_invoice_items_invoice (invoice_id),
       INDEX idx_invoice_items_candidate (candidate_id),
       INDEX idx_invoice_items_placement (placement_history_id),
       CONSTRAINT fk_invoice_item_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
       CONSTRAINT fk_invoice_item_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL,
       CONSTRAINT fk_invoice_item_placement FOREIGN KEY (placement_history_id) REFERENCES candidate_employment_history(id) ON DELETE SET NULL
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS invoice_settings (
       id TINYINT PRIMARY KEY,
       legal_name VARCHAR(220) NOT NULL,
       gst_number VARCHAR(32) NULL,
       registered_address VARCHAR(1000) NULL,
       email VARCHAR(180) NULL,
       phone VARCHAR(120) NULL,
       default_sac_code VARCHAR(24) NOT NULL DEFAULT '998616',
       default_cgst_rate DECIMAL(6,3) NOT NULL DEFAULT 9,
       default_sgst_rate DECIMAL(6,3) NOT NULL DEFAULT 9,
       default_igst_rate DECIMAL(6,3) NOT NULL DEFAULT 18,
       bank_account_name VARCHAR(220) NULL,
       bank_account_number VARCHAR(80) NULL,
       bank_ifsc VARCHAR(40) NULL,
       bank_name VARCHAR(160) NULL,
       bank_branch VARCHAR(160) NULL,
       authorised_signatory VARCHAR(180) NULL,
       invoice_prefix VARCHAR(30) NOT NULL DEFAULT 'SRSB',
       updated_by INT NULL,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`
  );

  if (forceSrsbInvoiceProfile) {
    await pool.query(
      `INSERT IGNORE INTO invoice_settings (
         id, legal_name, gst_number, registered_address, email, phone,
         default_sac_code, default_cgst_rate, default_sgst_rate, default_igst_rate,
         bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch,
         authorised_signatory, invoice_prefix
       ) VALUES (
         1,
         'SRSB WORKFORCE SOLUTIONS PVT LTD',
         '29ABQCS9374K1Z6',
         'No. 228/B, 55th Cross, 3rd Block, Rajajinagar, Bangalore - 560010',
         'srsbhrsolutions25@gmail.com',
         '8317406575 / 8660666087',
         '998616',
         9,
         9,
         18,
         'SRSB WORKFORCE SOLUTIONS PVT LTD',
         '13340200111222',
         'FDRL0001334',
         'Federal Bank',
         'Rajajinagar',
         'Authorised Signatory',
         'SRSB'
       )`
    );

    // Keep the legacy default tenant aligned with the approved SRSB invoice format.
    await pool.query(
      `UPDATE invoice_settings SET
         legal_name = 'SRSB WORKFORCE SOLUTIONS PVT LTD',
         gst_number = '29ABQCS9374K1Z6',
         registered_address = 'No. 228/B, 55th Cross, 3rd Block, Rajajinagar, Bangalore - 560010',
         email = 'srsbhrsolutions25@gmail.com',
         phone = '8317406575 / 8660666087',
         default_sac_code = '998616',
         default_cgst_rate = 9,
         default_sgst_rate = 9,
         default_igst_rate = 18,
         bank_account_name = 'SRSB WORKFORCE SOLUTIONS PVT LTD',
         bank_account_number = '13340200111222',
         bank_ifsc = 'FDRL0001334',
         bank_name = 'Federal Bank',
         bank_branch = 'Rajajinagar',
         authorised_signatory = 'Authorised Signatory',
         invoice_prefix = 'SRSB'
       WHERE id = 1`
    );
  }

  // Holiday calendar greetings.
  await addColumn('holidays', 'show_greeting', 'BOOLEAN NOT NULL DEFAULT TRUE');
  await addColumn('holidays', 'greeting_message', 'VARCHAR(1000) NULL');
  await addColumn('holidays', 'greeting_start_date', 'DATE NULL');
  await addColumn('holidays', 'greeting_end_date', 'DATE NULL');
  await pool.query(
    `UPDATE holidays
     SET greeting_start_date = COALESCE(greeting_start_date, holiday_date),
         greeting_end_date = COALESCE(greeting_end_date, holiday_date)
     WHERE greeting_start_date IS NULL OR greeting_end_date IS NULL`
  );

  // Task editing, extension requests, history and attachments.
  const taskStatusDefinition = await getColumnDefinition('tasks', 'status');
  if (!taskStatusDefinition) {
    throw new Error(
      `The tasks.status column is missing in ${dbName}. Apply the base tenant schema first.`
    );
  }
  if (String(taskStatusDefinition.columnType).includes("'TODO'")) {
    await pool.query(
      `ALTER TABLE tasks
       MODIFY status ENUM('TODO','PENDING','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')
       NOT NULL DEFAULT 'PENDING'`
    );
    await pool.query(
      `UPDATE tasks SET status = 'PENDING' WHERE status = 'TODO'`
    );
    await pool.query(
      `ALTER TABLE tasks
       MODIFY status ENUM('PENDING','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')
       NOT NULL DEFAULT 'PENDING'`
    );
  }
  await addColumn('tasks', 'start_date', 'DATETIME NULL');
  await addColumn('tasks', 'original_due_date', 'DATETIME NULL');
  await addColumn('tasks', 'remarks', 'VARCHAR(1000) NULL');
  await pool.query(
    `UPDATE tasks SET original_due_date = due_date
     WHERE original_due_date IS NULL AND due_date IS NOT NULL`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS task_extension_requests (
       id INT AUTO_INCREMENT PRIMARY KEY,
       task_id INT NOT NULL,
       requested_by INT NOT NULL,
       current_due_date DATETIME NULL,
       requested_due_date DATETIME NOT NULL,
       reason VARCHAR(1000) NOT NULL,
       status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
       reviewed_by INT NULL,
       reviewer_comment VARCHAR(1000) NULL,
       reviewed_at DATETIME NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_task_extension_task (task_id, status),
       INDEX idx_task_extension_requester (requested_by),
       CONSTRAINT fk_task_extension_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
       CONSTRAINT fk_task_extension_requester FOREIGN KEY (requested_by) REFERENCES employees(id) ON DELETE CASCADE,
       CONSTRAINT fk_task_extension_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS task_change_history (
       id INT AUTO_INCREMENT PRIMARY KEY,
       task_id INT NOT NULL,
       changed_by INT NULL,
       change_type VARCHAR(80) NOT NULL,
       field_name VARCHAR(120) NULL,
       old_value TEXT NULL,
       new_value TEXT NULL,
       reason VARCHAR(1000) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_task_history_task (task_id, created_at),
       CONSTRAINT fk_task_history_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
       CONSTRAINT fk_task_history_employee FOREIGN KEY (changed_by) REFERENCES employees(id) ON DELETE SET NULL
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS task_attachments (
       id INT AUTO_INCREMENT PRIMARY KEY,
       task_id INT NOT NULL,
       file_name VARCHAR(255) NOT NULL,
       mime_type VARCHAR(120) NOT NULL,
       file_data LONGBLOB NOT NULL,
       uploaded_by INT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_task_attachment_task (task_id),
       CONSTRAINT fk_task_attachment_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
       CONSTRAINT fk_task_attachment_employee FOREIGN KEY (uploaded_by) REFERENCES employees(id) ON DELETE SET NULL
     )`
  );

  await addColumn(
    'employees',
    'notification_preferences',
    `JSON NULL COMMENT 'Persisted notification preference toggles'`
  );

  console.log(`Version 1.2.0 database schema is ready (${dbName}).`);
}
