import bcrypt from 'bcryptjs';
import { pool } from './config/database.js';

async function seed() {
  const connection = await pool.getConnection();
  try {
    const [departments] = await connection.query(
      `SELECT id FROM departments WHERE name='Management' LIMIT 1`
    );
    const departmentId = departments[0]?.id || null;

    const [existing] = await connection.query(
      `SELECT id FROM employees WHERE employee_id='SRSB001'`
    );
    if (existing.length) {
      console.log('Admin already exists: SRSB001');
      return;
    }

    const passwordHash = await bcrypt.hash('Admin@123', 12);
    await connection.query(
      `INSERT INTO employees
       (employee_id, username, full_name, email, recovery_email, password_hash, role, designation, department_id, status)
       VALUES ('SRSB001','superadmin','SRSB Super Admin','admin@srsbworkforcesolutions.com','info@srsbworkforcesolutions.com',?,
               'SUPER_ADMIN','Administrator',?,'ACTIVE')`,
      [passwordHash, departmentId]
    );

    console.log('Super Admin created. Login: superadmin or SRSB001. Change the default password immediately.');
  } finally {
    connection.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
