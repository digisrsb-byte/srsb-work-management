import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  // HRMS dates and punch times are business wall-clock values. Returning
  // DATE/DATETIME as strings prevents Node/MySQL timezone inflation from
  // silently shifting values by +05:30 or -05:30 between environments.
  dateStrings: ['DATE', 'DATETIME']
});

export async function testDatabaseConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
