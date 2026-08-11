/**
 * Creates the full HRMS base schema for a brand-new tenant database.
 * Uses CREATE IF NOT EXISTS only — safe on existing production DBs.
 * Does NOT drop or recreate databases.
 */
export async function ensureTenantBaseSchema({
  pool,
  dbName
} = {}) {
  if (!pool || !dbName) {
    throw new Error(
      'ensureTenantBaseSchema requires { pool, dbName }'
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(30) NULL UNIQUE,
      username VARCHAR(80) NULL UNIQUE,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(160) UNIQUE,
      recovery_email VARCHAR(160) NULL,
      phone VARCHAR(25),
      date_of_birth DATE NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('SUPER_ADMIN','ADMIN','HR','MANAGER','EMPLOYEE','RECRUITER') NOT NULL DEFAULT 'EMPLOYEE',
      account_type ENUM('EMPLOYEE','SYSTEM') NOT NULL DEFAULT 'EMPLOYEE',
      designation VARCHAR(120),
      department_id INT NULL,
      manager_id INT NULL,
      joining_date DATE,
      status ENUM('ACTIVE','INACTIVE','RESIGNED') NOT NULL DEFAULT 'ACTIVE',
      shift_start TIME DEFAULT '09:30:00',
      shift_end TIME DEFAULT '18:30:00',
      weekly_off_day ENUM('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') DEFAULT 'SUNDAY',
      must_change_password BOOLEAN DEFAULT TRUE,
      password_changed_at DATETIME NULL,
      notification_preferences JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_employee_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      CONSTRAINT fk_employee_manager FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      attendance_date DATE NOT NULL,
      punch_in DATETIME,
      punch_out DATETIME,
      total_work_minutes INT DEFAULT 0,
      status ENUM('PRESENT','HALF_DAY','ABSENT','LEAVE','WEEK_OFF','HOLIDAY','MISSING_PUNCH') DEFAULT 'ABSENT',
      remarks VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_attendance_employee_date (employee_id, attendance_date),
      CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      leave_type ENUM('CASUAL','SICK','EARNED','UNPAID','OTHER') NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      duration_type ENUM('FULL_DAY','FIRST_HALF','SECOND_HALF') DEFAULT 'FULL_DAY',
      reason VARCHAR(500) NOT NULL,
      status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') DEFAULT 'PENDING',
      reviewed_by INT,
      reviewer_comment VARCHAR(500),
      reviewed_at DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_leave_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_correction_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      attendance_id INT,
      correction_date DATE NOT NULL,
      issue_type ENUM('FORGOT_PUNCH_IN','FORGOT_PUNCH_OUT','FORGOT_BOTH','INCORRECT_TIME','ATTENDANCE_MISSING','OTHER') NOT NULL DEFAULT 'OTHER',
      original_punch_in DATETIME,
      original_punch_out DATETIME,
      requested_punch_in DATETIME,
      requested_punch_out DATETIME,
      reason VARCHAR(500) NOT NULL,
      status ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
      reviewed_by INT,
      reviewer_comment VARCHAR(500),
      reviewed_at DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_correction_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_correction_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL,
      CONSTRAINT fk_correction_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_name VARCHAR(180) NOT NULL,
      gst_number VARCHAR(32),
      address_line TEXT,
      city VARCHAR(120),
      state VARCHAR(120),
      state_code VARCHAR(8) NULL,
      postal_code VARCHAR(16),
      industry VARCHAR(120),
      website VARCHAR(255),
      company_email VARCHAR(160),
      company_phone VARCHAR(25),
      contact_person_name VARCHAR(120),
      contact_person_email VARCHAR(160),
      contact_person_phone VARCHAR(25),
      contact_name VARCHAR(120),
      contact_email VARCHAR(160),
      contact_phone VARCHAR(25),
      onboarded_by INT,
      status ENUM('PROSPECT','ACTIVE','INACTIVE','CLOSED') DEFAULT 'PROSPECT',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_client_onboarded_by FOREIGN KEY (onboarded_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_openings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      title VARCHAR(180) NOT NULL,
      location VARCHAR(120),
      openings_count INT DEFAULT 1,
      experience_min DECIMAL(4,1),
      experience_max DECIMAL(4,1),
      assigned_recruiter_id INT,
      priority ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
      status ENUM('OPEN','SOURCING','SCREENING','INTERVIEW','OFFERED','JOINED','CLOSED','ON_HOLD') DEFAULT 'OPEN',
      opened_date DATE,
      target_close_date DATE,
      closed_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_opening_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_opening_recruiter FOREIGN KEY (assigned_recruiter_id) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(160),
      phone VARCHAR(25),
      current_location VARCHAR(120),
      preferred_location VARCHAR(120),
      total_experience DECIMAL(4,1),
      current_ctc DECIMAL(12,2),
      expected_ctc DECIMAL(12,2),
      notice_period_days INT,
      skills TEXT,
      resume_path VARCHAR(255),
      date_of_birth DATE NULL,
      candidate_source VARCHAR(80) NULL,
      source_details VARCHAR(255) NULL,
      enrollment_date DATE NULL,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_candidate_creator FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidate_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      candidate_id INT NOT NULL,
      opening_id INT NOT NULL,
      stage ENUM('SOURCED','SCREENING','SHORTLISTED','INTERVIEW','OFFERED','JOINED','REJECTED','WITHDRAWN') DEFAULT 'SOURCED',
      assigned_recruiter_id INT,
      sourced_date DATE NULL,
      sourcing_notes VARCHAR(1000) NULL,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_candidate_opening (candidate_id, opening_id),
      CONSTRAINT fk_application_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
      CONSTRAINT fk_application_opening FOREIGN KEY (opening_id) REFERENCES job_openings(id) ON DELETE CASCADE,
      CONSTRAINT fk_application_recruiter FOREIGN KEY (assigned_recruiter_id) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidate_employment_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      candidate_id INT NOT NULL,
      client_id INT NULL,
      company_name_snapshot VARCHAR(180) NOT NULL,
      position VARCHAR(180) NOT NULL,
      ctc DECIMAL(14,2) NOT NULL DEFAULT 0,
      joining_date DATE NULL,
      leaving_date DATE NULL,
      employment_status ENUM('OFFERED','JOINED','ACTIVE','LEFT','NO_SHOW','TERMINATED') NOT NULL DEFAULT 'JOINED',
      reason_for_leaving VARCHAR(500),
      notes VARCHAR(1000),
      recorded_by INT NULL,
      application_id INT NULL,
      opening_id INT NULL,
      location VARCHAR(160) NULL,
      gross_salary DECIMAL(14,2) NOT NULL DEFAULT 0,
      offered_ctc DECIMAL(14,2) NOT NULL DEFAULT 0,
      offer_date DATE NULL,
      placement_fee DECIMAL(14,2) NOT NULL DEFAULT 0,
      replacement_period_days INT NULL,
      recruiter_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_candidate_history_candidate (candidate_id),
      INDEX idx_candidate_history_client (client_id),
      INDEX idx_candidate_history_application (application_id),
      INDEX idx_candidate_history_opening (opening_id),
      INDEX idx_candidate_history_recruiter (recruiter_id),
      CONSTRAINT fk_candidate_history_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
      CONSTRAINT fk_candidate_history_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      CONSTRAINT fk_candidate_history_recorder FOREIGN KEY (recorded_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      description TEXT,
      assigned_to INT NOT NULL,
      assigned_by INT,
      due_date DATETIME,
      start_date DATETIME NULL,
      original_due_date DATETIME NULL,
      remarks VARCHAR(1000) NULL,
      priority ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
      status ENUM('PENDING','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
      progress TINYINT UNSIGNED DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_task_assigned_to FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_task_assigned_by FOREIGN KEY (assigned_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_targets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      target_month DATE NOT NULL,
      employee_id INT,
      revenue_target DECIMAL(14,2) DEFAULT 0,
      clients_target INT DEFAULT 0,
      closures_target INT DEFAULT 0,
      joinings_target INT DEFAULT 0,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_target_month_employee (target_month, employee_id),
      CONSTRAINT fk_target_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_target_created_by FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(60) NOT NULL UNIQUE,
      client_id INT NOT NULL,
      opening_id INT,
      candidate_id INT,
      closed_by INT,
      billing_model ENUM('FIXED','PERCENTAGE_CTC') DEFAULT 'FIXED',
      service_charges DECIMAL(14,2) NOT NULL DEFAULT 0,
      gst_type ENUM('NONE','IGST','CGST_SGST') NOT NULL DEFAULT 'NONE',
      igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
      gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      payment_released BOOLEAN NOT NULL DEFAULT FALSE,
      payment_date DATE,
      invoice_date DATE NOT NULL,
      due_date DATE,
      status ENUM('DRAFT','PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') DEFAULT 'PENDING',
      sac_code VARCHAR(24) NOT NULL DEFAULT '998616',
      place_of_supply VARCHAR(160) NULL,
      cgst_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
      sgst_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
      igst_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
      gst_file_name VARCHAR(255),
      gst_file_mime VARCHAR(120),
      gst_file_data LONGBLOB,
      notes VARCHAR(1000),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_invoice_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
      CONSTRAINT fk_invoice_opening FOREIGN KEY (opening_id) REFERENCES job_openings(id) ON DELETE SET NULL,
      CONSTRAINT fk_invoice_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL,
      CONSTRAINT fk_invoice_closed_by FOREIGN KEY (closed_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      payment_date DATE NOT NULL,
      payment_method VARCHAR(80),
      reference_number VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      expense_date DATE NOT NULL,
      category ENUM('SALARY','RENT','ADVERTISING','JOB_PORTAL','SOFTWARE','TRAVEL','UTILITIES','INCENTIVE','OTHER') NOT NULL,
      description VARCHAR(255),
      amount DECIMAL(14,2) NOT NULL,
      recorded_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_expense_recorded_by FOREIGN KEY (recorded_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      holiday_name VARCHAR(180) NOT NULL,
      holiday_date DATE NOT NULL,
      holiday_type ENUM('NATIONAL','COMPANY','OPTIONAL','REGIONAL','WEEKEND') NOT NULL DEFAULT 'COMPANY',
      description VARCHAR(500),
      department_id INT NULL,
      created_by INT NULL,
      show_greeting BOOLEAN NOT NULL DEFAULT TRUE,
      greeting_message VARCHAR(1000) NULL,
      greeting_start_date DATE NULL,
      greeting_end_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_holiday_date_department (holiday_date, department_id),
      INDEX idx_holiday_date (holiday_date),
      CONSTRAINT fk_holiday_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      CONSTRAINT fk_holiday_creator FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_id INT NOT NULL,
      actor_id INT NULL,
      type VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
      title VARCHAR(180) NOT NULL,
      message VARCHAR(1000) NOT NULL,
      reference_type VARCHAR(100),
      reference_id VARCHAR(100),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_recipient_read (recipient_id, is_read, created_at),
      CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_actor FOREIGN KEY (actor_id) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT,
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(100),
      entity_id VARCHAR(100),
      old_values JSON,
      new_values JSON,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_entity (entity_type, entity_id),
      CONSTRAINT fk_audit_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL UNIQUE,
      status ENUM('PENDING','RESOLVED','REJECTED') NOT NULL DEFAULT 'PENDING',
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      resolved_by INT NULL,
      CONSTRAINT fk_password_reset_request_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_password_reset_request_admin
        FOREIGN KEY (resolved_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);

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
      CONSTRAINT fk_password_reset_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_settings (
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
      invoice_prefix VARCHAR(30) NOT NULL DEFAULT 'INV',
      updated_by INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_extension_requests (
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_change_history (
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_attachments (
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
    )
  `);

  // Per-company branding / legal profile (multi-company SaaS).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id TINYINT PRIMARY KEY DEFAULT 1,
      legal_name VARCHAR(220) NOT NULL,
      display_name VARCHAR(220) NOT NULL,
      address VARCHAR(1000) NULL,
      phone VARCHAR(120) NULL,
      email VARCHAR(180) NULL,
      gst_number VARCHAR(32) NULL,
      state_code VARCHAR(8) NULL,
      bank_account_name VARCHAR(220) NULL,
      bank_account_number VARCHAR(80) NULL,
      bank_ifsc VARCHAR(40) NULL,
      bank_name VARCHAR(160) NULL,
      bank_branch VARCHAR(160) NULL,
      logo_mime VARCHAR(120) NULL,
      logo_data LONGBLOB NULL,
      signature_mime VARCHAR(120) NULL,
      signature_data LONGBLOB NULL,
      sac_code VARCHAR(24) NOT NULL DEFAULT '998616',
      authorised_signatory VARCHAR(180) NULL,
      invoice_prefix VARCHAR(30) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(
    `INSERT IGNORE INTO departments (name, description)
     VALUES
       ('Technical', 'Technical and software team'),
       ('HR', 'Human resources and recruitment team')`
  );

  console.log(`Tenant base schema ready (${dbName}).`);
}
