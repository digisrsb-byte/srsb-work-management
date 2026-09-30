USE srsb_hrms;

CREATE TABLE IF NOT EXISTS salary_configurations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT 'Default',
  basic_percent DECIMAL(8,4) NOT NULL DEFAULT 40.0000,
  da_percent_of_basic DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
  hra_percent_of_basic DECIMAL(8,4) NOT NULL DEFAULT 50.0000,
  pf_wage_ceiling DECIMAL(14,2) NOT NULL DEFAULT 15000.00,
  employee_pf_percent DECIMAL(8,4) NOT NULL DEFAULT 12.0000,
  employer_pf_percent DECIMAL(8,4) NOT NULL DEFAULT 13.0000,
  enable_bonus TINYINT(1) NOT NULL DEFAULT 0,
  bonus_type ENUM('MONTHLY','QUARTERLY','ANNUAL') NOT NULL DEFAULT 'ANNUAL',
  bonus_percent_of_basic DECIMAL(8,4) NOT NULL DEFAULT 8.3300,
  enable_attendance_bonus TINYINT(1) NOT NULL DEFAULT 0,
  attendance_bonus_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  attendance_min_percent DECIMAL(8,4) NOT NULL DEFAULT 95.0000,
  enable_gratuity TINYINT(1) NOT NULL DEFAULT 0,
  gratuity_percent_of_basic DECIMAL(8,4) NOT NULL DEFAULT 4.8100,
  payroll_day_basis ENUM('CALENDAR_DAYS','WORKING_DAYS','FIXED_30_DAYS') NOT NULL DEFAULT 'FIXED_30_DAYS',
  enable_pt TINYINT(1) NOT NULL DEFAULT 1,
  pt_amount DECIMAL(14,2) NOT NULL DEFAULT 200.00,
  pt_threshold DECIMAL(14,2) NOT NULL DEFAULT 15000.00,
  company_address VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL DEFAULT (CURRENT_DATE),
  effective_to DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_salary_config_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS statutory_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NULL,
  rule_name VARCHAR(120) NOT NULL,
  rule_type VARCHAR(80) NOT NULL,
  percentage DECIMAL(8,4) NULL,
  threshold_amount DECIMAL(14,2) NULL,
  ceiling_amount DECIMAL(14,2) NULL,
  contribution_side ENUM('EMPLOYEE','EMPLOYER','NONE') NOT NULL DEFAULT 'NONE',
  calculation_basis VARCHAR(80) NULL,
  applicability VARCHAR(255) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stat_rule_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Ensure salary structures can store optional flags used by auto engine
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_salary_structures' AND COLUMN_NAME = 'enable_bonus'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE employee_salary_structures
     ADD COLUMN enable_bonus TINYINT(1) NOT NULL DEFAULT 0 AFTER notes,
     ADD COLUMN enable_attendance_bonus TINYINT(1) NOT NULL DEFAULT 0 AFTER enable_bonus,
     ADD COLUMN enable_gratuity TINYINT(1) NOT NULL DEFAULT 0 AFTER enable_attendance_bonus,
     ADD COLUMN calculation_snapshot JSON NULL AFTER enable_gratuity',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO salary_configurations (
  company_id, name, company_address, is_active, effective_from
)
SELECT c.id,
       'Default',
       'No.59(228/B), 55th Cross, 3rd Block, Rajajinagar, Bangalore, Karnataka, India (Landmark: Behind Ram Mandir Temple)',
       1,
       CURDATE()
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM salary_configurations sc WHERE sc.company_id = c.id AND sc.is_active = 1
);

INSERT INTO statutory_rules (
  company_id, rule_name, rule_type, percentage, threshold_amount, ceiling_amount,
  contribution_side, calculation_basis, applicability, is_enabled, effective_from
)
SELECT NULL, 'Professional Tax Karnataka Default', 'PT', NULL, 15000, NULL,
       'EMPLOYEE', 'GROSS', 'Karnataka payroll default', 1, '2020-01-01'
WHERE NOT EXISTS (
  SELECT 1 FROM statutory_rules WHERE rule_type = 'PT' AND company_id IS NULL
);
