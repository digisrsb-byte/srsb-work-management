USE srsb_hrms;

-- Upgrade legacy notifications (employee_id) to recipient_id model
SET @has_recipient := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'recipient_id'
);

SET @has_employee := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'employee_id'
);

-- If legacy table only, rebuild into new structure
SET @sql := IF(
  @has_recipient = 0 AND @has_employee = 1,
  'RENAME TABLE notifications TO notifications_legacy_backup',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_id INT NOT NULL,
  actor_id INT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500) NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id INT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_notifications_recipient (recipient_id, is_read, created_at),
  INDEX idx_notifications_reference (reference_type, reference_id),
  CONSTRAINT fk_notifications_recipient
    FOREIGN KEY (recipient_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor
    FOREIGN KEY (actor_id) REFERENCES employees(id) ON DELETE SET NULL
);

SET @backup_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notifications_legacy_backup'
);

SET @sql_copy := IF(
  @backup_exists = 1 AND @has_recipient = 0,
  "INSERT INTO notifications (recipient_id, type, title, message, is_read, created_at)
   SELECT employee_id, IFNULL(type,'GENERAL'), title, message, IFNULL(is_read,0), created_at
   FROM notifications_legacy_backup",
  'SELECT 1'
);
PREPARE stmt2 FROM @sql_copy;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
