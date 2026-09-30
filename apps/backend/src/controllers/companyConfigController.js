import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  assertCompanyAccess,
  assertPermission,
  getCompanyIdsForUser
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';

export const getCompanyProfile = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'view');
  const companyId = Number(req.params.companyId);
  await assertCompanyAccess(req.user, companyId);

  const [rows] = await pool.query(
    `SELECT id, code, name, address, official_email, contact_phone, website, status
     FROM companies
     WHERE id = ?
     LIMIT 1`,
    [companyId]
  );
  if (!rows.length) throw new AppError('Company not found.', 404);

  res.json({ success: true, data: rows[0] });
});

export const updateCompanyProfile = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'edit');
  const companyId = Number(req.params.companyId);
  await assertCompanyAccess(req.user, companyId);

  const name = String(req.body.name || '').trim();
  if (!name) throw new AppError('Company name is required.', 400);

  await pool.query(
    `UPDATE companies
     SET
       name = ?,
       address = ?,
       official_email = ?,
       contact_phone = ?,
       website = ?,
       status = COALESCE(?, status)
     WHERE id = ?`,
    [
      name,
      req.body.address?.trim() || null,
      req.body.officialEmail?.trim() || null,
      req.body.contactPhone?.trim() || null,
      req.body.website?.trim() || null,
      req.body.status || null,
      companyId
    ]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'COMPANY_PROFILE_UPDATED',
    entityType: 'companies',
    entityId: companyId,
    newValues: { name },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Company profile updated.' });
});

export const listOfficeShifts = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'view');
  const companyId = Number(req.params.companyId);
  await assertCompanyAccess(req.user, companyId);

  const [rows] = await pool.query(
    `SELECT * FROM company_office_shifts
     WHERE company_id = ?
     ORDER BY status ASC, name ASC`,
    [companyId]
  );
  res.json({ success: true, data: rows });
});

export const upsertOfficeShift = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'edit');
  const companyId = Number(req.params.companyId);
  await assertCompanyAccess(req.user, companyId);

  const name = String(req.body.name || '').trim();
  const startTime = req.body.startTime || '09:30:00';
  const endTime = req.body.endTime || '18:30:00';
  const breakMinutes = Number(req.body.breakMinutes ?? 60);
  const workingDays = String(req.body.workingDays || 'MON,TUE,WED,THU,FRI');
  const status = req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const shiftId = req.body.id ? Number(req.body.id) : null;

  if (!name) throw new AppError('Shift name is required.', 400);

  if (shiftId) {
    await pool.query(
      `UPDATE company_office_shifts
       SET name = ?, start_time = ?, end_time = ?, break_minutes = ?,
           working_days = ?, status = ?
       WHERE id = ? AND company_id = ?`,
      [
        name,
        startTime,
        endTime,
        breakMinutes,
        workingDays,
        status,
        shiftId,
        companyId
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO company_office_shifts (
         company_id, name, start_time, end_time, break_minutes, working_days, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, name, startTime, endTime, breakMinutes, workingDays, status]
    );
  }

  res.json({ success: true, message: 'Office shift saved.' });
});

export const listHolidays = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'view');
  const companyIds = await getCompanyIdsForUser(req.user);
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;

  let sql = `
    SELECT h.*
    FROM holidays h
    WHERE 1=1
  `;
  const params = [];
  if (companyId) {
    await assertCompanyAccess(req.user, companyId);
    sql += ' AND (h.company_id = ? OR h.company_id IS NULL)';
    params.push(companyId);
  } else if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) return res.json({ success: true, data: [] });
    sql += ' AND (h.company_id IN (?) OR h.company_id IS NULL)';
    params.push(companyIds);
  }
  sql += ' ORDER BY h.holiday_date ASC';

  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

export const createHoliday = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'edit');
  const name = String(req.body.holidayName || req.body.name || '').trim();
  const holidayDate = req.body.holidayDate || req.body.date;
  const companyId = req.body.companyId ? Number(req.body.companyId) : null;

  if (!name || !holidayDate) {
    throw new AppError('Holiday name and date are required.', 400);
  }
  if (companyId) await assertCompanyAccess(req.user, companyId);

  const [result] = await pool.query(
    `INSERT INTO holidays (
       holiday_name, holiday_date, holiday_type, description, company_id, created_by
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name,
      holidayDate,
      req.body.holidayType || 'COMPANY',
      req.body.description || null,
      companyId,
      req.user.id
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Holiday added.',
    data: { id: result.insertId }
  });
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'edit');
  const holidayId = Number(req.params.holidayId);

  const [rows] = await pool.query(
    `SELECT * FROM holidays WHERE id = ? LIMIT 1`,
    [holidayId]
  );
  if (!rows.length) throw new AppError('Holiday not found.', 404);
  if (rows[0].company_id) {
    await assertCompanyAccess(req.user, rows[0].company_id);
  } else if (req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can remove global holidays.', 403);
  }

  await pool.query(`DELETE FROM holidays WHERE id = ?`, [holidayId]);
  res.json({ success: true, message: 'Holiday removed.' });
});
