import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  getCompanyIdsForUser,
  getCompanyScopes,
  getRolePermissions,
  replaceCompanyScopes,
  upsertRolePermission,
  assertPermission
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';

export const listCompanies = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'view');

  let rows;
  if (req.user.role === 'SUPER_ADMIN') {
    [rows] = await pool.query(
      `SELECT id, code, name, status, created_at
       FROM companies
       ORDER BY name`
    );
  } else {
    const ids = await getCompanyIdsForUser(req.user);
    if (!ids.length) {
      return res.json({ success: true, data: [] });
    }
    [rows] = await pool.query(
      `SELECT id, code, name, status, created_at
       FROM companies
       WHERE id IN (?)
       ORDER BY name`,
      [ids]
    );
  }

  res.json({ success: true, data: rows });
});

export const createCompany = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'companies', 'create');

  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();

  if (!code || !name) {
    throw new AppError('Company code and name are required.', 400);
  }

  const [result] = await pool.query(
    `INSERT INTO companies (code, name, status)
     VALUES (?, ?, 'ACTIVE')`,
    [code, name]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'COMPANY_CREATED',
    entityType: 'companies',
    entityId: result.insertId,
    newValues: { code, name },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: 'Company created.',
    data: { id: result.insertId }
  });
});

export const listAdmins = asyncHandler(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can view admin directory.', 403);
  }

  const [rows] = await pool.query(
    `SELECT
       e.id,
       e.employee_id,
       e.full_name,
       e.email,
       e.role,
       e.status,
       e.company_id,
       c.name AS company_name
     FROM employees e
     LEFT JOIN companies c ON c.id = e.company_id
     WHERE e.role IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER')
     ORDER BY e.role, e.full_name`
  );

  res.json({ success: true, data: rows });
});

export const getAdminScopes = asyncHandler(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can manage scopes.', 403);
  }

  const adminId = Number(req.params.id);
  const scopes = await getCompanyScopes(adminId);
  res.json({ success: true, data: scopes });
});

export const updateAdminScopes = asyncHandler(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can manage scopes.', 403);
  }

  const adminId = Number(req.params.id);
  const companyIds = Array.isArray(req.body.companyIds)
    ? req.body.companyIds.map(Number).filter((id) => id > 0)
    : [];

  const [admins] = await pool.query(
    `SELECT id, role, full_name FROM employees WHERE id = ? LIMIT 1`,
    [adminId]
  );

  if (!admins.length) {
    throw new AppError('Admin not found.', 404);
  }

  if (admins[0].role === 'SUPER_ADMIN') {
    throw new AppError(
      'Super Admin has system-wide access; scopes are not required.',
      400
    );
  }

  const previous = await getCompanyScopes(adminId);
  await replaceCompanyScopes(adminId, companyIds);
  const next = await getCompanyScopes(adminId);

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ADMIN_SCOPES_UPDATED',
    entityType: 'user_company_scopes',
    entityId: adminId,
    oldValues: { companyIds: previous.map((s) => s.id) },
    newValues: { companyIds: next.map((s) => s.id) },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: 'Company scopes updated.',
    data: next
  });
});

export const getRolePermissionMatrix = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'permissions', 'view');

  const role = req.params.role || req.query.role;
  if (!role) {
    const [rows] = await pool.query(
      `SELECT * FROM role_permissions ORDER BY role, module`
    );
    return res.json({ success: true, data: rows });
  }

  const data = await getRolePermissions(role);
  res.json({ success: true, data });
});

export const updateRolePermission = asyncHandler(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can update permissions.', 403);
  }

  const role = req.params.role;
  const module = req.body.module;
  if (!role || !module) {
    throw new AppError('Role and module are required.', 400);
  }

  if (role === 'SUPER_ADMIN') {
    throw new AppError('Super Admin permissions cannot be reduced.', 400);
  }

  const previous = await getRolePermissions(role);
  await upsertRolePermission(role, module, {
    can_view: Boolean(req.body.can_view),
    can_create: Boolean(req.body.can_create),
    can_edit: Boolean(req.body.can_edit),
    can_approve: Boolean(req.body.can_approve),
    can_delete: Boolean(req.body.can_delete),
    can_export: Boolean(req.body.can_export)
  });

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ROLE_PERMISSION_UPDATED',
    entityType: 'role_permissions',
    entityId: `${role}:${module}`,
    oldValues: previous.find((p) => p.module === module) || null,
    newValues: req.body,
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: 'Permission updated.',
    data: await getRolePermissions(role)
  });
});
