ALTER TABLE job_openings
  ADD COLUMN closed_by INT NULL AFTER closed_date,
  ADD INDEX idx_job_openings_closed_by (closed_by),
  ADD CONSTRAINT fk_job_openings_closed_by
    FOREIGN KEY (closed_by)
    REFERENCES employees(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;