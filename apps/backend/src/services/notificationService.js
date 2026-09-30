import { pool } from '../config/database.js';

export async function createNotification({
  recipientId,
  actorId,
  type,
  title,
  message,
  referenceType = null,
  referenceId = null
}) {
  if (!recipientId) {
    return;
  }

  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientId,
      actorId || null,
      type,
      title,
      message,
      referenceType,
      referenceId
    ]
  );
}

export async function notifyRoleHolders({
  roles,
  actorId,
  companyId,
  type,
  title,
  message,
  referenceType,
  referenceId
}) {
  let sql = `
    SELECT DISTINCT e.id
    FROM employees e
    WHERE e.role IN (?)
      AND e.status = 'ACTIVE'
      AND e.id <> ?
  `;
  const params = [roles, actorId || 0];

  if (companyId) {
    sql += ` AND (
      e.role = 'SUPER_ADMIN'
      OR e.company_id = ?
      OR EXISTS (
        SELECT 1 FROM user_company_scopes ucs
        WHERE ucs.employee_id = e.id AND ucs.company_id = ?
      )
    )`;
    params.push(companyId, companyId);
  }

  const [rows] = await pool.query(sql, params);

  for (const row of rows) {
    await createNotification({
      recipientId: row.id,
      actorId,
      type,
      title,
      message,
      referenceType,
      referenceId
    });
  }
}
