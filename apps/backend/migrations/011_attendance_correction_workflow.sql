USE srsb_hrms;

-- Extend existing attendance_correction_requests (do not recreate)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance_correction_requests'
    AND COLUMN_NAME = 'current_status'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE attendance_correction_requests
     ADD COLUMN current_status VARCHAR(40) NULL AFTER correction_date,
     ADD COLUMN requested_status ENUM(''PRESENT'',''HALF_DAY'') NOT NULL DEFAULT ''PRESENT'' AFTER current_status,
     ADD COLUMN previous_punch_in DATETIME NULL AFTER requested_punch_out,
     ADD COLUMN previous_punch_out DATETIME NULL AFTER previous_punch_in,
     ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @enum := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance_correction_requests'
    AND COLUMN_NAME = 'status'
);
SET @sql := IF(@enum IS NOT NULL AND @enum NOT LIKE '%CANCELLED%',
  'ALTER TABLE attendance_correction_requests
     MODIFY COLUMN status ENUM(''PENDING'',''APPROVED'',''REJECTED'',''CANCELLED'') NOT NULL DEFAULT ''PENDING''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx1 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance_correction_requests'
    AND INDEX_NAME = 'idx_att_corr_employee_date'
);
SET @sql := IF(@idx1 = 0,
  'CREATE INDEX idx_att_corr_employee_date ON attendance_correction_requests (employee_id, correction_date)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance_correction_requests'
    AND INDEX_NAME = 'idx_att_corr_status'
);
SET @sql := IF(@idx2 = 0,
  'CREATE INDEX idx_att_corr_status ON attendance_correction_requests (status)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
