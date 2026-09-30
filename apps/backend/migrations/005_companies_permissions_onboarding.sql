USE srsb_hrms;

-- Companies (employer / legal entities)
CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO companies (code, name, status)
SELECT 'SRSB', 'SRSB Workforce Solutions', 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM companies WHERE code = 'SRSB'
);

-- Employee company + onboarding status
SET @col_company := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'company_id'
);

SET @sql_company := IF(
  @col_company = 0,
  'ALTER TABLE employees ADD COLUMN company_id INT NULL AFTER department_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql_company;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_onboarding := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'onboarding_status'
);

SET @sql_onboarding := IF(
  @col_onboarding = 0,
  "ALTER TABLE employees ADD COLUMN onboarding_status ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED') NOT NULL DEFAULT 'NOT_STARTED' AFTER status",
  'SELECT 1'
);
PREPARE stmt2 FROM @sql_onboarding;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

UPDATE employees e
SET e.company_id = (
  SELECT c.id FROM companies c WHERE c.code = 'SRSB' LIMIT 1
)
WHERE e.company_id IS NULL;

-- FK for company_id (ignore if already present)
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND CONSTRAINT_NAME = 'fk_employee_company'
);

SET @sql_fk := IF(
  @fk_exists = 0,
  'ALTER TABLE employees ADD CONSTRAINT fk_employee_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql_fk;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- Admin company scopes
CREATE TABLE IF NOT EXISTS user_company_scopes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  company_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_company_scope (employee_id, company_id),
  CONSTRAINT fk_scope_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_scope_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

INSERT INTO user_company_scopes (employee_id, company_id)
SELECT e.id, c.id
FROM employees e
CROSS JOIN companies c
WHERE e.role = 'SUPER_ADMIN'
  AND c.code = 'SRSB'
  AND NOT EXISTS (
    SELECT 1
    FROM user_company_scopes ucs
    WHERE ucs.employee_id = e.id
      AND ucs.company_id = c.id
  );

INSERT INTO user_company_scopes (employee_id, company_id)
SELECT e.id, e.company_id
FROM employees e
WHERE e.role IN ('ADMIN', 'HR', 'MANAGER')
  AND e.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_company_scopes ucs
    WHERE ucs.employee_id = e.id
      AND ucs.company_id = e.company_id
  );

-- Role permission matrix
CREATE TABLE IF NOT EXISTS role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('SUPER_ADMIN','ADMIN','HR','MANAGER','EMPLOYEE','RECRUITER') NOT NULL,
  module VARCHAR(80) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_approve TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  can_export TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_role_module (role, module)
);

INSERT IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_approve, can_delete, can_export)
VALUES
  ('SUPER_ADMIN','employees',1,1,1,1,1,1),
  ('SUPER_ADMIN','onboarding',1,1,1,1,1,1),
  ('SUPER_ADMIN','companies',1,1,1,1,1,1),
  ('SUPER_ADMIN','permissions',1,1,1,1,1,1),
  ('SUPER_ADMIN','reports',1,1,1,1,1,1),
  ('SUPER_ADMIN','candidates',1,1,1,1,1,1),
  ('ADMIN','employees',1,1,1,1,0,1),
  ('ADMIN','onboarding',1,1,1,1,0,0),
  ('ADMIN','companies',1,0,0,0,0,0),
  ('ADMIN','reports',1,0,0,0,0,1),
  ('ADMIN','candidates',1,1,1,1,0,0),
  ('HR','employees',1,1,1,1,0,1),
  ('HR','onboarding',1,1,1,1,0,0),
  ('HR','candidates',1,1,1,1,0,0),
  ('HR','reports',1,0,0,0,0,1),
  ('MANAGER','employees',1,0,0,0,0,0),
  ('MANAGER','onboarding',1,0,0,1,0,0),
  ('MANAGER','candidates',1,1,1,0,0,0),
  ('MANAGER','reports',1,0,0,0,0,0),
  ('RECRUITER','candidates',1,1,1,0,0,0),
  ('RECRUITER','onboarding',1,0,0,0,0,0),
  ('EMPLOYEE','onboarding',1,1,1,0,0,0);

-- Onboarding cases
CREATE TABLE IF NOT EXISTS onboarding_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_id INT NULL,
  employee_id INT NOT NULL,
  company_id INT NOT NULL,
  status ENUM('PENDING','IN_PROGRESS','READY','ACTIVATED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  initiated_by INT NULL,
  activated_by INT NULL,
  activated_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_onboarding_employee (employee_id),
  CONSTRAINT fk_onboarding_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL,
  CONSTRAINT fk_onboarding_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_onboarding_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_onboarding_initiated_by FOREIGN KEY (initiated_by) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_onboarding_activated_by FOREIGN KEY (activated_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  document_type VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  requirement ENUM('REQUIRED','OPTIONAL','NOT_APPLICABLE') NOT NULL DEFAULT 'REQUIRED',
  status ENUM('PENDING','SUBMITTED','VERIFIED','REJECTED','CORRECTION_REQUIRED','NOT_APPLICABLE') NOT NULL DEFAULT 'PENDING',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_case_document_type (case_id, document_type),
  CONSTRAINT fk_checklist_case FOREIGN KEY (case_id) REFERENCES onboarding_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  checklist_item_id INT NOT NULL,
  employee_id INT NOT NULL,
  current_version INT NOT NULL DEFAULT 0,
  latest_status ENUM('SUBMITTED','VERIFIED','REJECTED','CORRECTION_REQUIRED') NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_submission_item (checklist_item_id),
  CONSTRAINT fk_submission_item FOREIGN KEY (checklist_item_id) REFERENCES onboarding_checklist_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  version_number INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INT NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_submission_version (submission_id, version_number),
  CONSTRAINT fk_version_submission FOREIGN KEY (submission_id) REFERENCES document_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_version_uploader FOREIGN KEY (uploaded_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  version_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  decision ENUM('VERIFIED','REJECTED','CORRECTION_REQUIRED') NOT NULL,
  comments VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_submission FOREIGN KEY (submission_id) REFERENCES document_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_version FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_reviewer FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE RESTRICT
);
