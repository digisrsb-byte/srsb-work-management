import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  createNotification,
  notifyRoleHolders
} from '../services/notificationService.js';
import { replaceCompanyScopes } from '../services/permissionService.js';

export const createAccessRequest = asyncHandler(async (req, res) => {
  if (req.user.role === 'SUPER_ADMIN') {
    throw new AppError(
      'Super Admin already has full access and does not need access requests.',
      400
    );
  }

  const requestedAction = String(req.body.requestedAction || '').trim();
  const moduleName = String(req.body.module || '').trim() || null;
  const reason = String(req.body.reason || '').trim() || null;
  const requestedScope = req.body.requestedScope || null;

  if (!requestedAction) {
    throw new AppError('Requested action is required.', 400);
  }

  const [scopes] = await pool.query(
    `SELECT company_id FROM user_company_scopes WHERE employee_id = ?`,
    [req.user.id]
  );

  const [result] = await pool.query(
    `INSERT INTO admin_access_requests (
       requester_id, requested_action, module, reason, previous_scope, requested_scope, status
     ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      req.user.id,
      requestedAction,
      moduleName,
      reason,
      JSON.stringify({ companyIds: scopes.map((s) => s.company_id) }),
      requestedScope ? JSON.stringify(requestedScope) : null
    ]
  );

  await pool.query(
    `INSERT INTO access_decision_history (
       request_id, actor_id, decision, previous_value, new_value, notes
     ) VALUES (?, ?, 'CREATED', ?, ?, ?)`,
    [
      result.insertId,
      req.user.id,
      JSON.stringify({ companyIds: scopes.map((s) => s.company_id) }),
      requestedScope ? JSON.stringify(requestedScope) : null,
      reason
    ]
  );

  await notifyRoleHolders({
    roles: ['SUPER_ADMIN'],
    actorId: req.user.id,
    companyId: null,
    type: 'ACCESS_REQUEST',
    title: 'Admin access request',
    message: `${req.user.fullName || 'Admin'} requested: ${requestedAction}`,
    referenceType: 'ACCESS_REQUEST',
    referenceId: result.insertId
  });

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'ACCESS_REQUEST_CREATED',
    entityType: 'admin_access_requests',
    entityId: result.insertId,
    newValues: { requestedAction, moduleName },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: 'Access request submitted.',
    data: { id: result.insertId }
  });
});

export const listAccessRequests = asyncHandler(async (req, res) => {
  let sql = `
    SELECT
      r.*,
      req.full_name AS requester_name,
      req.employee_id AS requester_code,
      req.role AS requester_role,
      rev.full_name AS reviewer_name
    FROM admin_access_requests r
    INNER JOIN employees req ON req.id = r.requester_id
    LEFT JOIN employees rev ON rev.id = r.reviewed_by
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role !== 'SUPER_ADMIN') {
    sql += ' AND r.requester_id = ?';
    params.push(req.user.id);
  }

  sql += ' ORDER BY r.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

export const decideAccessRequest = asyncHandler(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can decide access requests.', 403);
  }

  const requestId = Number(req.params.requestId);
  const decision = String(req.body.decision || '').toUpperCase();
  const reviewNotes = String(req.body.reviewNotes || '').trim() || null;

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new AppError('Decision must be APPROVED or REJECTED.', 400);
  }

  const [rows] = await pool.query(
    `SELECT * FROM admin_access_requests WHERE id = ? LIMIT 1`,
    [requestId]
  );
  if (!rows.length) throw new AppError('Access request not found.', 404);
  const request = rows[0];

  if (Number(request.requester_id) === Number(req.user.id)) {
    throw new AppError('You cannot approve your own access request.', 403);
  }

  if (request.status !== 'PENDING') {
    throw new AppError('Request already decided.', 400);
  }

  await pool.query(
    `UPDATE admin_access_requests
     SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [decision, req.user.id, reviewNotes, requestId]
  );

  if (decision === 'APPROVED' && request.requested_scope) {
    const scope =
      typeof request.requested_scope === 'string'
        ? JSON.parse(request.requested_scope)
        : request.requested_scope;
    if (Array.isArray(scope?.companyIds)) {
      await replaceCompanyScopes(
        request.requester_id,
        scope.companyIds.map(Number).filter((id) => Number.isFinite(id))
      );
    }
  }

  const toJsonParam = (value) => {
    if (value == null) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  };

  await pool.query(
    `INSERT INTO access_decision_history (
       request_id, actor_id, decision, previous_value, new_value, notes
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      requestId,
      req.user.id,
      decision,
      toJsonParam(request.previous_scope),
      toJsonParam(request.requested_scope),
      reviewNotes
    ]
  );

  await createNotification({
    recipientId: request.requester_id,
    actorId: req.user.id,
    type: `ACCESS_REQUEST_${decision}`,
    title: `Access request ${decision.toLowerCase()}`,
    message: reviewNotes || `Your access request was ${decision.toLowerCase()}.`,
    referenceType: 'ACCESS_REQUEST',
    referenceId: requestId
  });

  await writeAuditLog({
    employeeId: req.user.id,
    action: `ACCESS_REQUEST_${decision}`,
    entityType: 'admin_access_requests',
    entityId: requestId,
    oldValues: { status: 'PENDING' },
    newValues: { status: decision, reviewNotes },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `Access request ${decision.toLowerCase()}.`
  });
});
