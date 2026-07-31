ALTER TABLE employees
  MODIFY employee_id VARCHAR(30) NULL,
  ADD COLUMN username VARCHAR(80) NULL UNIQUE AFTER employee_id,
  ADD COLUMN recovery_email VARCHAR(160) NULL AFTER email;
