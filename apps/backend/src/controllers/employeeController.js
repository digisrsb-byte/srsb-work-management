import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  getCompanyIdsForUser,
  assertCompanyAccess
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';
import { canActivateEmployee } from '../services/activationService.js';
import {
  announceOnboardingStarted,
  createOnboardingCase,
  invitationMessage,
  invitationPayload,
  resolveOnboardingCompanyId
} from '../services/employeeOnboardingService.js';

const allowedEmployeeStatuses = ['ACTIVE', 'INACTIVE', 'RESIGNED'];
const allowedEmployeeRoles = ['ADMIN', 'HR', 'MANAGER', 'RECRUITER', 'EMPLOYEE'];
const SCOPED_ROLES = ['ADMIN', 'HR', 'MANAGER'];

function isOnboardingRequest(body) {
  return body?.onboarding === true || body?.onboarding === 'true';
}

// Add Employee > onboarding mode: the same INACTIVE account + checklist + activation link
// that a Recruitment joiner receives, but with no candidate record behind it.
async function createEmployeeWithOnboarding(req, res) {
  const fullName = String(req.body.fullName || '').trim();
  const role = req.body.role || 'EMPLOYEE';
  const designation = req.body.designation?.trim() || 'New Joiner';
  const departmentId = req.body.departmentId ? Number(req.body.departmentId) : null;

  if (!fullName) throw new AppError('Full name is required.', 400);
  if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
  if (req.user.role !== 'SUPER_ADMIN' && role === 'ADMIN') {
    throw new AppError('Only Head Admin can create an Admin account.', 403);
  }
  if (departmentId) await validateDepartment(departmentId);

  const companyId = await resolveOnboardingCompanyId(req.user, req.body.companyId || null);
  if (!companyId) {
    throw new AppError('No company is available in your access scope for this employee.', 403);
  }

  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();

    result = await createOnboardingCase(connection, {
      person: {
        full_name: fullName,
        email: req.body.email?.trim() || null,
        phone: req.body.phone?.trim() || null
      },
      companyId,
      actorId: req.user.id,
      employeeCode: req.body.employeeId?.trim() || null,
      role,
      designation,
      departmentId,
      dateOfBirth: req.body.dateOfBirth || null,
      joiningDate: req.body.joiningDate || null
    });

    if (SCOPED_ROLES.includes(role)) {
      await connection.query(
        `INSERT IGNORE INTO user_company_scopes (employee_id, company_id) VALUES (?, ?)`,
        [result.employeeId, companyId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new AppError('The selected department does not exist.', 400);
    }
    throw error;
  } finally {
    connection.release();
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'EMPLOYEE_CREATED',
    entityType: 'employees',
    entityId: result.employeeId,
    newValues: { employeeId: result.employeeCode, role, companyId, via: 'ONBOARDING' },
    ipAddress: req.ip
  });

  const invitation = await announceOnboardingStarted({
    result,
    candidateName: fullName,
    companyId,
    actorId: req.user.id,
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: `Employee account ${result.employeeCode} and onboarding case created for ${fullName}.${invitationMessage(invitation, result.employeeCode)}`,
    data: {
      id: result.employeeId,
      onboarding: {
        caseId: result.caseId,
        created: true,
        employeeCode: result.employeeCode,
        isDemo: false,
        invitation: invitationPayload(invitation)
      }
    }
  });
}

async function validateDepartment(departmentId) {
  const id = Number(departmentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Select a valid department.', 400);
  }

  const [[department]] = await pool.query(
    `SELECT id, name
     FROM departments
     WHERE id = ?
       AND name IN ('Technical', 'HR')
     LIMIT 1`,
    [id]
  );

  if (!department) {
    throw new AppError('Department must be Technical or HR.', 400);
  }

  return department;
}

async function validateManager(managerId, employeeId = null) {
  if (!managerId) return null;

  const id = Number(managerId);
  if (!Number.isInteger(id) || id <= 0 || Number(employeeId) === id) {
    throw new AppError('Select a valid reporting manager.', 400);
  }

  const [[manager]] = await pool.query(
    `SELECT id
     FROM employees
     WHERE id = ?
       AND status = 'ACTIVE'
       AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'
     LIMIT 1`,
    [id]
  );

  if (!manager) throw new AppError('Reporting manager was not found.', 400);
  return id;
}

export const getEmployeeFormMeta = asyncHandler(async (_req, res) => {
  const [departments] = await pool.query(
    `SELECT id, name
     FROM departments
     WHERE name IN ('Technical', 'HR')
     ORDER BY FIELD(name, 'Technical', 'HR')`
  );

  const [managers] = await pool.query(
    `SELECT id, employee_id, full_name, designation, role
     FROM employees
     WHERE status = 'ACTIVE'
       AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'
       AND role IN ('SUPER_ADMIN','ADMIN','HR','MANAGER')
     ORDER BY full_name`
  );

  res.json({ success: true, data: { departments, managers } });
});

export const listEmployees = asyncHandler(async (req, res) => {
  const { search, status, role } = req.query;
  const conditions = ["COALESCE(e.account_type, 'EMPLOYEE') = 'EMPLOYEE'"];
  const values = [];

  if (req.user.role === 'ADMIN') conditions.push("e.role <> 'SUPER_ADMIN'");
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    conditions.push("e.role NOT IN ('SUPER_ADMIN','ADMIN')");
  }

  if (!env.demoMode) conditions.push('e.is_demo = 0');

  if (req.user.role !== 'SUPER_ADMIN') {
    const companyIds = await getCompanyIdsForUser(req.user);
    if (companyIds.length) {
      conditions.push('(e.company_id IN (?) OR e.company_id IS NULL)');
      values.push(companyIds);
    } else {
      conditions.push('e.company_id IS NULL');
    }
  }

  if (status) {
    if (!allowedEmployeeStatuses.includes(status)) throw new AppError('Invalid employee status.', 400);
    conditions.push('e.status = ?');
    values.push(status);
  }

  if (role) {
    if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
    conditions.push('e.role = ?');
    values.push(role);
  }

  const keyword = String(search || '').trim().toLowerCase();
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', e.employee_id, e.username, e.full_name, e.email,
      e.phone, e.role, e.designation, d.name, manager.full_name, e.status)) LIKE ?`);
    values.push(`%${keyword}%`);
  }

  const [rows] = await pool.query(
    `SELECT e.id, e.employee_id, e.username, e.full_name, e.email, e.recovery_email,
       e.phone, e.date_of_birth, e.role, e.account_type, e.designation, e.status,
       e.joining_date, e.department_id, e.manager_id, e.password_changed_at,
       e.must_change_password, e.onboarding_status, e.login_status, e.company_id, e.is_demo,
       d.name AS department, manager.full_name AS manager_name, c.name AS company_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees manager ON manager.id = e.manager_id
     LEFT JOIN companies c ON c.id = e.company_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.created_at DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows,
    meta: { count: rows.length, search: keyword || null, status: status || null, role: role || null }
  });
});

export const createEmployee = asyncHandler(async (req, res) => {
  if (isOnboardingRequest(req.body)) {
    return createEmployeeWithOnboarding(req, res);
  }

  const employeeId = req.body.employeeId?.trim() || null;
  const username = req.body.username?.trim() || null;
  const fullName = req.body.fullName?.trim();
  const email = req.body.email?.trim() || null;
  const recoveryEmail = req.body.recoveryEmail?.trim() || null;
  const phone = req.body.phone?.trim() || null;
  const dateOfBirth = req.body.dateOfBirth || null;
  const password = String(req.body.password || '');
  const role = req.body.role || 'EMPLOYEE';
  const designation = req.body.designation?.trim();
  const joiningDate = req.body.joiningDate || null;

  if (!employeeId && !username) throw new AppError('Employee ID or username is required.', 400);
  if (!fullName) throw new AppError('Full name is required.', 400);
  if (!designation) throw new AppError('Designation is required.', 400);
  if (password.length < 8) throw new AppError('Password must contain at least 8 characters.', 400);
  if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
  if (req.user.role !== 'SUPER_ADMIN' && role === 'ADMIN') {
    throw new AppError('Only Head Admin can create an Admin account.', 403);
  }

  const department = await validateDepartment(req.body.departmentId);
  const managerId = await validateManager(req.body.managerId);

  const requestedCompanyId = req.body.companyId ? Number(req.body.companyId) : null;
  if (requestedCompanyId) await assertCompanyAccess(req.user, requestedCompanyId);
  const companyId = requestedCompanyId || (await getCompanyIdsForUser(req.user))[0] || null;

  const [existing] = await pool.query(
    `SELECT id FROM employees
     WHERE (? IS NOT NULL AND employee_id = ?)
        OR (? IS NOT NULL AND username = ?)
        OR (? IS NOT NULL AND email = ?)`,
    [employeeId, employeeId, username, username, email, email]
  );
  if (existing.length) throw new AppError('Employee ID, username or email already exists.', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.query(
    `INSERT INTO employees (
       employee_id, username, full_name, email, recovery_email, phone, date_of_birth,
       password_hash, role, designation, department_id, manager_id, joining_date,
       company_id, status, account_type
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'EMPLOYEE')`,
    [employeeId, username, fullName, email, recoveryEmail, phone, dateOfBirth,
      passwordHash, role, designation, department.id, managerId, joiningDate, companyId]
  );

  if (SCOPED_ROLES.includes(role) && companyId) {
    await pool.query(
      `INSERT IGNORE INTO user_company_scopes (employee_id, company_id) VALUES (?, ?)`,
      [result.insertId, companyId]
    );
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'EMPLOYEE_CREATED',
    entityType: 'employees',
    entityId: result.insertId,
    newValues: { employeeId, username, role, companyId },
    ipAddress: req.ip
  });

  res.status(201).json({ success: true, message: 'Employee created successfully.', data: { id: result.insertId } });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid employee ID.', 400);

  const [[target]] = await pool.query(
    `SELECT id, employee_id, role, status, company_id FROM employees WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!target) throw new AppError('Employee not found.', 404);
  if (target.company_id) await assertCompanyAccess(req.user, target.company_id);

  const role = req.body.role || target.role;
  if (!allowedEmployeeRoles.includes(role)) throw new AppError('Invalid employee role.', 400);
  if (req.user.role !== 'SUPER_ADMIN' && (target.role === 'ADMIN' || role === 'ADMIN')) {
    throw new AppError('Only Head Admin can manage Admin accounts.', 403);
  }

  const designation = req.body.designation?.trim();
  if (!designation) throw new AppError('Designation is required.', 400);
  const department = await validateDepartment(req.body.departmentId);
  const managerId = await validateManager(req.body.managerId, id);
  const status = req.body.status || 'ACTIVE';
  if (!allowedEmployeeStatuses.includes(status)) throw new AppError('Invalid employee status.', 400);

  if (status === 'ACTIVE' && target.status !== 'ACTIVE') {
    const gate = await canActivateEmployee(id);
    if (!gate.allowed && gate.reason === 'INCOMPLETE_DOCUMENTS') {
      throw new AppError(
        `Cannot activate employee. Incomplete onboarding requirements: ${gate.blockers
          .map((b) => b.label)
          .join(', ')}`,
        400,
        { blockers: gate.blockers }
      );
    }
  }

  const companyId = req.body.companyId ? Number(req.body.companyId) : target.company_id;
  if (companyId && companyId !== target.company_id) {
    await assertCompanyAccess(req.user, companyId);
  }

  const [result] = await pool.query(
    `UPDATE employees SET
       full_name = ?, email = ?, recovery_email = ?, username = ?, phone = ?,
       date_of_birth = ?, role = ?, designation = ?, department_id = ?, manager_id = ?,
       joining_date = ?, company_id = ?, status = ?
     WHERE id = ?`,
    [req.body.fullName?.trim(), req.body.email?.trim() || null,
      req.body.recoveryEmail?.trim() || null, req.body.username?.trim() || null,
      req.body.phone?.trim() || null, req.body.dateOfBirth || null, role, designation,
      department.id, managerId, req.body.joiningDate || null, companyId, status, id]
  );

  if (!result.affectedRows) throw new AppError('Employee not found.', 404);

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'EMPLOYEE_UPDATED',
    entityType: 'employees',
    entityId: id,
    oldValues: { role: target.role, status: target.status, company_id: target.company_id },
    newValues: { role, status, company_id: companyId },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Employee updated successfully.' });
});

export const deleteEmployee = asyncHandler(
  async (req, res) => {
    const employeeId = Number(req.params.id);
    const loggedInUserId = Number(req.user.id);

    if (
      !Number.isInteger(employeeId) ||
      employeeId <= 0
    ) {
      throw new AppError(
        'Invalid employee ID.',
        400
      );
    }

    if (employeeId === loggedInUserId) {
      throw new AppError(
        'You cannot delete your own account.',
        400
      );
    }

    const [employees] = await pool.query(
      `SELECT
         id,
         full_name,
         role,
         company_id
       FROM employees
       WHERE id = ?
       LIMIT 1`,
      [employeeId]
    );

    const employee = employees[0];

    if (!employee) {
      throw new AppError(
        'Employee not found.',
        404
      );
    }

    if (employee.company_id) {
      await assertCompanyAccess(req.user, employee.company_id);
    }

    if (
      ['SUPER_ADMIN', 'ADMIN'].includes(employee.role) &&
      req.user.role !== 'SUPER_ADMIN'
    ) {
      throw new AppError(
        'Only Super Admin can delete Admin or Super Admin accounts.',
        403
      );
    }

    await pool.query(
      `DELETE FROM employees
       WHERE id = ?`,
      [employeeId]
    );

    await writeAuditLog({
      employeeId: req.user.id,
      action: 'EMPLOYEE_DELETED',
      entityType: 'employees',
      entityId: employeeId,
      oldValues: { full_name: employee.full_name, role: employee.role },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `${employee.full_name}'s account and related employee data were deleted successfully.`
    });
  }
);
export const listPasswordResetRequests = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       pr.id,
       pr.status,
       pr.requested_at,
       pr.resolved_at,
       e.id AS employee_db_id,
       e.employee_id,
       e.username,
       e.full_name,
       e.email,
       e.recovery_email,
       e.role,
       resolver.full_name AS resolved_by_name
     FROM password_reset_requests pr
     JOIN employees e ON e.id = pr.employee_id
     LEFT JOIN employees resolver ON resolver.id = pr.resolved_by
     ORDER BY
       CASE WHEN pr.status = 'PENDING' THEN 0 ELSE 1 END,
       pr.requested_at DESC`
  );

  res.json({ success: true, data: rows });
});

export const adminResetEmployeePassword = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);
  const newPassword = String(req.body.newPassword || '');

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new AppError('Invalid employee ID.', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('Password must contain at least 8 characters.', 400);
  }

  const [employees] = await pool.query(
    `SELECT id, full_name, role FROM employees WHERE id = ? LIMIT 1`,
    [employeeId]
  );

  const employee = employees[0];
  if (!employee) throw new AppError('Employee not found.', 404);

  if (['SUPER_ADMIN', 'ADMIN'].includes(employee.role) && req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can reset Admin or Super Admin passwords.', 403);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE employees
       SET password_hash = ?, password_changed_at = NOW(), must_change_password = FALSE
       WHERE id = ?`,
      [passwordHash, employeeId]
    );
    await connection.query(
      `UPDATE password_reset_requests
       SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = ?
       WHERE employee_id = ?`,
      [req.user.id, employeeId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json({
    success: true,
    message: `${employee.full_name}'s password was reset successfully.`
  });
});

export const rejectPasswordResetRequest = asyncHandler(async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new AppError('Invalid request ID.', 400);
  }

  const [result] = await pool.query(
    `UPDATE password_reset_requests
     SET status = 'REJECTED', resolved_at = NOW(), resolved_by = ?
     WHERE id = ?`,
    [req.user.id, requestId]
  );

  if (!result.affectedRows) throw new AppError('Request not found.', 404);
  res.json({ success: true, message: 'Password reset request rejected.' });
});
