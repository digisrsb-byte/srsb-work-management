USE srsb_hrms;

-- Company profile fields
SET @col_address := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'address'
);
SET @sql_address := IF(
  @col_address = 0,
  'ALTER TABLE companies ADD COLUMN address VARCHAR(500) NULL AFTER name',
  'SELECT 1'
);
PREPARE stmt_address FROM @sql_address;
EXECUTE stmt_address;
DEALLOCATE PREPARE stmt_address;

SET @col_email := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'official_email'
);
SET @sql_email := IF(
  @col_email = 0,
  'ALTER TABLE companies ADD COLUMN official_email VARCHAR(160) NULL AFTER address',
  'SELECT 1'
);
PREPARE stmt_email FROM @sql_email;
EXECUTE stmt_email;
DEALLOCATE PREPARE stmt_email;

SET @col_phone := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'contact_phone'
);
SET @sql_phone := IF(
  @col_phone = 0,
  'ALTER TABLE companies ADD COLUMN contact_phone VARCHAR(40) NULL AFTER official_email',
  'SELECT 1'
);
PREPARE stmt_phone FROM @sql_phone;
EXECUTE stmt_phone;
DEALLOCATE PREPARE stmt_phone;

SET @col_website := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'website'
);
SET @sql_website := IF(
  @col_website = 0,
  'ALTER TABLE companies ADD COLUMN website VARCHAR(255) NULL AFTER contact_phone',
  'SELECT 1'
);
PREPARE stmt_website FROM @sql_website;
EXECUTE stmt_website;
DEALLOCATE PREPARE stmt_website;

-- Company-level office shifts
CREATE TABLE IF NOT EXISTS company_office_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:30:00',
  end_time TIME NOT NULL DEFAULT '18:30:00',
  break_minutes INT NOT NULL DEFAULT 60,
  working_days VARCHAR(80) NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI',
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shift_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Ensure holidays table exists (legacy DBs may already have it)
CREATE TABLE IF NOT EXISTS holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  holiday_name VARCHAR(160) NOT NULL,
  holiday_date DATE NOT NULL,
  holiday_type ENUM('PUBLIC','OPTIONAL','COMPANY') NOT NULL DEFAULT 'COMPANY',
  description VARCHAR(500) NULL,
  department_id INT NULL,
  company_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  show_greeting TINYINT(1) NOT NULL DEFAULT 0,
  greeting_message VARCHAR(500) NULL,
  greeting_start_date DATE NULL,
  greeting_end_date DATE NULL
);

SET @col_h_company := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'holidays' AND COLUMN_NAME = 'company_id'
);
SET @sql_h_company := IF(
  @col_h_company = 0,
  'ALTER TABLE holidays ADD COLUMN company_id INT NULL AFTER department_id',
  'SELECT 1'
);
PREPARE stmt_h_company FROM @sql_h_company;
EXECUTE stmt_h_company;
DEALLOCATE PREPARE stmt_h_company;

-- Permission gaps for assets/access/company config
INSERT IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_approve, can_delete, can_export)
VALUES
  ('HR','access_requests',1,1,0,0,0,0),
  ('HR','companies',1,0,0,0,0,0),
  ('MANAGER','access_requests',1,1,0,0,0,0),
  ('MANAGER','companies',1,0,0,0,0,0),
  ('EMPLOYEE','access_requests',1,1,0,0,0,0),
  ('ADMIN','companies',1,0,1,0,0,0),
  ('ADMIN','access_requests',1,1,0,0,0,0);

UPDATE role_permissions
SET can_edit = 1
WHERE role = 'ADMIN' AND module = 'companies';

UPDATE role_permissions
SET can_view = 1, can_create = 1
WHERE role IN ('HR','MANAGER','EMPLOYEE','ADMIN') AND module = 'access_requests';

UPDATE role_permissions
SET can_view = 1
WHERE role IN ('HR','MANAGER') AND module = 'companies';

-- Backfill missing company scopes from employee.company_id
INSERT INTO user_company_scopes (employee_id, company_id)
SELECT e.id, e.company_id
FROM employees e
WHERE e.company_id IS NOT NULL
  AND e.role IN ('ADMIN','HR','MANAGER')
  AND NOT EXISTS (
    SELECT 1 FROM user_company_scopes ucs
    WHERE ucs.employee_id = e.id AND ucs.company_id = e.company_id
  );
