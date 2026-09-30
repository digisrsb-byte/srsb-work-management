USE srsb_hrms;

-- Invitation-based account setup for new joiners.
-- Existing employees keep login_status = 'ACTIVE', so their sign-in is unchanged.
-- Joiners created from Recruitment start as 'PENDING_ACTIVATION' and can sign in only
-- after opening the emailed activation link and choosing their own password.
SET @col_login := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'login_status'
);
SET @sql_login := IF(
  @col_login = 0,
  "ALTER TABLE employees ADD COLUMN login_status ENUM('ACTIVE','PENDING_ACTIVATION') NOT NULL DEFAULT 'ACTIVE' AFTER status",
  'SELECT 1'
);
PREPARE stmt_login FROM @sql_login;
EXECUTE stmt_login;
DEALLOCATE PREPARE stmt_login;

SET @col_verified := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'email_verified_at'
);
SET @sql_verified := IF(
  @col_verified = 0,
  'ALTER TABLE employees ADD COLUMN email_verified_at DATETIME NULL AFTER login_status',
  'SELECT 1'
);
PREPARE stmt_verified FROM @sql_verified;
EXECUTE stmt_verified;
DEALLOCATE PREPARE stmt_verified;

-- Only a SHA-256 hash of each activation token is stored; the raw token exists only in the email.
CREATE TABLE IF NOT EXISTS employee_invitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  email VARCHAR(160) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  status ENUM('PENDING','ACCEPTED','REVOKED') NOT NULL DEFAULT 'PENDING',
  delivery_status ENUM('QUEUED','SENT','FAILED') NOT NULL DEFAULT 'QUEUED',
  delivery_error VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  accepted_at DATETIME NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_invitations_token (token_hash),
  KEY idx_employee_invitations_employee (employee_id, id),
  CONSTRAINT fk_employee_invitations_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_employee_invitations_creator FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
);
