import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  assertCompanyAccess,
  getCompanyIdsForUser,
  assertPermission
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  createNotification,
  notifyRoleHolders
} from '../services/notificationService.js';
import { isValidAssetCategory } from '../constants/assetCategories.js';

const ASSIGNABLE_STATUSES = ['AVAILABLE'];
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];
const REGISTRATION_STATUSES = ['AVAILABLE', 'REPAIR', 'RETIRED'];
const REPAIR_RECORD_TYPES = ['REPAIR', 'DAMAGE'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayLocal() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function parseDateInput(value, label, { allowFuture = false } = {}) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!DATE_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new AppError(`${label} must be a valid date (YYYY-MM-DD).`, 400);
  }
  if (!allowFuture && text > todayLocal()) {
    throw new AppError(`${label} cannot be in the future.`, 400);
  }
  return text;
}

// Today's date keeps the current time so same-day records stay ordered.
function toStoredDateTime(dateText) {
  if (!dateText || dateText === todayLocal()) return new Date();
  return `${dateText} 00:00:00`;
}

async function resolveCompanyFilter(req, column) {
  const companyIds = await getCompanyIdsForUser(req.user);
  const requested = req.query.companyId ? Number(req.query.companyId) : null;
  const clauses = [];
  const params = [];

  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) return null;
    clauses.push(`${column} IN (?)`);
    params.push(companyIds);
  }
  if (requested) {
    await assertCompanyAccess(req.user, requested);
    clauses.push(`${column} = ?`);
    params.push(requested);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params
  };
}

async function loadEmployeeInScope(user, employeeId) {
  const [emps] = await pool.query(
    `SELECT id, company_id, full_name, employee_id, designation, department_id, status
     FROM employees
     WHERE id = ?
     LIMIT 1`,
    [employeeId]
  );
  if (!emps.length) throw new AppError('Employee not found.', 404);
  await assertCompanyAccess(user, emps[0].company_id);
  return emps[0];
}

async function assertNoActiveAssignment(connection, asset) {
  const [active] = await connection.query(
    `SELECT aa.id, e.full_name
     FROM asset_assignments aa
     LEFT JOIN employees e ON e.id = aa.employee_id
     WHERE aa.asset_id = ? AND aa.status = 'ACTIVE'
     LIMIT 1`,
    [asset.id]
  );
  const [locks] = await connection.query(
    `SELECT asset_id FROM asset_active_assignments WHERE asset_id = ? LIMIT 1`,
    [asset.id]
  );
  if (active.length || locks.length) {
    const holder = active[0]?.full_name ? ` to ${active[0].full_name}` : '';
    throw new AppError(
      `Asset ${asset.asset_tag} is already assigned${holder}. Return or transfer it first.`,
      409
    );
  }
}

async function countOpenRepairs(connection, assetId, excludeServiceId = null) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM asset_service_records
     WHERE asset_id = ?
       AND status <> 'CLOSED'
       AND record_type IN (?)
       ${excludeServiceId ? 'AND id <> ?' : ''}`,
    excludeServiceId
      ? [assetId, REPAIR_RECORD_TYPES, excludeServiceId]
      : [assetId, REPAIR_RECORD_TYPES]
  );
  return Number(row.total || 0);
}

export const getAssetSummary = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'view');
  const scope = await resolveCompanyFilter(req, 'a.company_id');
  if (!scope) {
    return res.json({
      success: true,
      data: {
        totals: { total: 0, available: 0, assigned: 0, underRepair: 0, lost: 0, retired: 0 },
        employeesWithAssets: 0,
        openRepairs: 0,
        byCategory: []
      }
    });
  }

  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(a.status = 'AVAILABLE'), 0) AS available,
       COALESCE(SUM(a.status = 'ASSIGNED'), 0) AS assigned,
       COALESCE(SUM(a.status = 'REPAIR'), 0) AS under_repair,
       COALESCE(SUM(a.status = 'LOST'), 0) AS lost,
       COALESCE(SUM(a.status = 'RETIRED'), 0) AS retired
     FROM assets a
     WHERE 1=1 ${scope.sql}`,
    scope.params
  );

  const [byCategory] = await pool.query(
    `SELECT
       a.category,
       COUNT(*) AS total,
       COALESCE(SUM(a.status = 'AVAILABLE'), 0) AS available,
       COALESCE(SUM(a.status = 'ASSIGNED'), 0) AS assigned,
       COALESCE(SUM(a.status = 'REPAIR'), 0) AS under_repair
     FROM assets a
     WHERE 1=1 ${scope.sql}
     GROUP BY a.category
     ORDER BY total DESC, a.category`,
    scope.params
  );

  const [[holders]] = await pool.query(
    `SELECT COUNT(DISTINCT aa.employee_id) AS total
     FROM asset_assignments aa
     INNER JOIN assets a ON a.id = aa.asset_id
     WHERE aa.status = 'ACTIVE' ${scope.sql}`,
    scope.params
  );

  const [[repairs]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM asset_service_records s
     INNER JOIN assets a ON a.id = s.asset_id
     WHERE s.status <> 'CLOSED'
       AND s.record_type IN (?) ${scope.sql}`,
    [REPAIR_RECORD_TYPES, ...scope.params]
  );

  res.json({
    success: true,
    data: {
      totals: {
        total: Number(totals.total || 0),
        available: Number(totals.available || 0),
        assigned: Number(totals.assigned || 0),
        underRepair: Number(totals.under_repair || 0),
        lost: Number(totals.lost || 0),
        retired: Number(totals.retired || 0)
      },
      employeesWithAssets: Number(holders.total || 0),
      openRepairs: Number(repairs.total || 0),
      byCategory: byCategory.map((row) => ({
        category: row.category,
        total: Number(row.total || 0),
        available: Number(row.available || 0),
        assigned: Number(row.assigned || 0),
        underRepair: Number(row.under_repair || 0)
      }))
    }
  });
});

export const listAssets = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'view');
  const scope = await resolveCompanyFilter(req, 'a.company_id');
  if (!scope) return res.json({ success: true, data: [] });

  const category = req.query.category || null;
  const status = req.query.status || null;
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
  const search = String(req.query.search || '').trim();

  let sql = `
    SELECT
      a.*,
      c.name AS company_name,
      aa.id AS active_assignment_id,
      aa.assigned_at,
      aa.expected_return_date,
      e.id AS assigned_employee_id,
      e.full_name AS assigned_to,
      e.employee_id AS assigned_employee_code,
      (
        SELECT COUNT(*) FROM asset_service_records s
        WHERE s.asset_id = a.id
          AND s.status <> 'CLOSED'
          AND s.record_type IN ('REPAIR', 'DAMAGE')
      ) AS open_repairs
    FROM assets a
    INNER JOIN companies c ON c.id = a.company_id
    LEFT JOIN asset_assignments aa
      ON aa.asset_id = a.id AND aa.status = 'ACTIVE'
    LEFT JOIN employees e ON e.id = aa.employee_id
    WHERE 1=1 ${scope.sql}
  `;
  const params = [...scope.params];

  if (category) {
    sql += ' AND a.category = ?';
    params.push(category);
  }
  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  if (employeeId) {
    sql += ' AND e.id = ?';
    params.push(employeeId);
  }
  if (search) {
    sql += ` AND (
      a.asset_tag LIKE ?
      OR a.asset_name LIKE ?
      OR a.category LIKE ?
      OR a.serial_number LIKE ?
      OR a.make LIKE ?
      OR a.model LIKE ?
      OR e.full_name LIKE ?
      OR e.employee_id LIKE ?
    )`;
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like, like);
  }

  sql += ' ORDER BY a.created_at DESC, a.id DESC';

  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

export const createAsset = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'create');
  const {
    companyId,
    category,
    assetTag,
    assetName,
    serialNumber,
    make,
    model,
    purchaseDate,
    purchaseCost,
    warrantyExpiry,
    conditionLabel = 'GOOD',
    location,
    notes,
    status = 'AVAILABLE'
  } = req.body;

  await assertCompanyAccess(req.user, Number(companyId));
  if (!category || !assetTag) {
    throw new AppError('Category and asset tag are required.', 400);
  }

  const normalizedCategory = String(category).trim();
  if (!isValidAssetCategory(normalizedCategory)) {
    throw new AppError('Invalid asset category.', 400);
  }

  const normalizedCondition = String(conditionLabel || 'GOOD').toUpperCase();
  if (!CONDITIONS.includes(normalizedCondition)) {
    throw new AppError('Invalid asset condition.', 400);
  }

  const initialStatus = String(status || 'AVAILABLE').toUpperCase();
  if (!REGISTRATION_STATUSES.includes(initialStatus)) {
    throw new AppError(
      'New assets can be registered as Available, Under Repair or Retired only. Use Assign Assets to issue an item.',
      400
    );
  }
  if (initialStatus === 'AVAILABLE' && normalizedCondition === 'DAMAGED') {
    throw new AppError(
      'Damaged items cannot be registered as Available. Choose Under Repair or Retired.',
      400
    );
  }

  const parsedPurchaseDate = parseDateInput(purchaseDate, 'Purchase date');
  const parsedWarranty = parseDateInput(warrantyExpiry, 'Warranty expiry', {
    allowFuture: true
  });
  const cost =
    purchaseCost === '' || purchaseCost == null ? null : Number(purchaseCost);
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
    throw new AppError('Purchase cost must be a positive number.', 400);
  }

  const tag = String(assetTag).trim();
  const displayName =
    String(assetName || '').trim() ||
    [make, model].filter(Boolean).join(' ').trim() ||
    tag;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO assets (
         company_id, category, asset_tag, asset_name, serial_number, make, model,
         purchase_date, purchase_cost, warranty_expiry, condition_label, location,
         status, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        normalizedCategory,
        tag,
        displayName,
        String(serialNumber || '').trim() || null,
        String(make || '').trim() || null,
        String(model || '').trim() || null,
        parsedPurchaseDate,
        cost,
        parsedWarranty,
        normalizedCondition,
        String(location || '').trim() || null,
        initialStatus,
        String(notes || '').trim() || null,
        req.user.id
      ]
    );

    if (initialStatus === 'REPAIR') {
      await connection.query(
        `INSERT INTO asset_service_records (
           asset_id, record_type, description, issue_date, reported_by, status
         ) VALUES (?, 'REPAIR', ?, ?, ?, 'OPEN')`,
        [
          result.insertId,
          String(notes || '').trim() || 'Registered as under repair',
          todayLocal(),
          req.user.id
        ]
      );
    }

    await connection.commit();

    await writeAuditLog({
      employeeId: req.user.id,
      action: 'ASSET_CREATED',
      entityType: 'assets',
      entityId: result.insertId,
      newValues: {
        assetTag: tag,
        category: normalizedCategory,
        assetName: displayName,
        status: initialStatus
      },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: `Asset ${tag} registered.`,
      data: { id: result.insertId }
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        `Asset tag ${tag} already exists for this company. Each physical item needs a unique tag.`,
        409
      );
    }
    throw error;
  } finally {
    connection.release();
  }
});

export const getAsset = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'view');
  const assetId = Number(req.params.assetId);
  const [assets] = await pool.query(
    `SELECT a.*, c.name AS company_name
     FROM assets a
     INNER JOIN companies c ON c.id = a.company_id
     WHERE a.id = ? LIMIT 1`,
    [assetId]
  );
  if (!assets.length) throw new AppError('Asset not found.', 404);
  await assertCompanyAccess(req.user, assets[0].company_id);

  const [assignments] = await pool.query(
    `SELECT
       aa.*,
       e.full_name,
       e.employee_id AS emp_code,
       e.designation,
       assigner.full_name AS assigned_by_name
     FROM asset_assignments aa
     INNER JOIN employees e ON e.id = aa.employee_id
     LEFT JOIN employees assigner ON assigner.id = aa.assigned_by
     WHERE aa.asset_id = ?
     ORDER BY aa.id DESC`,
    [assetId]
  );

  const [services] = await pool.query(
    `SELECT
       s.*,
       reporter.full_name AS reported_by_name,
       resolver.full_name AS resolved_by_name
     FROM asset_service_records s
     LEFT JOIN employees reporter ON reporter.id = s.reported_by
     LEFT JOIN employees resolver ON resolver.id = s.resolved_by
     WHERE s.asset_id = ?
     ORDER BY s.id DESC`,
    [assetId]
  );

  const current = assignments.find((row) => row.status === 'ACTIVE') || null;

  res.json({
    success: true,
    data: { asset: assets[0], currentAssignment: current, assignments, services }
  });
});

async function createAssignmentRecords({
  connection,
  user,
  assets,
  employee,
  assignedAt,
  expectedReturnDate,
  remarks
}) {
  const created = [];

  for (const asset of assets) {
    if (!ASSIGNABLE_STATUSES.includes(asset.status)) {
      const label =
        asset.status === 'REPAIR' ? 'UNDER REPAIR' : asset.status;
      throw new AppError(
        `Asset ${asset.asset_tag} is not available for assignment (status: ${label}).`,
        409
      );
    }
    if (Number(asset.company_id) !== Number(employee.company_id)) {
      throw new AppError(
        `Asset ${asset.asset_tag} belongs to a different company than the employee.`,
        400
      );
    }

    await assertNoActiveAssignment(connection, asset);

    const [result] = await connection.query(
      `INSERT INTO asset_assignments (
         asset_id, employee_id, assigned_by, assigned_at,
         expected_return_date, remarks, condition_at_assignment, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        asset.id,
        employee.id,
        user.id,
        toStoredDateTime(assignedAt),
        expectedReturnDate || null,
        remarks || null,
        asset.condition_label
      ]
    );

    await connection.query(
      `INSERT INTO asset_active_assignments (asset_id, assignment_id, employee_id)
       VALUES (?, ?, ?)`,
      [asset.id, result.insertId, employee.id]
    );

    await connection.query(
      `UPDATE assets SET status = 'ASSIGNED' WHERE id = ?`,
      [asset.id]
    );

    created.push({
      assetId: asset.id,
      assetTag: asset.asset_tag,
      assetName: asset.asset_name,
      assignmentId: result.insertId
    });
  }

  return created;
}

function readAssignmentDates(body) {
  const assignedAt = parseDateInput(body.assignedAt, 'Issue date') || todayLocal();
  const expectedReturnDate = parseDateInput(
    body.expectedReturnDate,
    'Expected return date',
    { allowFuture: true }
  );
  if (expectedReturnDate && expectedReturnDate < assignedAt) {
    throw new AppError('Expected return date cannot be before the issue date.', 400);
  }
  return { assignedAt, expectedReturnDate };
}

export const assignAsset = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'edit');
  const assetId = Number(req.params.assetId);
  const employeeId = Number(req.body.employeeId);
  const { assignedAt, expectedReturnDate } = readAssignmentDates(req.body);
  const remarks = String(req.body.remarks || '').trim() || null;

  const employee = await loadEmployeeInScope(req.user, employeeId);
  if (employee.status !== 'ACTIVE') {
    throw new AppError('Cannot assign assets to an inactive employee.', 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [assets] = await connection.query(
      `SELECT * FROM assets WHERE id = ? LIMIT 1 FOR UPDATE`,
      [assetId]
    );
    if (!assets.length) throw new AppError('Asset not found.', 404);
    await assertCompanyAccess(req.user, assets[0].company_id);

    const created = await createAssignmentRecords({
      connection,
      user: req.user,
      assets,
      employee,
      assignedAt,
      expectedReturnDate,
      remarks
    });

    await connection.commit();

    await createNotification({
      recipientId: employeeId,
      actorId: req.user.id,
      type: 'ASSET_ASSIGNED',
      title: 'Asset assigned',
      message: `Asset ${assets[0].asset_tag} has been assigned to you. Please acknowledge.`,
      referenceType: 'ASSET',
      referenceId: assetId
    });

    await writeAuditLog({
      employeeId: req.user.id,
      action: 'ASSET_ASSIGNED',
      entityType: 'asset_assignments',
      entityId: created[0].assignmentId,
      newValues: { assetId, employeeId },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: `Asset ${assets[0].asset_tag} assigned to ${employee.full_name}.`,
      data: created[0]
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        'Asset already has an active assignment. Return or transfer it first.',
        409
      );
    }
    throw error;
  } finally {
    connection.release();
  }
});

export const assignAssetsBulk = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'edit');

  const assetIds = Array.isArray(req.body.assetIds)
    ? [...new Set(req.body.assetIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
    : [];
  const employeeId = Number(req.body.employeeId);
  const { assignedAt, expectedReturnDate } = readAssignmentDates(req.body);
  const remarks = String(req.body.remarks || '').trim() || null;

  if (!assetIds.length) {
    throw new AppError('Select at least one asset to assign.', 400);
  }
  if (!employeeId) {
    throw new AppError('Employee is required.', 400);
  }

  const employee = await loadEmployeeInScope(req.user, employeeId);
  if (employee.status !== 'ACTIVE') {
    throw new AppError('Cannot assign assets to an inactive employee.', 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [assets] = await connection.query(
      `SELECT * FROM assets WHERE id IN (?) ORDER BY id FOR UPDATE`,
      [assetIds]
    );

    if (assets.length !== assetIds.length) {
      throw new AppError('One or more selected assets were not found.', 404);
    }

    for (const asset of assets) {
      await assertCompanyAccess(req.user, asset.company_id);
    }

    const created = await createAssignmentRecords({
      connection,
      user: req.user,
      assets,
      employee,
      assignedAt,
      expectedReturnDate,
      remarks
    });

    await connection.commit();

    await createNotification({
      recipientId: employeeId,
      actorId: req.user.id,
      type: 'ASSET_ASSIGNED',
      title: created.length === 1 ? 'Asset assigned' : 'Assets assigned',
      message: `${created.length} item${created.length === 1 ? '' : 's'} assigned to you: ${created
        .map((c) => c.assetTag)
        .join(', ')}. Please acknowledge in My Assets.`,
      referenceType: 'ASSET',
      referenceId: created[0]?.assetId || null
    });

    await writeAuditLog({
      employeeId: req.user.id,
      action: 'ASSETS_BULK_ASSIGNED',
      entityType: 'asset_assignments',
      entityId: created[0]?.assignmentId || null,
      newValues: {
        employeeId,
        assetIds: created.map((c) => c.assetId),
        count: created.length,
        assignedAt
      },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: `${created.length} item${created.length === 1 ? '' : 's'} assigned to ${employee.full_name}.`,
      data: {
        employee: {
          id: employee.id,
          fullName: employee.full_name,
          employeeId: employee.employee_id
        },
        assignedAt,
        assignments: created
      }
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        'One or more assets already have an active assignment.',
        409
      );
    }
    throw error;
  } finally {
    connection.release();
  }
});

export const acknowledgeAsset = asyncHandler(async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const [rows] = await pool.query(
    `SELECT aa.*, a.asset_tag
     FROM asset_assignments aa
     INNER JOIN assets a ON a.id = aa.asset_id
     WHERE aa.id = ? LIMIT 1`,
    [assignmentId]
  );
  if (!rows.length) throw new AppError('Assignment not found.', 404);
  if (Number(rows[0].employee_id) !== Number(req.user.id)) {
    throw new AppError('Only the assigned employee can acknowledge.', 403);
  }

  await pool.query(
    `INSERT INTO asset_acknowledgements (assignment_id, employee_id, notes)
     VALUES (?, ?, ?)`,
    [assignmentId, req.user.id, req.body.notes || null]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ASSET_ACKNOWLEDGED',
    entityType: 'asset_assignments',
    entityId: assignmentId,
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Asset acknowledged.' });
});

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  ASSIGNED: 'Assigned',
  REPAIR: 'Under Repair',
  LOST: 'Lost',
  RETIRED: 'Retired'
};

export const returnAsset = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'edit');
  const assetId = Number(req.params.assetId);
  const expectedEmployeeId = req.body.employeeId ? Number(req.body.employeeId) : null;
  const legacyStatus = String(req.body.returnStatus || '').toUpperCase();
  const conditionLabel = String(req.body.conditionLabel || '').toUpperCase() || null;
  const remarks = String(req.body.remarks || '').trim() || null;
  const issueDescription =
    String(req.body.issueDescription || '').trim() || remarks;

  let outcome = String(req.body.outcome || '').toUpperCase();
  if (!outcome) {
    if (legacyStatus === 'PENDING') {
      throw new AppError('Cannot close assignment while return status is PENDING.', 400);
    }
    outcome =
      legacyStatus === 'LOST'
        ? 'LOST'
        : legacyStatus === 'DAMAGED'
          ? 'REPAIR'
          : 'AVAILABLE';
  }

  if (!['AVAILABLE', 'REPAIR', 'LOST'].includes(outcome)) {
    throw new AppError('Invalid return outcome.', 400);
  }
  if (conditionLabel && !CONDITIONS.includes(conditionLabel)) {
    throw new AppError('Invalid return condition.', 400);
  }
  if (outcome !== 'LOST' && !conditionLabel) {
    throw new AppError('Select the condition the item was returned in.', 400);
  }
  if (outcome === 'AVAILABLE' && conditionLabel === 'DAMAGED') {
    throw new AppError(
      'A damaged item cannot be made available. Choose "Send to repair" instead.',
      400
    );
  }
  if (outcome === 'REPAIR' && !issueDescription) {
    throw new AppError('Describe the damage or issue before sending the item to repair.', 400);
  }

  const returnDate = parseDateInput(req.body.returnDate, 'Return date') || todayLocal();

  const connection = await pool.getConnection();
  let asset;
  let assignment;
  let newStatus;
  try {
    await connection.beginTransaction();

    const [assets] = await connection.query(
      `SELECT * FROM assets WHERE id = ? LIMIT 1 FOR UPDATE`,
      [assetId]
    );
    if (!assets.length) throw new AppError('Asset not found.', 404);
    asset = assets[0];
    await assertCompanyAccess(req.user, asset.company_id);

    const [assignments] = await connection.query(
      `SELECT aa.*, e.full_name
       FROM asset_assignments aa
       INNER JOIN employees e ON e.id = aa.employee_id
       WHERE aa.asset_id = ? AND aa.status = 'ACTIVE'
       ORDER BY aa.id DESC
       LIMIT 1
       FOR UPDATE`,
      [assetId]
    );
    if (!assignments.length) {
      throw new AppError(
        `Asset ${asset.asset_tag} is not currently assigned to anyone, so there is nothing to return.`,
        409
      );
    }
    assignment = assignments[0];

    if (expectedEmployeeId && Number(assignment.employee_id) !== expectedEmployeeId) {
      throw new AppError(
        `Asset ${asset.asset_tag} is no longer assigned to the selected employee. Refresh and try again.`,
        409
      );
    }
    if (returnDate < toDateOnly(assignment.assigned_at)) {
      throw new AppError('Return date cannot be before the issue date.', 400);
    }

    const returnStatus =
      outcome === 'LOST' ? 'LOST' : outcome === 'REPAIR' ? 'DAMAGED' : 'RETURNED';

    await connection.query(
      `UPDATE asset_assignments
       SET status = ?,
           returned_at = ?,
           return_condition = ?,
           return_status = ?,
           return_remarks = ?
       WHERE id = ?`,
      [
        outcome === 'LOST' ? 'LOST' : 'RETURNED',
        toStoredDateTime(returnDate),
        conditionLabel,
        returnStatus,
        remarks,
        assignment.id
      ]
    );

    await connection.query(
      `DELETE FROM asset_active_assignments WHERE asset_id = ?`,
      [assetId]
    );

    await connection.query(
      `INSERT INTO asset_returns (
         assignment_id, asset_id, employee_id, return_status, condition_label,
         return_date, remarks, recorded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignment.id,
        assetId,
        assignment.employee_id,
        returnStatus,
        conditionLabel,
        returnDate,
        remarks,
        req.user.id
      ]
    );

    if (outcome === 'REPAIR') {
      await connection.query(
        `INSERT INTO asset_service_records (
           asset_id, assignment_id, record_type, description, issue_date, reported_by, status
         ) VALUES (?, ?, 'DAMAGE', ?, ?, ?, 'OPEN')`,
        [assetId, assignment.id, issueDescription, returnDate, req.user.id]
      );
    }

    const openRepairs = await countOpenRepairs(connection, assetId);
    newStatus =
      outcome === 'LOST' ? 'LOST' : openRepairs > 0 ? 'REPAIR' : 'AVAILABLE';

    await connection.query(
      `UPDATE assets SET status = ?, condition_label = COALESCE(?, condition_label) WHERE id = ?`,
      [newStatus, conditionLabel, assetId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ASSET_RETURNED',
    entityType: 'assets',
    entityId: assetId,
    newValues: {
      assignmentId: assignment.id,
      employeeId: assignment.employee_id,
      outcome,
      conditionLabel,
      returnDate,
      assetStatus: newStatus
    },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `${asset.asset_tag} return from ${assignment.full_name} recorded. Item is now ${STATUS_LABELS[newStatus]}.`,
    data: { assetId, assignmentId: assignment.id, assetStatus: newStatus }
  });
});

export const transferAsset = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'edit');
  const assetId = Number(req.params.assetId);
  const toEmployeeId = Number(req.body.employeeId);
  const reason = String(req.body.reason || req.body.remarks || '').trim();

  const toEmployee = await loadEmployeeInScope(req.user, toEmployeeId);
  if (toEmployee.status !== 'ACTIVE') {
    throw new AppError('Cannot transfer assets to an inactive employee.', 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [assets] = await connection.query(
      `SELECT * FROM assets WHERE id = ? LIMIT 1 FOR UPDATE`,
      [assetId]
    );
    if (!assets.length) throw new AppError('Asset not found.', 404);
    await assertCompanyAccess(req.user, assets[0].company_id);

    if (assets[0].status === 'RETIRED') {
      throw new AppError('Retired assets cannot be transferred.', 400);
    }
    if (assets[0].status === 'REPAIR') {
      throw new AppError('Assets under repair cannot be transferred until repaired.', 400);
    }
    if (assets[0].status === 'LOST') {
      throw new AppError('Lost assets cannot be transferred.', 400);
    }
    if (Number(assets[0].company_id) !== Number(toEmployee.company_id)) {
      throw new AppError('Employee must belong to the same company as the asset.', 400);
    }

    const [active] = await connection.query(
      `SELECT aa.*, e.full_name
       FROM asset_assignments aa
       INNER JOIN employees e ON e.id = aa.employee_id
       WHERE aa.asset_id = ? AND aa.status = 'ACTIVE'
       ORDER BY aa.id DESC LIMIT 1
       FOR UPDATE`,
      [assetId]
    );

    if (!active.length) {
      throw new AppError('No active assignment to transfer. Use Assign Assets instead.', 400);
    }

    if (Number(active[0].employee_id) === Number(toEmployeeId)) {
      throw new AppError('Asset is already assigned to this employee.', 400);
    }

    await connection.query(
      `UPDATE asset_assignments
       SET status = 'TRANSFERRED',
           returned_at = NOW(),
           return_status = 'RETURNED',
           return_condition = ?,
           return_remarks = ?
       WHERE id = ?`,
      [assets[0].condition_label, reason || 'Transferred', active[0].id]
    );

    await connection.query(
      `DELETE FROM asset_active_assignments WHERE asset_id = ?`,
      [assetId]
    );

    await connection.query(
      `INSERT INTO asset_service_records (
         asset_id, assignment_id, record_type, description, issue_date, reported_by, status, resolved_at
       ) VALUES (?, ?, 'TRANSFER', ?, ?, ?, 'CLOSED', NOW())`,
      [
        assetId,
        active[0].id,
        `Transferred from ${active[0].full_name} to ${toEmployee.full_name}${
          reason ? `: ${reason}` : ''
        }`,
        todayLocal(),
        req.user.id
      ]
    );

    const [result] = await connection.query(
      `INSERT INTO asset_assignments (
         asset_id, employee_id, assigned_by, condition_at_assignment, remarks, status
       ) VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        assetId,
        toEmployeeId,
        req.user.id,
        assets[0].condition_label,
        reason || null
      ]
    );

    await connection.query(
      `INSERT INTO asset_active_assignments (asset_id, assignment_id, employee_id)
       VALUES (?, ?, ?)`,
      [assetId, result.insertId, toEmployeeId]
    );

    await connection.query(
      `UPDATE assets SET status = 'ASSIGNED' WHERE id = ?`,
      [assetId]
    );

    await connection.commit();

    await createNotification({
      recipientId: toEmployeeId,
      actorId: req.user.id,
      type: 'ASSET_ASSIGNED',
      title: 'Asset transferred to you',
      message: `Asset ${assets[0].asset_tag} was transferred to you.`,
      referenceType: 'ASSET',
      referenceId: assetId
    });

    await writeAuditLog({
      employeeId: req.user.id,
      action: 'ASSET_TRANSFERRED',
      entityType: 'assets',
      entityId: assetId,
      newValues: {
        fromEmployeeId: active[0].employee_id,
        toEmployeeId,
        reason
      },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `${assets[0].asset_tag} transferred from ${active[0].full_name} to ${toEmployee.full_name}.`,
      data: { assignmentId: result.insertId }
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        'Cannot create duplicate active assignment during transfer.',
        409
      );
    }
    throw error;
  } finally {
    connection.release();
  }
});

export const createServiceRecord = asyncHandler(async (req, res) => {
  const assetId = Number(req.params.assetId);
  const recordType = String(req.body.recordType || '').toUpperCase();
  const description = String(req.body.description || '').trim();

  if (!['REPAIR', 'REPLACEMENT', 'DAMAGE', 'LOSS'].includes(recordType)) {
    throw new AppError('Invalid service record type.', 400);
  }
  if (!description) throw new AppError('Describe the issue.', 400);
  const issueDate = parseDateInput(req.body.issueDate, 'Issue date') || todayLocal();

  const [assets] = await pool.query(
    `SELECT * FROM assets WHERE id = ? LIMIT 1`,
    [assetId]
  );
  if (!assets.length) throw new AppError('Asset not found.', 404);

  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(req.user.role);
  if (isAdmin) {
    await assertPermission(req.user, 'assets', 'edit');
    await assertCompanyAccess(req.user, assets[0].company_id);
  }

  if (['RETIRED', 'LOST'].includes(assets[0].status)) {
    throw new AppError(
      `Asset ${assets[0].asset_tag} is ${STATUS_LABELS[assets[0].status]} and cannot be sent for service.`,
      400
    );
  }

  const [active] = await pool.query(
    `SELECT id, employee_id FROM asset_assignments
     WHERE asset_id = ? AND status = 'ACTIVE'
     ORDER BY id DESC LIMIT 1`,
    [assetId]
  );

  if (!isAdmin) {
    if (!active.length || Number(active[0].employee_id) !== Number(req.user.id)) {
      throw new AppError('You can only report on your assigned assets.', 403);
    }
  }

  const [result] = await pool.query(
    `INSERT INTO asset_service_records (
       asset_id, assignment_id, record_type, description, issue_date, reported_by, status
     ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`,
    [assetId, active[0]?.id || null, recordType, description, issueDate, req.user.id]
  );

  if (REPAIR_RECORD_TYPES.includes(recordType)) {
    await pool.query(
      `UPDATE assets SET status = 'REPAIR' WHERE id = ?`,
      [assetId]
    );
  }
  if (recordType === 'LOSS') {
    await pool.query(
      `UPDATE assets SET status = 'LOST' WHERE id = ?`,
      [assetId]
    );
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ASSET_SERVICE_REPORTED',
    entityType: 'asset_service_records',
    entityId: result.insertId,
    newValues: { assetId, recordType, issueDate },
    ipAddress: req.ip
  });

  await notifyRoleHolders({
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR'],
    actorId: req.user.id,
    companyId: assets[0].company_id,
    type: 'ASSET_SERVICE_REQUEST',
    title: `Asset ${recordType.toLowerCase()} request`,
    message: `${assets[0].asset_tag}: ${description}`,
    referenceType: 'ASSET',
    referenceId: assetId
  });

  res.status(201).json({
    success: true,
    message: REPAIR_RECORD_TYPES.includes(recordType)
      ? `${assets[0].asset_tag} marked Under Repair. It cannot be assigned until the repair is completed.`
      : 'Service record created.',
    data: { id: result.insertId }
  });
});

export const resolveServiceRecord = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'edit');
  const assetId = Number(req.params.assetId);
  const serviceId = Number(req.params.serviceId);
  const notes = String(req.body.notes || '').trim() || null;
  let outcome = String(req.body.outcome || '').toUpperCase();
  if (!outcome) outcome = req.body.markAvailable === false ? 'CLOSED' : 'REPAIRED';
  if (!['REPAIRED', 'NOT_REPAIRABLE', 'CLOSED'].includes(outcome)) {
    throw new AppError('Invalid repair outcome.', 400);
  }
  const conditionLabel = String(req.body.conditionLabel || 'GOOD').toUpperCase();
  if (outcome === 'REPAIRED') {
    if (!CONDITIONS.includes(conditionLabel)) {
      throw new AppError('Invalid condition after repair.', 400);
    }
    if (conditionLabel === 'DAMAGED') {
      throw new AppError(
        'An item still in damaged condition is not repaired. Keep the repair open or mark it not repairable.',
        400
      );
    }
  }
  const resolvedDate = parseDateInput(req.body.resolvedDate, 'Completion date') || todayLocal();

  const connection = await pool.getConnection();
  let asset;
  let newStatus;
  try {
    await connection.beginTransaction();

    const [assets] = await connection.query(
      `SELECT * FROM assets WHERE id = ? LIMIT 1 FOR UPDATE`,
      [assetId]
    );
    if (!assets.length) throw new AppError('Asset not found.', 404);
    asset = assets[0];
    await assertCompanyAccess(req.user, asset.company_id);

    const [services] = await connection.query(
      `SELECT * FROM asset_service_records WHERE id = ? AND asset_id = ? LIMIT 1 FOR UPDATE`,
      [serviceId, assetId]
    );
    if (!services.length) throw new AppError('Service record not found.', 404);
    const service = services[0];
    if (service.status === 'CLOSED') {
      throw new AppError('This repair record is already closed.', 409);
    }
    if (service.issue_date && resolvedDate < toDateOnly(service.issue_date)) {
      throw new AppError('Completion date cannot be before the issue date.', 400);
    }

    const [active] = await connection.query(
      `SELECT aa.id, e.full_name
       FROM asset_assignments aa
       INNER JOIN employees e ON e.id = aa.employee_id
       WHERE aa.asset_id = ? AND aa.status = 'ACTIVE'
       LIMIT 1`,
      [assetId]
    );

    const isRepairRecord = REPAIR_RECORD_TYPES.includes(service.record_type);
    if (isRepairRecord && outcome === 'NOT_REPAIRABLE' && active.length) {
      throw new AppError(
        `Record the return of ${asset.asset_tag} from ${active[0].full_name} before marking it not repairable.`,
        400
      );
    }

    await connection.query(
      `UPDATE asset_service_records
       SET status = 'CLOSED',
           outcome = ?,
           resolution_notes = ?,
           resolved_by = ?,
           resolved_at = ?
       WHERE id = ?`,
      [outcome, notes, req.user.id, toStoredDateTime(resolvedDate), serviceId]
    );

    newStatus = asset.status;
    if (isRepairRecord && asset.status === 'REPAIR') {
      if (outcome === 'NOT_REPAIRABLE') {
        newStatus = 'RETIRED';
      } else if (outcome === 'REPAIRED') {
        const remaining = await countOpenRepairs(connection, assetId, serviceId);
        if (remaining === 0) newStatus = active.length ? 'ASSIGNED' : 'AVAILABLE';
      }
    }

    await connection.query(
      `UPDATE assets
       SET status = ?,
           condition_label = CASE WHEN ? THEN ? ELSE condition_label END
       WHERE id = ?`,
      [newStatus, isRepairRecord && outcome === 'REPAIRED', conditionLabel, assetId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ASSET_SERVICE_RESOLVED',
    entityType: 'asset_service_records',
    entityId: serviceId,
    newValues: { assetId, outcome, resolvedDate, assetStatus: newStatus },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `Repair record closed. ${asset.asset_tag} is now ${STATUS_LABELS[newStatus]}.`,
    data: { assetStatus: newStatus }
  });
});

export const listRepairs = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'view');
  const scope = await resolveCompanyFilter(req, 'a.company_id');
  if (!scope) return res.json({ success: true, data: [] });

  const state = String(req.query.state || 'open').toLowerCase();
  const stateSql =
    state === 'closed'
      ? `AND s.status = 'CLOSED'`
      : state === 'all'
        ? ''
        : `AND s.status <> 'CLOSED'`;

  const [rows] = await pool.query(
    `SELECT
       s.*,
       a.asset_tag,
       a.asset_name,
       a.category,
       a.make,
       a.model,
       a.serial_number,
       a.status AS asset_status,
       a.company_id,
       holder.id AS assigned_employee_id,
       holder.full_name AS assigned_to,
       holder.employee_id AS assigned_employee_code,
       reporter.full_name AS reported_by_name,
       resolver.full_name AS resolved_by_name
     FROM asset_service_records s
     INNER JOIN assets a ON a.id = s.asset_id
     LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.status = 'ACTIVE'
     LEFT JOIN employees holder ON holder.id = aa.employee_id
     LEFT JOIN employees reporter ON reporter.id = s.reported_by
     LEFT JOIN employees resolver ON resolver.id = s.resolved_by
     WHERE s.record_type <> 'TRANSFER'
       ${stateSql}
       ${scope.sql}
     ORDER BY s.status <> 'CLOSED' DESC, s.id DESC
     LIMIT 200`,
    scope.params
  );

  res.json({ success: true, data: rows });
});

export const retireAsset = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'edit');
  const assetId = Number(req.params.assetId);
  const reason = String(req.body.reason || '').trim();

  const [assets] = await pool.query(
    `SELECT * FROM assets WHERE id = ? LIMIT 1`,
    [assetId]
  );
  if (!assets.length) throw new AppError('Asset not found.', 404);
  await assertCompanyAccess(req.user, assets[0].company_id);

  if (assets[0].status === 'RETIRED') {
    throw new AppError('Asset is already retired.', 400);
  }

  const [active] = await pool.query(
    `SELECT id FROM asset_assignments WHERE asset_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [assetId]
  );
  if (active.length) {
    throw new AppError('Return or transfer the asset before retiring it.', 400);
  }

  await pool.query(
    `UPDATE assets SET status = 'RETIRED', notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?`,
    [reason ? `\nRetired: ${reason}` : '\nRetired', assetId]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ASSET_RETIRED',
    entityType: 'assets',
    entityId: assetId,
    newValues: { reason },
    ipAddress: req.ip
  });

  res.json({ success: true, message: `${assets[0].asset_tag} retired. Its history is kept.` });
});

export const listMyAssets = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       a.*,
       aa.id AS assignment_id,
       aa.assigned_at,
       aa.expected_return_date,
       aa.remarks AS assignment_remarks,
       aa.condition_at_assignment,
       aa.status AS assignment_status,
       (
         SELECT COUNT(*) FROM asset_acknowledgements ack
         WHERE ack.assignment_id = aa.id
       ) AS acknowledged
     FROM asset_assignments aa
     INNER JOIN assets a ON a.id = aa.asset_id
     WHERE aa.employee_id = ? AND aa.status = 'ACTIVE'
     ORDER BY aa.assigned_at DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

export const listEmployeeAssetRecords = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'view');
  const scope = await resolveCompanyFilter(req, 'e.company_id');
  if (!scope) return res.json({ success: true, data: [] });

  const search = String(req.query.search || '').trim();
  const activeOnly = String(req.query.activeOnly || '') === '1';
  const withAssets = String(req.query.withAssets || '') === '1';

  let sql = `
    SELECT
      e.id,
      e.employee_id,
      e.full_name,
      e.designation,
      e.status,
      e.work_location,
      e.company_id,
      c.name AS company_name,
      d.name AS department_name,
      COALESCE(SUM(aa.status = 'ACTIVE'), 0) AS active_count,
      COUNT(aa.id) AS total_assignments,
      MAX(aa.assigned_at) AS last_assigned_at
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN companies c ON c.id = e.company_id
    LEFT JOIN asset_assignments aa ON aa.employee_id = e.id
    WHERE e.role <> 'SUPER_ADMIN' AND e.is_demo = 0
      ${scope.sql}
  `;
  const params = [...scope.params];

  if (activeOnly) {
    sql += ` AND e.status = 'ACTIVE'`;
  }
  if (search) {
    sql += ` AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR d.name LIKE ? OR e.designation LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  sql += `
    GROUP BY e.id, e.employee_id, e.full_name, e.designation, e.status,
             e.work_location, e.company_id, c.name, d.name
  `;
  if (withAssets) {
    sql += ' HAVING active_count > 0';
  }
  sql += ' ORDER BY active_count DESC, last_assigned_at DESC, e.full_name ASC';

  const [rows] = await pool.query(sql, params);
  res.json({
    success: true,
    data: rows.map((row) => ({
      ...row,
      active_count: Number(row.active_count || 0),
      total_assignments: Number(row.total_assignments || 0)
    }))
  });
});

export const listEmployeeAssets = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'assets', 'view');
  const employeeId = Number(req.params.employeeId);
  const includeHistory = String(req.query.history || '') === '1';

  const [emps] = await pool.query(
    `SELECT
       e.id,
       e.company_id,
       e.full_name,
       e.employee_id,
       e.designation,
       e.status,
       e.work_location,
       d.name AS department_name,
       c.name AS company_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN companies c ON c.id = e.company_id
     WHERE e.id = ?
     LIMIT 1`,
    [employeeId]
  );
  if (!emps.length) throw new AppError('Employee not found.', 404);
  await assertCompanyAccess(req.user, emps[0].company_id);

  let sql = `
    SELECT
      a.id AS asset_id,
      a.asset_tag,
      a.asset_name,
      a.category,
      a.make,
      a.model,
      a.serial_number,
      a.condition_label,
      a.status AS asset_status,
      aa.id AS assignment_id,
      aa.assigned_at,
      aa.expected_return_date,
      aa.returned_at,
      aa.status AS assignment_status,
      aa.condition_at_assignment,
      aa.return_condition,
      aa.return_status,
      aa.return_remarks,
      aa.remarks AS assignment_remarks,
      assigner.full_name AS assigned_by_name,
      (
        SELECT COUNT(*) FROM asset_acknowledgements ack
        WHERE ack.assignment_id = aa.id
      ) AS acknowledged,
      (
        SELECT COUNT(*) FROM asset_service_records s
        WHERE s.asset_id = a.id
          AND s.status <> 'CLOSED'
          AND s.record_type IN ('REPAIR', 'DAMAGE')
      ) AS open_repairs
    FROM asset_assignments aa
    INNER JOIN assets a ON a.id = aa.asset_id
    LEFT JOIN employees assigner ON assigner.id = aa.assigned_by
    WHERE aa.employee_id = ?
  `;
  if (!includeHistory) {
    sql += ` AND aa.status = 'ACTIVE'`;
  }
  sql += ` ORDER BY aa.status = 'ACTIVE' DESC, aa.assigned_at DESC, aa.id DESC`;

  const [rows] = await pool.query(sql, [employeeId]);

  res.json({
    success: true,
    data: {
      employee: emps[0],
      activeCount: rows.filter((row) => row.assignment_status === 'ACTIVE').length,
      assets: rows
    }
  });
});

export const offboardingAssetReturns = listEmployeeAssets;
