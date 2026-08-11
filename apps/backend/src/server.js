import { migrateTenantDatabase, migrateAllActiveTenants } from './services/tenantProvisioner.js';
import { env } from './config/env.js';
import {
  getMasterPool,
  getTenantPool,
  testDatabaseConnection
} from './config/database.js';
import { startAttendanceScheduler } from './utils/attendanceScheduler.js';
import { ensurePlatformSchema } from './migrations/ensurePlatformSchema.js';
import app from './app.js';

/**
 * Seed company_settings for the legacy default tenant from invoice_settings
 * when the row does not exist yet. Additive only.
 */
async function ensureDefaultCompanySettings(pool) {
  const [existing] = await pool.query(
    'SELECT id FROM company_settings WHERE id = 1 LIMIT 1'
  );
  if (existing.length > 0) {
    return;
  }

  const [invoiceRows] = await pool.query(
    'SELECT * FROM invoice_settings WHERE id = 1 LIMIT 1'
  );
  const invoice = invoiceRows[0];

  if (invoice) {
    await pool.query(
      `INSERT INTO company_settings (
         id, legal_name, display_name, address, phone, email, gst_number,
         bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch,
         sac_code, authorised_signatory, invoice_prefix
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        invoice.legal_name,
        env.defaultCompanyName,
        invoice.registered_address,
        invoice.phone,
        invoice.email,
        invoice.gst_number,
        invoice.bank_account_name,
        invoice.bank_account_number,
        invoice.bank_ifsc,
        invoice.bank_name,
        invoice.bank_branch,
        invoice.default_sac_code || '998616',
        invoice.authorised_signatory,
        invoice.invoice_prefix || 'SRSB'
      ]
    );
    return;
  }

  await pool.query(
    `INSERT INTO company_settings (
       id, legal_name, display_name, address, phone, email, gst_number,
       sac_code, invoice_prefix
     ) VALUES (1, ?, ?, NULL, NULL, NULL, NULL, '998616', 'SRSB')`,
    [env.defaultCompanyName, env.defaultCompanyName]
  );
}

async function start() {
  try {
    // 1) Platform registry (master DB)
    await ensurePlatformSchema();
    await testDatabaseConnection(getMasterPool());

    // 2) Migrate ALL active company DBs (SRSB + onboarded tenants)
    const defaultPool = getTenantPool(env.dbName);
    await testDatabaseConnection(defaultPool);
    const tenantCount = await migrateAllActiveTenants();
    // Ensure default DB is migrated even if master registry is empty/offline.
    if (tenantCount === 0) {
      await migrateTenantDatabase(env.dbName, {
        forceSrsbInvoiceProfile: true
      });
    }
    await ensureDefaultCompanySettings(defaultPool);

    app.listen(env.port, '0.0.0.0', () => {
      console.log(
        `SRSB Work Management API running at http://localhost:${env.port}`
      );
      console.log(
        `Master DB: ${env.masterDbName} | Default tenant DB: ${env.dbName} | Tenants migrated: ${tenantCount || 1}`
      );
      startAttendanceScheduler();
    });
  } catch (error) {
    console.error('Application startup failed:', error.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) =>
  console.error('Unhandled promise rejection:', reason)
);
process.on('uncaughtException', (error) =>
  console.error('Uncaught exception:', error)
);
start();
