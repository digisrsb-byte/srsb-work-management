USE srsb_hrms;

-- Optional ESI configuration on salary_configurations (additive; does not alter PF rules)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'salary_configurations'
    AND COLUMN_NAME = 'enable_esi'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE salary_configurations
     ADD COLUMN enable_esi TINYINT(1) NOT NULL DEFAULT 0 AFTER pt_threshold,
     ADD COLUMN employee_esi_percent DECIMAL(8,4) NOT NULL DEFAULT 0.7500 AFTER enable_esi,
     ADD COLUMN employer_esi_percent DECIMAL(8,4) NOT NULL DEFAULT 3.2500 AFTER employee_esi_percent,
     ADD COLUMN esi_wage_ceiling DECIMAL(14,2) NOT NULL DEFAULT 21000.00 AFTER employer_esi_percent',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
