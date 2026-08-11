/**
 * Additive employee profile columns + related tables (from 003_employee_profile).
 * Required for dashboard, My Profile, attendance, and full HRMS feature parity
 * on newly provisioned tenant databases.
 */
export async function ensureEmployeeProfileSchema({
  pool,
  dbName
} = {}) {
  if (!pool || !dbName) {
    throw new Error(
      'ensureEmployeeProfileSchema requires { pool, dbName }'
    );
  }

  async function columnExists(tableName, columnName) {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1`,
      [dbName, tableName, columnName]
    );
    return rows.length > 0;
  }

  async function addColumn(tableName, columnName, definition) {
    if (await columnExists(tableName, columnName)) {
      return;
    }
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
    );
  }

  // Profile fields used by dashboard / My Profile / employee CRUD.
  await addColumn(
    'employees',
    'profile_photo',
    'VARCHAR(255) NULL AFTER full_name'
  );
  await addColumn(
    'employees',
    'personal_email',
    'VARCHAR(160) NULL AFTER email'
  );
  await addColumn(
    'employees',
    'alternate_phone',
    'VARCHAR(25) NULL AFTER phone'
  );
  await addColumn(
    'employees',
    'gender',
    `ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NULL AFTER date_of_birth`
  );
  await addColumn(
    'employees',
    'blood_group',
    'VARCHAR(10) NULL AFTER gender'
  );
  await addColumn(
    'employees',
    'marital_status',
    `ENUM('SINGLE','MARRIED','DIVORCED','WIDOWED','OTHER') NULL AFTER blood_group`
  );
  await addColumn(
    'employees',
    'employment_type',
    `ENUM('PERMANENT','CONTRACT','INTERN','CONSULTANT','TEMPORARY') DEFAULT 'PERMANENT' AFTER joining_date`
  );
  await addColumn(
    'employees',
    'work_location',
    'VARCHAR(160) NULL AFTER employment_type'
  );
  await addColumn(
    'employees',
    'notification_preferences',
    'JSON NULL AFTER password_changed_at'
  );

  await pool.query(`
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
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
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
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
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
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      document_type ENUM(
        'AADHAAR','PAN','PASSPORT','DRIVING_LICENCE','RESUME',
        'OFFER_LETTER','JOINING_LETTER','EDUCATION_CERTIFICATE',
        'EXPERIENCE_LETTER','ADDRESS_PROOF','OTHER'
      ) NOT NULL,
      document_number VARCHAR(100) NULL,
      file_path VARCHAR(255) NOT NULL,
      uploaded_by INT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_document_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_document_uploader
        FOREIGN KEY (uploaded_by) REFERENCES employees(id) ON DELETE SET NULL
    )
  `);
}
