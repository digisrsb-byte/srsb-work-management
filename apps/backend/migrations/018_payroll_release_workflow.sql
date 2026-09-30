USE srsb_hrms;

-- Payroll release workflow: attendance month finalization, per-employee PF applicability
-- and payslip email delivery tracking. Additive only; no existing data is changed.

-- PF applies to every salary structure unless HR turns it off for that employee.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_salary_structures' AND COLUMN_NAME = 'pf_applicable');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_salary_structures ADD COLUMN pf_applicable TINYINT(1) NOT NULL DEFAULT 1 AFTER enable_gratuity',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- One row per company and month once HR finalizes attendance for payroll.
-- While FINALIZED, attendance for that month cannot be overridden or corrected.
CREATE TABLE IF NOT EXISTS attendance_period_locks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  period_year SMALLINT NOT NULL,
  period_month TINYINT NOT NULL,
  status ENUM('FINALIZED','REOPENED') NOT NULL DEFAULT 'FINALIZED',
  summary JSON NULL,
  finalized_by INT NULL,
  finalized_at DATETIME NULL,
  reopened_by INT NULL,
  reopened_at DATETIME NULL,
  reopen_reason VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_period (company_id, period_year, period_month),
  CONSTRAINT fk_attendance_lock_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_lock_finalized_by FOREIGN KEY (finalized_by) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_attendance_lock_reopened_by FOREIGN KEY (reopened_by) REFERENCES employees(id) ON DELETE SET NULL
);

-- One delivery record per released payslip.
CREATE TABLE IF NOT EXISTS payslip_email_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payslip_id INT NOT NULL,
  run_id INT NOT NULL,
  employee_id INT NOT NULL,
  email VARCHAR(160) NULL,
  status ENUM('PENDING','SENDING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  last_attempt_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payslip_email (payslip_id),
  KEY idx_payslip_email_run (run_id, status),
  CONSTRAINT fk_payslip_email_payslip FOREIGN KEY (payslip_id) REFERENCES payslip_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_payslip_email_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payslip_email_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
