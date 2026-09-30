import { pool } from '../config/database.js';

export async function writeAuditLog({
  employeeId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
  ipAddress = null
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (
         employee_id,
         action,
         entity_type,
         entity_id,
         old_values,
         new_values,
         ip_address
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        employeeId || null,
        action,
        entityType || null,
        entityId != null ? String(entityId) : null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress || null
      ]
    );
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}
