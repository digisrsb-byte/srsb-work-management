USE srsb_hrms;

-- Repair lifecycle details: when the issue was reported and how it ended
SET @col_issue := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_service_records' AND COLUMN_NAME = 'issue_date'
);
SET @sql_issue := IF(
  @col_issue = 0,
  'ALTER TABLE asset_service_records ADD COLUMN issue_date DATE NULL AFTER description',
  'SELECT 1'
);
PREPARE stmt_issue FROM @sql_issue;
EXECUTE stmt_issue;
DEALLOCATE PREPARE stmt_issue;

SET @col_outcome := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_service_records' AND COLUMN_NAME = 'outcome'
);
SET @sql_outcome := IF(
  @col_outcome = 0,
  'ALTER TABLE asset_service_records ADD COLUMN outcome VARCHAR(40) NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt_outcome FROM @sql_outcome;
EXECUTE stmt_outcome;
DEALLOCATE PREPARE stmt_outcome;

SET @col_resolution := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_service_records' AND COLUMN_NAME = 'resolution_notes'
);
SET @sql_resolution := IF(
  @col_resolution = 0,
  'ALTER TABLE asset_service_records ADD COLUMN resolution_notes VARCHAR(1000) NULL AFTER outcome',
  'SELECT 1'
);
PREPARE stmt_resolution FROM @sql_resolution;
EXECUTE stmt_resolution;
DEALLOCATE PREPARE stmt_resolution;

UPDATE asset_service_records
SET issue_date = DATE(created_at)
WHERE issue_date IS NULL;
