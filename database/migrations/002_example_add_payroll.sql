-- Example only. Do not run until payroll is required.
USE srsb_hrms;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_month DATE NOT NULL UNIQUE,
    status ENUM('DRAFT','PROCESSED','PAID') DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
