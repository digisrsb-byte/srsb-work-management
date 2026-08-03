import dotenv from 'dotenv';

dotenv.config();

const required = [
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'JWT_SECRET'
];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[configuration] ${key} is not set`);
  }
}

export const env = {
  port: Number(process.env.PORT || 5000),

  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: Number(process.env.DB_PORT || 3306),
  dbUser: process.env.DB_USER || '',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: process.env.DB_NAME || 'srsb_hrms',

  jwtSecret:
    process.env.JWT_SECRET ||
    'development-only-secret',
  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN || '8h',

  corsOrigin:
    process.env.CORS_ORIGIN ||
    'http://localhost:5173',

  superAdminEmail:
    String(
      process.env.SUPER_ADMIN_EMAIL ||
      'info@srsbworkforcesolutions.com'
    ).trim().toLowerCase(),

  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(
    process.env.SMTP_PORT || 587
  ),
  smtpSecure:
    process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword:
    process.env.SMTP_PASSWORD || '',
  smtpFromName:
    process.env.SMTP_FROM_NAME ||
    'SRSB Workforce Solutions',
  smtpFromEmail:
    process.env.SMTP_FROM_EMAIL || '',
  otpExpiryMinutes: Number(
    process.env.OTP_EXPIRY_MINUTES || 10
  )
};
