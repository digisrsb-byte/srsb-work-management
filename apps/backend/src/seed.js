import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from './config/database.js';

const SUPER_ADMIN_EMAIL =
  'info@srsbworkforcesolutions.com';

async function seed() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [departments] = await connection.query(
      `SELECT id
         FROM departments
        WHERE name = 'Management'
        LIMIT 1`
    );

    const departmentId = departments[0]?.id || null;

    const [adminRows] = await connection.query(
      `SELECT id, email
         FROM employees
        WHERE employee_id = 'SRSB001'
        LIMIT 1`
    );

    if (adminRows.length) {
      const adminEmail =
        String(adminRows[0].email || '').toLowerCase() ===
        SUPER_ADMIN_EMAIL
          ? 'admin@srsbworkforcesolutions.com'
          : adminRows[0].email;

      await connection.query(
        `UPDATE employees
            SET username = 'admin',
                full_name = 'SRSB Administrator',
                email = ?,
                recovery_email = NULL,
                role = 'ADMIN',
                designation = 'Administrator',
                department_id = ?,
                status = 'ACTIVE'
          WHERE id = ?`,
        [
          adminEmail || 'admin@srsbworkforcesolutions.com',
          departmentId,
          adminRows[0].id
        ]
      );
    } else {
      const adminPasswordHash =
        await bcrypt.hash('Admin@123', 12);

      await connection.query(
        `INSERT INTO employees (
           employee_id,
           username,
           full_name,
           email,
           recovery_email,
           password_hash,
           role,
           designation,
           department_id,
           status,
           must_change_password
         )
         VALUES (
           'SRSB001',
           'admin',
           'SRSB Administrator',
           'admin@srsbworkforcesolutions.com',
           NULL,
           ?,
           'ADMIN',
           'Administrator',
           ?,
           'ACTIVE',
           TRUE
         )`,
        [adminPasswordHash, departmentId]
      );
    }

    await connection.query(
      `UPDATE employees
          SET role = 'ADMIN'
        WHERE role = 'SUPER_ADMIN'
          AND LOWER(COALESCE(email, '')) <> ?`,
      [SUPER_ADMIN_EMAIL]
    );

    const inaccessiblePassword =
      crypto.randomBytes(64).toString('base64url');

    const inaccessiblePasswordHash =
      await bcrypt.hash(inaccessiblePassword, 12);

    const [superAdminRows] = await connection.query(
      `SELECT id
         FROM employees
        WHERE LOWER(COALESCE(email, '')) = ?
        LIMIT 1`,
      [SUPER_ADMIN_EMAIL]
    );

    let superAdminId;

    if (superAdminRows.length) {
      superAdminId = superAdminRows[0].id;

      await connection.query(
        `UPDATE employees
            SET employee_id = NULL,
                username = NULL,
                full_name = 'SRSB Super Admin',
                email = ?,
                recovery_email = ?,
                password_hash = ?,
                role = 'SUPER_ADMIN',
                designation = 'Super Administrator',
                department_id = ?,
                status = 'ACTIVE',
                must_change_password = TRUE
          WHERE id = ?`,
        [
          SUPER_ADMIN_EMAIL,
          SUPER_ADMIN_EMAIL,
          inaccessiblePasswordHash,
          departmentId,
          superAdminId
        ]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO employees (
           employee_id,
           username,
           full_name,
           email,
           recovery_email,
           password_hash,
           role,
           designation,
           department_id,
           status,
           must_change_password
         )
         VALUES (
           NULL,
           NULL,
           'SRSB Super Admin',
           ?,
           ?,
           ?,
           'SUPER_ADMIN',
           'Super Administrator',
           ?,
           'ACTIVE',
           TRUE
         )`,
        [
          SUPER_ADMIN_EMAIL,
          SUPER_ADMIN_EMAIL,
          inaccessiblePasswordHash,
          departmentId
        ]
      );

      superAdminId = result.insertId;
    }

    await connection.query(
      `DELETE FROM password_reset_otps
        WHERE employee_id = ?`,
      [superAdminId]
    );

    await connection.commit();

    console.log('Access hierarchy created successfully.');
    console.log('Super Admin login: info@srsbworkforcesolutions.com only.');
    console.log('Use Forgot Password to create the first Super Admin password.');
    console.log('SRSB001 is an ADMIN account, not a Super Admin.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
