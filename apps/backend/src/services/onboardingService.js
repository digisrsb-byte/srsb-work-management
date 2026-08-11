import bcrypt from 'bcryptjs';
import { getMasterPool } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import {
  buildTenantDbName,
  findCompanyByCode,
  provisionTenantDatabase
} from './tenantProvisioner.js';

const RESERVED_COMPANY_CODES = new Set([
  'SRSB',
  'PLATFORM',
  'ADMIN',
  'SYSTEM',
  'MASTER',
  'API'
]);

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function normalizeActivationCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function normalizeCompanyCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
}

function requireText(value, label, { min = 1, max = 220 } = {}) {
  const text = String(value || '').trim();
  if (text.length < min) {
    throw new AppError(`${label} is required.`, 400);
  }
  if (text.length > max) {
    throw new AppError(`${label} must be ${max} characters or fewer.`, 400);
  }
  return text;
}

function optionalText(value, max = 1000) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const text = String(value).trim();
  if (text.length > max) {
    throw new AppError(`Value must be ${max} characters or fewer.`, 400);
  }
  return text || null;
}

function parseImage(file, label) {
  if (!file || (!file.data && !file.base64)) {
    return null;
  }

  const raw = String(file.data || file.base64 || '');
  const mime = String(file.type || file.mime || 'image/png')
    .trim()
    .toLowerCase()
    .slice(0, 120);

  if (!IMAGE_MIME_TYPES.has(mime)) {
    throw new AppError(
      `${label} must be a PNG, JPEG, WebP, or GIF image.`,
      400
    );
  }

  const buffer = Buffer.from(
    raw.includes(',') ? raw.split(',').pop() : raw,
    'base64'
  );

  if (!buffer.length) {
    throw new AppError(`${label} could not be read.`, 400);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new AppError(`${label} must be 2 MB or smaller.`, 400);
  }

  return { mime, data: buffer };
}

async function loadActivationCode(activationCode) {
  const code = normalizeActivationCode(activationCode);
  if (!code) {
    throw new AppError('Activation code is required.', 400);
  }

  const master = getMasterPool();
  const [rows] = await master.query(
    `SELECT id, code, company_id, note, expires_at, used_at, created_at
     FROM activation_codes
     WHERE code = ?
     LIMIT 1`,
    [code]
  );

  return { code, record: rows[0] || null };
}

function assertActivationUsable(record) {
  if (!record) {
    throw new AppError('Invalid activation code.', 400);
  }
  if (record.used_at) {
    throw new AppError('This activation code has already been used.', 400);
  }
  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
    throw new AppError('This activation code has expired.', 400);
  }
}

/**
 * Public validation for the setup wizard (does not consume the code).
 */
export async function validateActivationCode(activationCode) {
  const { code, record } = await loadActivationCode(activationCode);
  assertActivationUsable(record);

  return {
    valid: true,
    code,
    note: record.note || null,
    expiresAt: record.expires_at || null
  };
}

/**
 * Status helper for EXE / web first-run checks.
 */
export async function getOnboardingStatus(companyCode) {
  const master = getMasterPool();
  const [[counts]] = await master.query(
    `SELECT
       (SELECT COUNT(*) FROM companies WHERE status = 'ACTIVE') AS activeCompanies,
       (SELECT COUNT(*) FROM activation_codes WHERE used_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())) AS unusedCodes`
  );

  const payload = {
    platformReady: true,
    activeCompanies: Number(counts.activeCompanies || 0),
    unusedActivationCodes: Number(counts.unusedCodes || 0),
    company: null,
    requiresSetup: true
  };

  const code = normalizeCompanyCode(companyCode);
  if (!code) {
    return payload;
  }

  const company = await findCompanyByCode(code);
  if (!company) {
    payload.companyCode = code;
    payload.requiresSetup = true;
    payload.message =
      'No company is registered with this code. Complete the setup wizard.';
    return payload;
  }

  payload.company = {
    id: company.id,
    code: company.code,
    name: company.name,
    displayName: company.display_name || company.name,
    status: company.status,
    createdAt: company.created_at
  };
  payload.requiresSetup = false;
  payload.canLogin = company.status === 'ACTIVE';
  if (company.status === 'SUSPENDED') {
    payload.message =
      'This company is suspended. Contact the platform administrator.';
  }

  return payload;
}

async function assertCompanyCodeAvailable(companyCode) {
  const code = normalizeCompanyCode(companyCode);
  if (code.length < 3) {
    throw new AppError(
      'Company code must be at least 3 characters (A–Z, 0–9).',
      400
    );
  }
  if (RESERVED_COMPANY_CODES.has(code)) {
    throw new AppError(
      'This company code is reserved. Choose a different code.',
      400
    );
  }

  const existing = await findCompanyByCode(code);
  if (existing) {
    throw new AppError(
      'A company with this code already exists. Choose a different code.',
      409
    );
  }

  return code;
}

async function seedTenantCompany({
  pool,
  company,
  logo,
  signature,
  admin
}) {
  const passwordHash = await bcrypt.hash(admin.password, 12);
  const invoicePrefix = (
    company.invoicePrefix || company.companyCode
  )
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 30)
    .toUpperCase() || 'INV';

  await pool.query(
    `INSERT INTO company_settings (
       id, legal_name, display_name, address, phone, email, gst_number, state_code,
       bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch,
       logo_mime, logo_data, signature_mime, signature_data,
       sac_code, authorised_signatory, invoice_prefix
     ) VALUES (
       1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )
     ON DUPLICATE KEY UPDATE
       legal_name = VALUES(legal_name),
       display_name = VALUES(display_name),
       address = VALUES(address),
       phone = VALUES(phone),
       email = VALUES(email),
       gst_number = VALUES(gst_number),
       state_code = VALUES(state_code),
       bank_account_name = VALUES(bank_account_name),
       bank_account_number = VALUES(bank_account_number),
       bank_ifsc = VALUES(bank_ifsc),
       bank_name = VALUES(bank_name),
       bank_branch = VALUES(bank_branch),
       logo_mime = VALUES(logo_mime),
       logo_data = VALUES(logo_data),
       signature_mime = VALUES(signature_mime),
       signature_data = VALUES(signature_data),
       sac_code = VALUES(sac_code),
       authorised_signatory = VALUES(authorised_signatory),
       invoice_prefix = VALUES(invoice_prefix)`,
    [
      company.legalName,
      company.displayName,
      company.address,
      company.phone,
      company.email,
      company.gstNumber,
      company.stateCode,
      company.bankAccountName,
      company.bankAccountNumber,
      company.bankIfsc,
      company.bankName,
      company.bankBranch,
      logo?.mime || null,
      logo?.data || null,
      signature?.mime || null,
      signature?.data || null,
      company.sacCode,
      company.authorisedSignatory,
      invoicePrefix
    ]
  );

  await pool.query(
    `INSERT INTO invoice_settings (
       id, legal_name, gst_number, registered_address, email, phone,
       default_sac_code, default_cgst_rate, default_sgst_rate, default_igst_rate,
       bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch,
       authorised_signatory, invoice_prefix
     ) VALUES (
       1, ?, ?, ?, ?, ?, ?, 9, 9, 18, ?, ?, ?, ?, ?, ?, ?
     )
     ON DUPLICATE KEY UPDATE
       legal_name = VALUES(legal_name),
       gst_number = VALUES(gst_number),
       registered_address = VALUES(registered_address),
       email = VALUES(email),
       phone = VALUES(phone),
       default_sac_code = VALUES(default_sac_code),
       bank_account_name = VALUES(bank_account_name),
       bank_account_number = VALUES(bank_account_number),
       bank_ifsc = VALUES(bank_ifsc),
       bank_name = VALUES(bank_name),
       bank_branch = VALUES(bank_branch),
       authorised_signatory = VALUES(authorised_signatory),
       invoice_prefix = VALUES(invoice_prefix)`,
    [
      company.legalName,
      company.gstNumber,
      company.address,
      company.email,
      company.phone,
      company.sacCode,
      company.bankAccountName,
      company.bankAccountNumber,
      company.bankIfsc,
      company.bankName,
      company.bankBranch,
      company.authorisedSignatory,
      invoicePrefix
    ]
  );

  const adminEmail = String(admin.email).trim().toLowerCase();
  const adminUsername = admin.username
    ? String(admin.username).trim().toLowerCase()
    : null;

  const [existingAdmin] = await pool.query(
    `SELECT id FROM employees
     WHERE LOWER(COALESCE(email, '')) = ?
        OR (? IS NOT NULL AND LOWER(COALESCE(username, '')) = ?)
     LIMIT 1`,
    [adminEmail, adminUsername, adminUsername]
  );

  let adminId;
  if (existingAdmin.length) {
    adminId = existingAdmin[0].id;
    await pool.query(
      `UPDATE employees SET
         full_name = ?,
         email = ?,
         username = COALESCE(?, username),
         password_hash = ?,
         role = 'SUPER_ADMIN',
         account_type = 'EMPLOYEE',
         status = 'ACTIVE',
         must_change_password = FALSE,
         password_changed_at = NOW()
       WHERE id = ?`,
      [
        admin.fullName,
        adminEmail,
        adminUsername,
        passwordHash,
        adminId
      ]
    );
  } else {
    const [result] = await pool.query(
      `INSERT INTO employees (
         employee_id, username, full_name, email, password_hash,
         role, account_type, designation, joining_date, status,
         must_change_password, password_changed_at
       ) VALUES (?, ?, ?, ?, ?, 'SUPER_ADMIN', 'EMPLOYEE', 'Company Admin', CURDATE(), 'ACTIVE', FALSE, NOW())`,
      [
        `ADM-${company.companyCode}`.slice(0, 30),
        adminUsername,
        admin.fullName,
        adminEmail,
        passwordHash
      ]
    );
    adminId = result.insertId;
  }

  return { adminId, adminEmail, invoicePrefix };
}

/**
 * Full company registration: validate code → provision DB → seed → mark used.
 */
export async function registerCompany(payload = {}) {
  const { record: activation } = await loadActivationCode(
    payload.activationCode
  );
  assertActivationUsable(activation);

  const companyCode = await assertCompanyCodeAvailable(
    payload.companyCode
  );
  const legalName = requireText(payload.legalName, 'Legal name', {
    max: 220
  });
  const displayName = requireText(
    payload.displayName || payload.legalName,
    'Display name',
    { max: 220 }
  );
  const address = optionalText(payload.address, 1000);
  const phone = optionalText(payload.phone, 120);
  const email = optionalText(payload.email, 180);
  const gstNumber = optionalText(
    payload.gstNumber || payload.gst,
    32
  );
  const stateCode = optionalText(payload.stateCode, 8);
  const bankAccountName = optionalText(payload.bankAccountName, 220);
  const bankAccountNumber = optionalText(
    payload.bankAccountNumber,
    80
  );
  const bankIfsc = optionalText(payload.bankIfsc, 40);
  const bankName = optionalText(payload.bankName, 160);
  const bankBranch = optionalText(payload.bankBranch, 160);
  const sacCode =
    optionalText(payload.sacCode, 24) || '998616';
  const authorisedSignatory =
    optionalText(payload.authorisedSignatory, 180) ||
    'Authorised Signatory';
  const invoicePrefix = optionalText(payload.invoicePrefix, 30);

  const admin = payload.admin || {};
  const adminFullName = requireText(
    admin.fullName || admin.name,
    'Admin full name',
    { max: 120 }
  );
  const adminEmail = requireText(
    admin.email || admin.loginId,
    'Admin email',
    { max: 160 }
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new AppError('Admin email must be a valid email address.', 400);
  }
  const adminPassword = String(admin.password || '');
  if (adminPassword.length < 8) {
    throw new AppError(
      'Admin password must contain at least 8 characters.',
      400
    );
  }
  const adminUsername = admin.username
    ? requireText(admin.username, 'Admin username', {
        min: 3,
        max: 80
      }).toLowerCase()
    : null;

  const logo = parseImage(payload.logo, 'Company logo');
  const signature = parseImage(
    payload.signature || payload.authorisedSignature,
    'Authorised signature'
  );

  const dbName = buildTenantDbName(companyCode);
  const { pool } = await provisionTenantDatabase({
    companyCode,
    dbName
  });

  const companyProfile = {
    companyCode,
    legalName,
    displayName,
    address,
    phone,
    email,
    gstNumber,
    stateCode,
    bankAccountName,
    bankAccountNumber,
    bankIfsc,
    bankName,
    bankBranch,
    sacCode,
    authorisedSignatory,
    invoicePrefix
  };

  const seeded = await seedTenantCompany({
    pool,
    company: companyProfile,
    logo,
    signature,
    admin: {
      fullName: adminFullName,
      email: adminEmail,
      username: adminUsername,
      password: adminPassword
    }
  });

  const master = getMasterPool();
  const connection = await master.getConnection();
  let companyId;

  try {
    await connection.beginTransaction();

    const [lockedRows] = await connection.query(
      `SELECT id, used_at, expires_at
       FROM activation_codes
       WHERE id = ?
       FOR UPDATE`,
      [activation.id]
    );
    const locked = lockedRows[0];
    assertActivationUsable(locked);

    const [codeClash] = await connection.query(
      `SELECT id FROM companies WHERE code = ? OR db_name = ? LIMIT 1`,
      [companyCode, dbName]
    );
    if (codeClash.length) {
      throw new AppError(
        'A company with this code already exists. Choose a different code.',
        409
      );
    }

    const [companyResult] = await connection.query(
      `INSERT INTO companies (code, name, display_name, db_name, status)
       VALUES (?, ?, ?, ?, 'ACTIVE')`,
      [companyCode, legalName, displayName, dbName]
    );
    companyId = companyResult.insertId;

    const [useResult] = await connection.query(
      `UPDATE activation_codes
       SET company_id = ?, used_at = NOW()
       WHERE id = ? AND used_at IS NULL`,
      [companyId, activation.id]
    );

    if (!useResult.affectedRows) {
      throw new AppError(
        'This activation code has already been used.',
        400
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    companyId,
    companyCode,
    dbName,
    displayName,
    legalName,
    admin: {
      id: seeded.adminId,
      email: seeded.adminEmail,
      role: 'SUPER_ADMIN'
    },
    invoicePrefix: seeded.invoicePrefix
  };
}
