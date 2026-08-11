import crypto from 'node:crypto';
import { getMasterPool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { normalizeCompanyCode } from '../services/onboardingService.js';

function generateActivationCode() {
  const raw = crypto.randomBytes(8).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g).join('-');
}

export const listCompaniesController = asyncHandler(async (_req, res) => {
  const master = getMasterPool();
  const [rows] = await master.query(
    `SELECT id, code, name, display_name AS displayName, db_name AS dbName,
            status, created_at AS createdAt, updated_at AS updatedAt
     FROM companies
     ORDER BY created_at ASC`
  );

  res.json({ success: true, data: rows });
});

export const setCompanyStatusController = asyncHandler(async (req, res) => {
  const code = normalizeCompanyCode(
    req.params.code || req.body.companyCode
  );
  const status = String(req.body.status || '')
    .trim()
    .toUpperCase();

  if (!code) {
    throw new AppError('Company code is required.', 400);
  }
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    throw new AppError('Status must be ACTIVE or SUSPENDED.', 400);
  }

  const master = getMasterPool();
  const [result] = await master.query(
    `UPDATE companies SET status = ? WHERE code = ?`,
    [status, code]
  );

  if (!result.affectedRows) {
    throw new AppError('Company not found.', 404);
  }

  const [[row]] = await master.query(
    `SELECT id, code, name, display_name AS displayName, db_name AS dbName,
            status, created_at AS createdAt, updated_at AS updatedAt
     FROM companies WHERE code = ? LIMIT 1`,
    [code]
  );

  res.json({
    success: true,
    message: `Company ${row.code} is now ${row.status}.`,
    data: row
  });
});

export const createActivationCodeController = asyncHandler(
  async (req, res) => {
    const note = String(req.body.note || '').trim() || null;
    const createdBy =
      String(req.body.createdBy || 'platform-api').trim() ||
      'platform-api';
    const expiresDays = Number(req.body.expiresDays);
    let expiresAt = null;
    if (Number.isFinite(expiresDays) && expiresDays > 0) {
      expiresAt = new Date(
        Date.now() + expiresDays * 24 * 60 * 60 * 1000
      );
    }

    const code = generateActivationCode();
    const master = getMasterPool();
    const [result] = await master.query(
      `INSERT INTO activation_codes (code, note, created_by, expires_at)
       VALUES (?, ?, ?, ?)`,
      [code, note, createdBy, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: 'Activation code created.',
      data: {
        id: result.insertId,
        code,
        note,
        createdBy,
        expiresAt
      }
    });
  }
);

export const listActivationCodesController = asyncHandler(
  async (req, res) => {
    const unusedOnly = String(req.query.unused || '') === '1';
    const master = getMasterPool();
    const [rows] = await master.query(
      unusedOnly
        ? `SELECT id, code, note, created_by AS createdBy, expires_at AS expiresAt,
                  used_at AS usedAt, company_id AS companyId, created_at AS createdAt
           FROM activation_codes
           WHERE used_at IS NULL
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY created_at DESC
           LIMIT 200`
        : `SELECT id, code, note, created_by AS createdBy, expires_at AS expiresAt,
                  used_at AS usedAt, company_id AS companyId, created_at AS createdAt
           FROM activation_codes
           ORDER BY created_at DESC
           LIMIT 200`
    );

    res.json({ success: true, data: rows });
  }
);
