ALTER TABLE employees
  ADD COLUMN password_changed_at TIMESTAMP NULL
  AFTER password_hash;