import bcrypt from 'bcryptjs';
import { pool } from './config/database.js';

async function seed() {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [departments] =
      await connection.query(
        `SELECT id
           FROM departments
          WHERE name = 'Management'
          LIMIT 1`
      );

    const departmentId =
      departments[0]?.id || null;

    const [rows] =
      await connection.query(
        `SELECT id
           FROM employees
          WHERE employee_id = 'SRSB001'
          LIMIT 1`
      );

    if (rows.length) {
      await connection.query(
        `UPDATE employees
            SET full_name = 'SRSB Administrator',
                role = 'ADMIN',
                account_type = 'EMPLOYEE',
                designation = 'Administrator',
                department_id = ?,
                status = 'ACTIVE'
          WHERE id = ?`,
        [
          departmentId,
          rows[0].id
        ]
      );

      console.log(
        'Admin account updated: SRSB001'
      );
    } else {
      const passwordHash =
        await bcrypt.hash(
          'Admin@123',
          12
        );

      await connection.query(
        `INSERT INTO employees (
           employee_id,
           username,
           full_name,
           email,
           password_hash,
           role,
           account_type,
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
           ?,
           'ADMIN',
           'EMPLOYEE',
           'Administrator',
           ?,
           'ACTIVE',
           TRUE
         )`,
        [
          passwordHash,
          departmentId
        ]
      );

      console.log(
        'Admin created: SRSB001 / Admin@123'
      );
    }

    await connection.commit();
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
