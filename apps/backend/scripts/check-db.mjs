import { pool, testDatabaseConnection } from '../src/config/database.js';

try {
  await testDatabaseConnection();
  console.log('DB_OK');

  const [dbs] = await pool.query('SELECT DATABASE() AS db');
  console.log('DATABASE', dbs[0].db);

  const [tables] = await pool.query("SHOW TABLES LIKE 'employees'");
  console.log('EMPLOYEES_TABLE', tables.length > 0 ? 'yes' : 'no');

  if (tables.length) {
    const [count] = await pool.query('SELECT COUNT(*) AS c FROM employees');
    console.log('EMPLOYEE_COUNT', count[0].c);

    const [admins] = await pool.query(
      `SELECT employee_id, email, role, status
       FROM employees
       WHERE role = 'SUPER_ADMIN' OR employee_id = 'SRSB001'`
    );
    console.log('ADMIN_ROWS', JSON.stringify(admins));
  }
} catch (e) {
  console.log('DB_FAIL');
  console.log('CODE', e.code || '');
  console.log('ERRNO', e.errno || '');
  console.log('SQLSTATE', e.sqlState || '');
  console.log('MESSAGE', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
