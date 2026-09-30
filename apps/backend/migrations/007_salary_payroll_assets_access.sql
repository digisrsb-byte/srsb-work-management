USE srsb_hrms;

-- ========== SALARY SETUP ==========
CREATE TABLE IF NOT EXISTS employee_salary_structures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  company_id INT NOT NULL,
  location VARCHAR(160) NULL,
  ctc DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  effective_date DATE NOT NULL,
  status ENUM('DRAFT','ACTIVE','INACTIVE') NOT NULL DEFAULT 'DRAFT',
  notes VARCHAR(500) NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_salary_employee_effective (employee_id, effective_date),
  CONSTRAINT fk_salary_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_salary_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_salary_created_by FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_salary_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS salary_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  structure_id INT NOT NULL,
  component_code VARCHAR(40) NOT NULL,
  component_name VARCHAR(120) NOT NULL,
  amount DECIMAL(14,2) NULL,
  amount_status ENUM('SET','DETAILS_REQUIRED','NOT_APPLICABLE') NOT NULL DEFAULT 'DETAILS_REQUIRED',
  contribution_type ENUM('EMPLOYEE','EMPLOYER','NONE') NOT NULL DEFAULT 'NONE',
  is_deduction TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_structure_component (structure_id, component_code),
  CONSTRAINT fk_component_structure FOREIGN KEY (structure_id) REFERENCES employee_salary_structures(id) ON DELETE CASCADE
);

-- ========== PAYROLL ==========
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  status ENUM('DRAFT','SUBMITTED','APPROVED','LOCKED','PAID') NOT NULL DEFAULT 'DRAFT',
  working_days INT NOT NULL DEFAULT 26,
  notes VARCHAR(500) NULL,
  created_by INT NULL,
  submitted_by INT NULL,
  approved_by INT NULL,
  locked_by INT NULL,
  paid_by INT NULL,
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  locked_at DATETIME NULL,
  paid_at DATETIME NULL,
  reopen_reason VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_period (company_id, period_year, period_month),
  CONSTRAINT fk_payroll_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_created_by FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payroll_run_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  employee_id INT NOT NULL,
  structure_id INT NULL,
  payable_days DECIMAL(6,2) NOT NULL DEFAULT 0,
  ctc DECIMAL(14,2) NULL,
  gross_earnings DECIMAL(14,2) NULL,
  pf_employee DECIMAL(14,2) NULL,
  pf_employer DECIMAL(14,2) NULL,
  esi_employee DECIMAL(14,2) NULL,
  esi_employer DECIMAL(14,2) NULL,
  professional_tax DECIMAL(14,2) NULL,
  other_deductions DECIMAL(14,2) NULL,
  net_pay DECIMAL(14,2) NULL,
  calculation_notes VARCHAR(1000) NULL,
  component_snapshot JSON NULL,
  UNIQUE KEY uq_run_employee (run_id, employee_id),
  CONSTRAINT fk_payroll_item_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_item_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  employee_id INT NOT NULL,
  adjustment_type ENUM('EARNING','DEDUCTION') NOT NULL,
  label VARCHAR(160) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  approved_by INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_adj_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_adj_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payslip_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  run_item_id INT NOT NULL,
  employee_id INT NOT NULL,
  payslip_number VARCHAR(60) NOT NULL UNIQUE,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_by INT NULL,
  CONSTRAINT fk_payslip_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payslip_item FOREIGN KEY (run_item_id) REFERENCES payroll_run_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_payslip_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- ========== ACCESS REQUESTS ==========
CREATE TABLE IF NOT EXISTS admin_access_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  requested_action VARCHAR(160) NOT NULL,
  module VARCHAR(80) NULL,
  reason VARCHAR(1000) NULL,
  previous_scope JSON NULL,
  requested_scope JSON NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by INT NULL,
  review_notes VARCHAR(1000) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_access_req_requester FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_req_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS access_decision_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  actor_id INT NOT NULL,
  decision ENUM('APPROVED','REJECTED','CREATED') NOT NULL,
  previous_value JSON NULL,
  new_value JSON NULL,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decision_request FOREIGN KEY (request_id) REFERENCES admin_access_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_actor FOREIGN KEY (actor_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- ========== ASSETS ==========
CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  category VARCHAR(80) NOT NULL,
  asset_tag VARCHAR(80) NOT NULL,
  serial_number VARCHAR(120) NULL,
  make VARCHAR(120) NULL,
  model VARCHAR(120) NULL,
  purchase_date DATE NULL,
  warranty_expiry DATE NULL,
  condition_label ENUM('NEW','GOOD','FAIR','POOR','DAMAGED') NOT NULL DEFAULT 'GOOD',
  status ENUM('AVAILABLE','ASSIGNED','REPAIR','LOST','RETIRED') NOT NULL DEFAULT 'AVAILABLE',
  notes VARCHAR(500) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_tag (company_id, asset_tag),
  CONSTRAINT fk_asset_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  employee_id INT NOT NULL,
  assigned_by INT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  condition_at_assignment VARCHAR(40) NULL,
  status ENUM('ACTIVE','RETURNED','TRANSFERRED','LOST') NOT NULL DEFAULT 'ACTIVE',
  returned_at DATETIME NULL,
  return_condition VARCHAR(40) NULL,
  return_status ENUM('RETURNED','DAMAGED','LOST','PENDING') NULL,
  return_remarks VARCHAR(500) NULL,
  CONSTRAINT fk_assign_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_acknowledgements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  employee_id INT NOT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500) NULL,
  CONSTRAINT fk_ack_assignment FOREIGN KEY (assignment_id) REFERENCES asset_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ack_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_service_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  assignment_id INT NULL,
  record_type ENUM('REPAIR','REPLACEMENT','DAMAGE','LOSS','TRANSFER') NOT NULL,
  description VARCHAR(1000) NOT NULL,
  reported_by INT NULL,
  resolved_by INT NULL,
  status ENUM('OPEN','IN_PROGRESS','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  CONSTRAINT fk_service_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  asset_id INT NOT NULL,
  employee_id INT NOT NULL,
  return_status ENUM('RETURNED','DAMAGED','LOST','PENDING') NOT NULL,
  condition_label VARCHAR(40) NULL,
  return_date DATE NOT NULL,
  remarks VARCHAR(500) NULL,
  recorded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_return_assignment FOREIGN KEY (assignment_id) REFERENCES asset_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_return_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

-- Client allocation for client-wise payroll cost (optional)
CREATE TABLE IF NOT EXISTS employee_client_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  client_id INT NOT NULL,
  allocation_percent DECIMAL(5,2) NOT NULL DEFAULT 100,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  CONSTRAINT fk_alloc_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Seed permissions for new modules
INSERT IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_approve, can_delete, can_export)
VALUES
  ('SUPER_ADMIN','payroll',1,1,1,1,1,1),
  ('SUPER_ADMIN','salary',1,1,1,1,1,1),
  ('SUPER_ADMIN','assets',1,1,1,1,1,1),
  ('SUPER_ADMIN','access_requests',1,1,1,1,1,1),
  ('ADMIN','payroll',1,1,1,1,0,1),
  ('ADMIN','salary',1,1,1,0,0,0),
  ('ADMIN','assets',1,1,1,1,0,1),
  ('ADMIN','access_requests',1,1,0,0,0,0),
  ('HR','payroll',1,1,1,0,0,1),
  ('HR','salary',1,1,1,0,0,0),
  ('HR','assets',1,1,1,1,0,0),
  ('MANAGER','assets',1,0,0,0,0,0),
  ('MANAGER','payroll',1,0,0,0,0,0),
  ('EMPLOYEE','assets',1,0,0,0,0,0),
  ('EMPLOYEE','payroll',1,0,0,0,0,0),
  ('ADMIN','reports',1,0,0,0,0,1),
  ('HR','reports',1,0,0,0,0,1);
