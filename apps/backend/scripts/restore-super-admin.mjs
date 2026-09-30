import { pool } from '../src/config/database.js';

await pool.query(
  `UPDATE employees
   SET role = 'SUPER_ADMIN',
       status = 'ACTIVE',
       full_name = 'SRSB Super Admin'
   WHERE email = 'admin@srsbworkforcesolutions.com'`
);

const [rows] = await pool.query(
  `SELECT id, role, status, email
   FROM employees
   WHERE email = 'admin@srsbworkforcesolutions.com'`
);

console.log(rows);
await pool.end();
