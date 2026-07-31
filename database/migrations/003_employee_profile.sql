USE srsb_hrms;

-- Change the existing admin ID to the company format.
UPDATE employees
SET employee_id = 'SRSB001'
WHERE employee_id = 'SRSB-ADMIN-001';

-- Add employee profile fields.
ALTER TABLE employees
    ADD COLUMN profile_photo VARCHAR(255) NULL AFTER full_name,
    ADD COLUMN date_of_birth DATE NULL AFTER phone,
    ADD COLUMN gender ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NULL AFTER date_of_birth,
    ADD COLUMN blood_group VARCHAR(10) NULL AFTER gender,
    ADD COLUMN marital_status ENUM('SINGLE','MARRIED','DIVORCED','WIDOWED','OTHER') NULL AFTER blood_group,
    ADD COLUMN personal_email VARCHAR(160) NULL AFTER email,
    ADD COLUMN alternate_phone VARCHAR(25) NULL AFTER phone,
    ADD COLUMN employment_type ENUM(
        'PERMANENT',
        'CONTRACT',
        'INTERN',
        'CONSULTANT',
        'TEMPORARY'
    ) DEFAULT 'PERMANENT' AFTER joining_date,
    ADD COLUMN work_location VARCHAR(160) NULL AFTER employment_type;

CREATE TABLE IF NOT EXISTS employee_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    address_type ENUM('CURRENT','PERMANENT') NOT NULL,
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255) NULL,
    city VARCHAR(120) NOT NULL,
    state VARCHAR(120) NOT NULL,
    postal_code VARCHAR(15) NOT NULL,
    country VARCHAR(120) DEFAULT 'India',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_employee_address_type (employee_id, address_type),
    CONSTRAINT fk_address_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    contact_name VARCHAR(120) NOT NULL,
    relationship VARCHAR(80) NOT NULL,
    phone VARCHAR(25) NOT NULL,
    alternate_phone VARCHAR(25) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_emergency_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_bank_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL UNIQUE,
    account_holder_name VARCHAR(160) NULL,
    bank_name VARCHAR(160) NULL,
    account_number VARCHAR(50) NULL,
    ifsc_code VARCHAR(20) NULL,
    branch_name VARCHAR(160) NULL,
    pan_number VARCHAR(20) NULL,
    uan_number VARCHAR(30) NULL,
    pf_number VARCHAR(30) NULL,
    esi_number VARCHAR(30) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bank_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    document_type ENUM(
        'AADHAAR',
        'PAN',
        'PASSPORT',
        'DRIVING_LICENCE',
        'RESUME',
        'OFFER_LETTER',
        'JOINING_LETTER',
        'EDUCATION_CERTIFICATE',
        'EXPERIENCE_LETTER',
        'ADDRESS_PROOF',
        'OTHER'
    ) NOT NULL,
    document_number VARCHAR(100) NULL,
    file_path VARCHAR(255) NOT NULL,
    uploaded_by INT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_document_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_document_uploader
        FOREIGN KEY (uploaded_by)
        REFERENCES employees(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_employee_full_name ON employees(full_name);
CREATE INDEX idx_employee_status ON employees(status);
CREATE INDEX idx_employee_department ON employees(department_id);