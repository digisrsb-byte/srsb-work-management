import { pool } from '../config/database.js';
import { runWithTenant } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { findCompanyByCode } from '../services/tenantProvisioner.js';
import { normalizeCompanyCode } from '../services/onboardingService.js';
import { env } from '../config/env.js';

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function parseImage(file, label) {
  if (file === undefined) return undefined;
  if (file === null || file === '') return null;
  if (!file?.data && !file?.base64) return null;

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

function toDataUrl(mime, buffer) {
  if (!buffer || !mime) return null;
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!bytes.length) return null;
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function mapSettings(row, { includeImages = true } = {}) {
  if (!row) return null;

  const settings = {
    legalName: row.legal_name,
    displayName: row.display_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    gstNumber: row.gst_number,
    stateCode: row.state_code,
    bankAccountName: row.bank_account_name,
    bankAccountNumber: row.bank_account_number,
    bankIfsc: row.bank_ifsc,
    bankName: row.bank_name,
    bankBranch: row.bank_branch,
    sacCode: row.sac_code || '998616',
    authorisedSignatory:
      row.authorised_signatory || 'Authorised Signatory',
    invoicePrefix: row.invoice_prefix,
    updatedAt: row.updated_at,
    hasLogo: Boolean(row.logo_data && row.logo_mime),
    hasSignature: Boolean(row.signature_data && row.signature_mime)
  };

  if (includeImages) {
    settings.logoDataUrl = toDataUrl(row.logo_mime, row.logo_data);
    settings.signatureDataUrl = toDataUrl(
      row.signature_mime,
      row.signature_data
    );
  }

  return settings;
}

async function loadCompanySettingsRow() {
  const [rows] = await pool.query(
    'SELECT * FROM company_settings WHERE id = 1 LIMIT 1'
  );
  return rows[0] || null;
}

function defaultPublicBranding() {
  return {
    companyCode: env.defaultCompanyCode,
    displayName: env.defaultCompanyName,
    legalName: env.defaultCompanyName,
    logoDataUrl: null,
    tagline: 'Desktop Operations Suite'
  };
}

/**
 * Public branding for login / setup (no auth).
 * Resolves company from master → reads company_settings from tenant DB.
 */
export const getPublicBranding = asyncHandler(async (req, res) => {
  const code =
    normalizeCompanyCode(
      req.query.companyCode || req.query.code
    ) || env.defaultCompanyCode;

  const company = await findCompanyByCode(code);
  if (!company || company.status !== 'ACTIVE') {
    return res.json({
      success: true,
      data: {
        ...defaultPublicBranding(),
        companyCode: code,
        found: false
      }
    });
  }

  const branding = await runWithTenant(
    {
      companyId: company.id,
      companyCode: company.code,
      dbName: company.db_name
    },
    async () => {
      const row = await loadCompanySettingsRow();
      return {
        companyCode: company.code,
        displayName:
          row?.display_name ||
          company.display_name ||
          company.name,
        legalName: row?.legal_name || company.name,
        logoDataUrl: toDataUrl(row?.logo_mime, row?.logo_data),
        tagline: 'Desktop Operations Suite',
        found: true
      };
    }
  );

  res.json({ success: true, data: branding });
});

export const getCompanySettings = asyncHandler(async (req, res) => {
  const row = await loadCompanySettingsRow();
  if (!row) {
    throw new AppError('Company settings have not been configured yet.', 404);
  }

  res.json({
    success: true,
    data: {
      ...mapSettings(row),
      companyCode: req.user.companyCode,
      companyId: req.user.companyId
    }
  });
});

export const updateCompanySettings = asyncHandler(async (req, res) => {
  const legalName = String(req.body.legalName || '').trim();
  const displayName = String(
    req.body.displayName || req.body.legalName || ''
  ).trim();

  if (!legalName) {
    throw new AppError('Legal name is required.', 400);
  }
  if (!displayName) {
    throw new AppError('Display name is required.', 400);
  }

  const values = {
    legalName,
    displayName,
    address: String(req.body.address || '').trim() || null,
    phone: String(req.body.phone || '').trim() || null,
    email: String(req.body.email || '').trim() || null,
    gstNumber: String(req.body.gstNumber || '').trim() || null,
    stateCode: String(req.body.stateCode || '').trim() || null,
    bankAccountName:
      String(req.body.bankAccountName || '').trim() || null,
    bankAccountNumber:
      String(req.body.bankAccountNumber || '').trim() || null,
    bankIfsc: String(req.body.bankIfsc || '').trim() || null,
    bankName: String(req.body.bankName || '').trim() || null,
    bankBranch: String(req.body.bankBranch || '').trim() || null,
    sacCode: String(req.body.sacCode || '998616').trim() || '998616',
    authorisedSignatory:
      String(req.body.authorisedSignatory || '').trim() ||
      'Authorised Signatory',
    invoicePrefix:
      String(req.body.invoicePrefix || displayName || 'INV')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 30) || 'INV'
  };

  const logo = parseImage(req.body.logo, 'Company logo');
  const signature = parseImage(
    req.body.signature || req.body.authorisedSignature,
    'Authorised signature'
  );

  const existing = await loadCompanySettingsRow();
  if (!existing) {
    await pool.query(
      `INSERT INTO company_settings (
         id, legal_name, display_name, address, phone, email, gst_number, state_code,
         bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch,
         logo_mime, logo_data, signature_mime, signature_data,
         sac_code, authorised_signatory, invoice_prefix
       ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        values.legalName,
        values.displayName,
        values.address,
        values.phone,
        values.email,
        values.gstNumber,
        values.stateCode,
        values.bankAccountName,
        values.bankAccountNumber,
        values.bankIfsc,
        values.bankName,
        values.bankBranch,
        logo?.mime || null,
        logo?.data || null,
        signature?.mime || null,
        signature?.data || null,
        values.sacCode,
        values.authorisedSignatory,
        values.invoicePrefix
      ]
    );
  } else {
    const logoMime =
      logo === undefined ? existing.logo_mime : logo?.mime || null;
    const logoData =
      logo === undefined ? existing.logo_data : logo?.data || null;
    const signatureMime =
      signature === undefined
        ? existing.signature_mime
        : signature?.mime || null;
    const signatureData =
      signature === undefined
        ? existing.signature_data
        : signature?.data || null;

    await pool.query(
      `UPDATE company_settings SET
         legal_name = ?, display_name = ?, address = ?, phone = ?, email = ?,
         gst_number = ?, state_code = ?, bank_account_name = ?, bank_account_number = ?,
         bank_ifsc = ?, bank_name = ?, bank_branch = ?,
         logo_mime = ?, logo_data = ?, signature_mime = ?, signature_data = ?,
         sac_code = ?, authorised_signatory = ?, invoice_prefix = ?
       WHERE id = 1`,
      [
        values.legalName,
        values.displayName,
        values.address,
        values.phone,
        values.email,
        values.gstNumber,
        values.stateCode,
        values.bankAccountName,
        values.bankAccountNumber,
        values.bankIfsc,
        values.bankName,
        values.bankBranch,
        logoMime,
        logoData,
        signatureMime,
        signatureData,
        values.sacCode,
        values.authorisedSignatory,
        values.invoicePrefix
      ]
    );
  }

  // Keep invoice_settings in sync for invoice prefix / PDF fields.
  await pool.query(
    `INSERT INTO invoice_settings (
       id, legal_name, gst_number, registered_address, email, phone,
       default_sac_code, default_cgst_rate, default_sgst_rate, default_igst_rate,
       bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch,
       authorised_signatory, invoice_prefix, updated_by
     ) VALUES (
       1, ?, ?, ?, ?, ?, ?, 9, 9, 18, ?, ?, ?, ?, ?, ?, ?, ?
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
       invoice_prefix = VALUES(invoice_prefix),
       updated_by = VALUES(updated_by)`,
    [
      values.legalName,
      values.gstNumber,
      values.address,
      values.email,
      values.phone,
      values.sacCode,
      values.bankAccountName,
      values.bankAccountNumber,
      values.bankIfsc,
      values.bankName,
      values.bankBranch,
      values.authorisedSignatory,
      values.invoicePrefix,
      req.user.id
    ]
  );

  // Update master display name for directory listings.
  if (req.user.companyId) {
    const { getMasterPool } = await import('../config/database.js');
    await getMasterPool().query(
      `UPDATE companies SET name = ?, display_name = ? WHERE id = ?`,
      [values.legalName, values.displayName, req.user.companyId]
    );
  }

  const updated = await loadCompanySettingsRow();
  res.json({
    success: true,
    message: 'Company profile updated successfully.',
    data: {
      ...mapSettings(updated),
      companyCode: req.user.companyCode,
      companyId: req.user.companyId
    }
  });
});
