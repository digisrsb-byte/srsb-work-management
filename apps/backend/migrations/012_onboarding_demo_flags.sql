USE srsb_hrms;

-- DEMO flags: demo records can only be created when DEMO_MODE is enabled
-- and are hidden everywhere when it is disabled. Existing rows stay 0.
SET @col_emp_demo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'is_demo'
);
SET @sql_emp_demo := IF(
  @col_emp_demo = 0,
  'ALTER TABLE employees ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_emp_demo FROM @sql_emp_demo;
EXECUTE stmt_emp_demo;
DEALLOCATE PREPARE stmt_emp_demo;

SET @col_cand_demo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'candidates' AND COLUMN_NAME = 'is_demo'
);
SET @sql_cand_demo := IF(
  @col_cand_demo = 0,
  'ALTER TABLE candidates ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_cand_demo FROM @sql_cand_demo;
EXECUTE stmt_cand_demo;
DEALLOCATE PREPARE stmt_cand_demo;

SET @col_case_demo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'onboarding_cases' AND COLUMN_NAME = 'is_demo'
);
SET @sql_case_demo := IF(
  @col_case_demo = 0,
  'ALTER TABLE onboarding_cases ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_case_demo FROM @sql_case_demo;
EXECUTE stmt_case_demo;
DEALLOCATE PREPARE stmt_case_demo;
