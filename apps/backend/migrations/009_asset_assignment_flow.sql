USE srsb_hrms;

-- Extra inventory fields for individual physical assets
SET @col_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'asset_name'
);
SET @sql_name := IF(
  @col_name = 0,
  'ALTER TABLE assets ADD COLUMN asset_name VARCHAR(160) NULL AFTER asset_tag',
  'SELECT 1'
);
PREPARE stmt_name FROM @sql_name;
EXECUTE stmt_name;
DEALLOCATE PREPARE stmt_name;

SET @col_cost := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'purchase_cost'
);
SET @sql_cost := IF(
  @col_cost = 0,
  'ALTER TABLE assets ADD COLUMN purchase_cost DECIMAL(12,2) NULL AFTER purchase_date',
  'SELECT 1'
);
PREPARE stmt_cost FROM @sql_cost;
EXECUTE stmt_cost;
DEALLOCATE PREPARE stmt_cost;

SET @col_loc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'location'
);
SET @sql_loc := IF(
  @col_loc = 0,
  'ALTER TABLE assets ADD COLUMN location VARCHAR(160) NULL AFTER condition_label',
  'SELECT 1'
);
PREPARE stmt_loc FROM @sql_loc;
EXECUTE stmt_loc;
DEALLOCATE PREPARE stmt_loc;

-- Assignment extras
SET @col_exp := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_assignments' AND COLUMN_NAME = 'expected_return_date'
);
SET @sql_exp := IF(
  @col_exp = 0,
  'ALTER TABLE asset_assignments ADD COLUMN expected_return_date DATE NULL AFTER assigned_at',
  'SELECT 1'
);
PREPARE stmt_exp FROM @sql_exp;
EXECUTE stmt_exp;
DEALLOCATE PREPARE stmt_exp;

SET @col_remarks := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_assignments' AND COLUMN_NAME = 'remarks'
);
SET @sql_remarks := IF(
  @col_remarks = 0,
  'ALTER TABLE asset_assignments ADD COLUMN remarks VARCHAR(500) NULL AFTER expected_return_date',
  'SELECT 1'
);
PREPARE stmt_remarks FROM @sql_remarks;
EXECUTE stmt_remarks;
DEALLOCATE PREPARE stmt_remarks;

-- Prevent duplicate active assignments (lock table; portable across MySQL versions)
CREATE TABLE IF NOT EXISTS asset_active_assignments (
  asset_id INT NOT NULL PRIMARY KEY,
  assignment_id INT NOT NULL,
  employee_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_active_assignment_id (assignment_id),
  CONSTRAINT fk_active_lock_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_active_lock_assignment FOREIGN KEY (assignment_id) REFERENCES asset_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_active_lock_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Backfill locks from current ACTIVE assignments
INSERT IGNORE INTO asset_active_assignments (asset_id, assignment_id, employee_id)
SELECT aa.asset_id, aa.id, aa.employee_id
FROM asset_assignments aa
WHERE aa.status = 'ACTIVE';

-- Backfill display names from make/model where missing
UPDATE assets
SET asset_name = TRIM(CONCAT(COALESCE(make, ''), ' ', COALESCE(model, '')))
WHERE (asset_name IS NULL OR asset_name = '')
  AND (make IS NOT NULL OR model IS NOT NULL);
