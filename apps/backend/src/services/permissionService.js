import { pool } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

const ACTION_COLUMN = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  approve: 'can_approve',
  delete: 'can_delete',
  export: 'can_export'
};

export async function getCompanyScopes(employeeId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.code, c.name, c.status
     FROM user_company_scopes ucs
     INNER JOIN companies c ON c.id = ucs.company_id
     WHERE ucs.employee_id = ?
     ORDER BY c.name`,
    [employeeId]
  );
  return rows;
}

export async function getCompanyIdsForUser(user) {
  if (!user) return [];
  if (user.role === 'SUPER_ADMIN') {
    const [rows] = await pool.query(
      `SELECT id FROM companies WHERE status = 'ACTIVE'`
    );
    return rows.map((row) => row.id);
  }

  const scopes = await getCompanyScopes(user.id);
  if (scopes.length) {
    return scopes.map((row) => row.id);
  }

  // Fallback: use the employee's home company when scopes were never seeded.
  const [emps] = await pool.query(
    `SELECT company_id FROM employees WHERE id = ? LIMIT 1`,
    [user.id]
  );
  if (emps[0]?.company_id) {
    return [Number(emps[0].company_id)];
  }

  return [];
}

export async function assertCompanyAccess(user, companyId) {
  if (!companyId) {
    throw new AppError('Company is required.', 400);
  }

  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  const companyIds = await getCompanyIdsForUser(user);
  if (!companyIds.includes(Number(companyId))) {
    throw new AppError(
      'You do not have access to this company.',
      403
    );
  }

  return true;
}

export async function getRolePermissions(role) {
  const [rows] = await pool.query(
    `SELECT
       module,
       can_view,
       can_create,
       can_edit,
       can_approve,
       can_delete,
       can_export
     FROM role_permissions
     WHERE role = ?
     ORDER BY module`,
    [role]
  );
  return rows;
}

export async function hasPermission(role, module, action) {
  if (role === 'SUPER_ADMIN') {
    return true;
  }

  const column = ACTION_COLUMN[action];
  if (!column) {
    return false;
  }

  const [rows] = await pool.query(
    `SELECT ${column} AS allowed
     FROM role_permissions
     WHERE role = ?
       AND module = ?
     LIMIT 1`,
    [role, module]
  );

  return Boolean(rows[0]?.allowed);
}

export async function assertPermission(user, module, action) {
  const allowed = await hasPermission(user.role, module, action);
  if (!allowed) {
    throw new AppError(
      `You do not have permission for this action (${module}:${action}). If you need access, submit an Access Request for Super Admin review.`,
      403
    );
  }
}

export async function replaceCompanyScopes(employeeId, companyIds) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `DELETE FROM user_company_scopes WHERE employee_id = ?`,
      [employeeId]
    );

    for (const companyId of companyIds) {
      await connection.query(
        `INSERT INTO user_company_scopes (employee_id, company_id)
         VALUES (?, ?)`,
        [employeeId, companyId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertRolePermission(role, module, flags) {
  await pool.query(
    `INSERT INTO role_permissions (
       role, module, can_view, can_create, can_edit, can_approve, can_delete, can_export
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       can_view = VALUES(can_view),
       can_create = VALUES(can_create),
       can_edit = VALUES(can_edit),
       can_approve = VALUES(can_approve),
       can_delete = VALUES(can_delete),
       can_export = VALUES(can_export)`,
    [
      role,
      module,
      flags.can_view ? 1 : 0,
      flags.can_create ? 1 : 0,
      flags.can_edit ? 1 : 0,
      flags.can_approve ? 1 : 0,
      flags.can_delete ? 1 : 0,
      flags.can_export ? 1 : 0
    ]
  );
}

export function companyScopeSql(alias = 'e') {
  return `${alias}.company_id IN (?)`;
}
