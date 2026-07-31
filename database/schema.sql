DROP DATABASE IF EXISTS srsb_hrms;
CREATE DATABASE srsb_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE srsb_hrms;

CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(30) NULL UNIQUE,
    username VARCHAR(80) NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) UNIQUE,
    recovery_email VARCHAR(160) NULL,
    phone VARCHAR(25),
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('SUPER_ADMIN','ADMIN','HR','MANAGER','EMPLOYEE','RECRUITER') NOT NULL DEFAULT 'EMPLOYEE',
    designation VARCHAR(120),
    department_id INT NULL,
    manager_id INT NULL,
    joining_date DATE,
    status ENUM('ACTIVE','INACTIVE','RESIGNED') NOT NULL DEFAULT 'ACTIVE',
    shift_start TIME DEFAULT '09:30:00',
    shift_end TIME DEFAULT '18:30:00',
    weekly_off_day ENUM('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') DEFAULT 'SUNDAY',
    must_change_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_employee_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_employee_manager FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    punch_in DATETIME,
    punch_out DATETIME,
    total_work_minutes INT DEFAULT 0,
    status ENUM('PRESENT','HALF_DAY','ABSENT','LEAVE','WEEK_OFF','HOLIDAY','MISSING_PUNCH') DEFAULT 'ABSENT',
    remarks VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_attendance_employee_date (employee_id, attendance_date),
    CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    leave_type ENUM('CASUAL','SICK','EARNED','UNPAID','OTHER') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_type ENUM('FULL_DAY','FIRST_HALF','SECOND_HALF') DEFAULT 'FULL_DAY',
    reason VARCHAR(500) NOT NULL,
    status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') DEFAULT 'PENDING',
    reviewed_by INT,
    reviewer_comment VARCHAR(500),
    reviewed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE attendance_correction_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    attendance_id INT,
    correction_date DATE NOT NULL,
    requested_punch_in DATETIME,
    requested_punch_out DATETIME,
    reason VARCHAR(500) NOT NULL,
    status ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    reviewed_by INT,
    reviewer_comment VARCHAR(500),
    reviewed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_correction_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_correction_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL,
    CONSTRAINT fk_correction_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(180) NOT NULL,
    industry VARCHAR(120),
    website VARCHAR(255),
    contact_name VARCHAR(120),
    contact_email VARCHAR(160),
    contact_phone VARCHAR(25),
    onboarded_by INT,
    status ENUM('PROSPECT','ACTIVE','INACTIVE','CLOSED') DEFAULT 'PROSPECT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_onboarded_by FOREIGN KEY (onboarded_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE job_openings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    title VARCHAR(180) NOT NULL,
    location VARCHAR(120),
    openings_count INT DEFAULT 1,
    experience_min DECIMAL(4,1),
    experience_max DECIMAL(4,1),
    assigned_recruiter_id INT,
    priority ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
    status ENUM('OPEN','SOURCING','SCREENING','INTERVIEW','OFFERED','JOINED','CLOSED','ON_HOLD') DEFAULT 'OPEN',
    opened_date DATE,
    target_close_date DATE,
    closed_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_opening_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_opening_recruiter FOREIGN KEY (assigned_recruiter_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160),
    phone VARCHAR(25),
    current_location VARCHAR(120),
    preferred_location VARCHAR(120),
    total_experience DECIMAL(4,1),
    current_ctc DECIMAL(12,2),
    expected_ctc DECIMAL(12,2),
    notice_period_days INT,
    skills TEXT,
    resume_path VARCHAR(255),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_candidate_creator FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE candidate_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id INT NOT NULL,
    opening_id INT NOT NULL,
    stage ENUM('SOURCED','SCREENING','SHORTLISTED','INTERVIEW','OFFERED','JOINED','REJECTED','WITHDRAWN') DEFAULT 'SOURCED',
    assigned_recruiter_id INT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_candidate_opening (candidate_id, opening_id),
    CONSTRAINT fk_application_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    CONSTRAINT fk_application_opening FOREIGN KEY (opening_id) REFERENCES job_openings(id) ON DELETE CASCADE,
    CONSTRAINT fk_application_recruiter FOREIGN KEY (assigned_recruiter_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    description TEXT,
    assigned_to INT NOT NULL,
    assigned_by INT,
    due_date DATETIME,
    priority ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
    status ENUM('TODO','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') DEFAULT 'TODO',
    progress TINYINT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_assigned_to FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_assigned_by FOREIGN KEY (assigned_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE monthly_targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    target_month DATE NOT NULL,
    employee_id INT,
    revenue_target DECIMAL(14,2) DEFAULT 0,
    clients_target INT DEFAULT 0,
    closures_target INT DEFAULT 0,
    joinings_target INT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_target_month_employee (target_month, employee_id),
    CONSTRAINT fk_target_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_target_created_by FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(60) NOT NULL UNIQUE,
    client_id INT NOT NULL,
    opening_id INT,
    candidate_id INT,
    closed_by INT,
    billing_model ENUM('FIXED','PERCENTAGE_CTC') DEFAULT 'FIXED',
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    invoice_date DATE NOT NULL,
    due_date DATE,
    status ENUM('DRAFT','PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_opening FOREIGN KEY (opening_id) REFERENCES job_openings(id) ON DELETE SET NULL,
    CONSTRAINT fk_invoice_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL,
    CONSTRAINT fk_invoice_closed_by FOREIGN KEY (closed_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE invoice_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(80),
    reference_number VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_date DATE NOT NULL,
    category ENUM('SALARY','RENT','ADVERTISING','JOB_PORTAL','SOFTWARE','TRAVEL','UTILITIES','INCENTIVE','OTHER') NOT NULL,
    description VARCHAR(255),
    amount DECIMAL(14,2) NOT NULL,
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expense_recorded_by FOREIGN KEY (recorded_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    type VARCHAR(80) DEFAULT 'GENERAL',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id),
    CONSTRAINT fk_audit_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

INSERT INTO departments (name, description) VALUES
('Management', 'Company administration'),
('Human Resources', 'HR operations'),
('Recruitment', 'Recruitment and client delivery'),
('Marketing', 'Digital marketing and lead generation'),
('Finance', 'Finance and accounts');

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL UNIQUE,
  status ENUM('PENDING','RESOLVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolved_by INT NULL,
  CONSTRAINT fk_password_reset_request_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_password_reset_request_admin
    FOREIGN KEY (resolved_by) REFERENCES employees(id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS password_reset_otps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_employee (employee_id),
  INDEX idx_password_reset_expiry (expires_at),
  CONSTRAINT fk_password_reset_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
