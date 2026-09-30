USE srsb_hrms;

-- Bank details collected during onboarding.
-- employee_bank_details stays the single record payroll reads; it is only written when an
-- Admin verifies an onboarding submission. Existing rows keep every value and are marked LEGACY.
-- Account numbers from onboarding are stored encrypted (AES-256-GCM, see fieldEncryption.js)
-- with the last four digits for masked display and a keyed hash for match checks.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'account_type');
SET @sql := IF(@col = 0,
  "ALTER TABLE employee_bank_details ADD COLUMN account_type ENUM('SAVINGS','CURRENT') NULL AFTER account_number",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'account_number_last4');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_bank_details ADD COLUMN account_number_last4 CHAR(4) NULL AFTER account_type',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'account_number_enc');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_bank_details ADD COLUMN account_number_enc VARCHAR(255) NULL AFTER account_number_last4',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'account_number_hash');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_bank_details ADD COLUMN account_number_hash CHAR(64) NULL AFTER account_number_enc',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'source');
SET @sql := IF(@col = 0,
  "ALTER TABLE employee_bank_details ADD COLUMN source ENUM('LEGACY','ONBOARDING') NOT NULL DEFAULT 'LEGACY' AFTER esi_number",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'onboarding_bank_detail_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_bank_details ADD COLUMN onboarding_bank_detail_id INT NULL AFTER source',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'verified_by');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_bank_details ADD COLUMN verified_by INT NULL AFTER onboarding_bank_detail_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND COLUMN_NAME = 'verified_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_bank_details ADD COLUMN verified_at DATETIME NULL AFTER verified_by',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_bank_details' AND CONSTRAINT_NAME = 'fk_bank_verified_by');
SET @sql := IF(@fk = 0,
  'ALTER TABLE employee_bank_details ADD CONSTRAINT fk_bank_verified_by FOREIGN KEY (verified_by) REFERENCES employees(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The employee's in-progress submission: one per onboarding case.
CREATE TABLE IF NOT EXISTS onboarding_bank_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  employee_id INT NOT NULL,
  status ENUM('DRAFT','PENDING_VERIFICATION','VERIFIED','CORRECTION_REQUIRED') NOT NULL DEFAULT 'DRAFT',
  account_holder_name VARCHAR(160) NULL,
  bank_name VARCHAR(160) NULL,
  account_type ENUM('SAVINGS','CURRENT') NULL,
  account_number_enc VARCHAR(255) NULL,
  account_number_last4 CHAR(4) NULL,
  account_number_hash CHAR(64) NULL,
  ifsc_code VARCHAR(11) NULL,
  branch_name VARCHAR(160) NULL,
  proof_id INT NULL,
  revision INT NOT NULL DEFAULT 1,
  submitted_at DATETIME NULL,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_onboarding_bank_case (case_id),
  KEY idx_onboarding_bank_employee (employee_id),
  CONSTRAINT fk_onboarding_bank_case FOREIGN KEY (case_id) REFERENCES onboarding_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_onboarding_bank_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_onboarding_bank_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_onboarding_bank_updater FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
);

-- Every bank proof file the employee uploaded (cancelled cheque, passbook page or statement).
CREATE TABLE IF NOT EXISTS onboarding_bank_proofs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank_detail_id INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INT NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bank_proof_detail (bank_detail_id),
  CONSTRAINT fk_bank_proof_detail FOREIGN KEY (bank_detail_id) REFERENCES onboarding_bank_details(id) ON DELETE CASCADE,
  CONSTRAINT fk_bank_proof_uploader FOREIGN KEY (uploaded_by) REFERENCES employees(id) ON DELETE SET NULL
);

-- Review decisions. Only the last four digits are kept with each decision.
CREATE TABLE IF NOT EXISTS onboarding_bank_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank_detail_id INT NOT NULL,
  revision INT NOT NULL,
  proof_id INT NULL,
  reviewer_id INT NOT NULL,
  decision ENUM('VERIFIED','CORRECTION_REQUIRED') NOT NULL,
  comments VARCHAR(1000) NULL,
  account_number_last4 CHAR(4) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bank_review_detail (bank_detail_id),
  CONSTRAINT fk_bank_review_detail FOREIGN KEY (bank_detail_id) REFERENCES onboarding_bank_details(id) ON DELETE CASCADE,
  CONSTRAINT fk_bank_review_reviewer FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE RESTRICT
);
