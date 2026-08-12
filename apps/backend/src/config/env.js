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

  // Shared MySQL server credentials. Every tenant receives a separate
  // database. The application never accepts a database name from clients.
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: Number(process.env.DB_PORT || 3306),
  dbUser: process.env.DB_USER || '',
  dbPassword: process.env.DB_PASSWORD || '',
  // Default / legacy tenant database (existing SRSB production DB).
  dbName: process.env.DB_NAME || 'srsb_hrms',
  // Platform registry database (companies, activation codes).
  masterDbName:
    process.env.MASTER_DB_NAME ||
    process.env.PLATFORM_DB_NAME ||
    'srsb_platform',
  defaultCompanyCode: String(
    process.env.DEFAULT_COMPANY_CODE || 'SRSB'
  )
    .trim()
    .toUpperCase(),
  defaultCompanyName:
    process.env.DEFAULT_COMPANY_NAME ||
    'SRSB Workforce Solutions',

  // Master/control-plane database. It contains only tenant metadata and
  // branding, not employee/attendance/recruitment records.
  masterDbName:
    process.env.MASTER_DB_NAME ||
    'srsb_platform',

  defaultTenantCode:
    String(
      process.env.DEFAULT_TENANT_CODE ||
      'SRSB'
    )
      .trim()
      .toUpperCase(),

  defaultTenantName:
    process.env.DEFAULT_TENANT_NAME ||
    'SRSB Workforce Solutions',

  tenantPoolConnectionLimit: Math.max(
    2,
    Number(
      process.env.TENANT_POOL_CONNECTION_LIMIT ||
      5
    )
  ),

  // Only this many tenant pools stay warm in one backend process. This
  // prevents thousands of customers from creating thousands of permanent
  // database connections. Other tenant pools are created on demand.
  tenantPoolCacheMax: Math.max(
    5,
    Number(
      process.env.TENANT_POOL_CACHE_MAX ||
      50
    )
  ),

  // Protects the SRSB platform-management API used to provision companies.
  // Keep this only on the backend/server; never put it in the desktop app.
  platformAdminKey:
    process.env.PLATFORM_ADMIN_KEY || '',

  jwtSecret:
    process.env.JWT_SECRET ||
    'development-only-secret',
  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN || '8h',

  corsOrigin:
    process.env.CORS_ORIGIN ||
    'http://localhost:5173',

  // Used only when registering the existing SRSB database as the initial
  // tenant during the first multi-tenant startup.
  superAdminEmail:
    String(
      process.env.SUPER_ADMIN_EMAIL ||
      'info@srsbworkforcesolutions.com'
    )
      .trim()
      .toLowerCase(),

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
  resendApiKey:
    process.env.RESEND_API_KEY || '',
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL || '',
  resendFromName:
    process.env.RESEND_FROM_NAME ||
    'SRSB Workforce Solutions',

  otpExpiryMinutes: Number(
    process.env.OTP_EXPIRY_MINUTES || 10
  ),

  githubReleaseToken:
    process.env.GITHUB_RELEASE_TOKEN || '',
  githubReleaseOwner:
    process.env.GITHUB_RELEASE_OWNER ||
    'digisrsb-byte',
  githubReleaseRepo:
    process.env.GITHUB_RELEASE_REPO ||
    'srsb-work-management',
  githubReleaseCacheSeconds: Math.max(
    30,
    Number(
      process.env.GITHUB_RELEASE_CACHE_SECONDS ||
      300
    )
  ),
  publicApiUrl:
    process.env.PUBLIC_API_URL || '',

  // Platform ops (create codes / list / suspend). Empty disables HTTP platform routes.
  platformAdminKey: String(
    process.env.PLATFORM_ADMIN_KEY || ''
  ).trim()
};
