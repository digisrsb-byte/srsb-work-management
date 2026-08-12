import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import {
  createBootstrapConnection,
  createTenantDatabase,
  dropTenantDatabase,
  masterPool,
  pool,
  runWithTenant
} from '../config/database.js';
import { ensureTenantSecuritySchema } from '../migrations/ensureTenantSecuritySchema.js';
import { ensureV110Schema } from '../migrations/ensureV110Schema.js';
import { ensureV120Schema } from '../migrations/ensureV120Schema.js';

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function databaseNameForCode(code) {
  const safePart =
    code
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        '_'
      )
      .replace(
        /^_+|_+$/g,
        ''
      )
      .slice(0, 42);

  return `srsb_tenant_${safePart}`;
}

async function loadTenantSchema() {
  const schemaUrl =
    new URL(
      '../../../../database/schema.sql',
      import.meta.url
    );

  let schema =
    await fs.readFile(
      schemaUrl,
      'utf8'
    );

  // The tenant database is created by the provisioning service. Remove the
  // destructive bootstrap statements for the historical SRSB database.
  schema = schema
    .replace(
      /^\s*DROP\s+DATABASE\s+IF\s+EXISTS\s+[^;]+;\s*$/gim,
      ''
    )
    .replace(
      /^\s*CREATE\s+DATABASE\s+[^;]+;\s*$/gim,
      ''
    )
    .replace(
      /^\s*USE\s+[^;]+;\s*$/gim,
      ''
    );

  return schema;
}

async function initialiseTenantSchema(
  tenant
) {
  const databaseName =
    tenant.database_name;

  const connection =
    await createBootstrapConnection(
      databaseName
    );

  try {
    const schema =
      await loadTenantSchema();

    await connection.query(schema);
  } finally {
    await connection.end();
  }

  await runWithTenant(
    tenant,
    async () => {
      await ensureTenantSecuritySchema(
        databaseName
      );

      await ensureV110Schema();
      await ensureV120Schema();
    }
  );
}

async function createCompanySuperAdmin(
  tenant,
  {
    ownerName,
    ownerEmail,
    ownerPassword
  }
) {
  const passwordHash =
    await bcrypt.hash(
      ownerPassword,
      12
    );

  await runWithTenant(
    tenant,
    async () => {
      await pool.query(
        `INSERT INTO employees (
           employee_id,
           username,
           full_name,
           email,
           recovery_email,
           password_hash,
           role,
           account_type,
           designation,
           status,
           must_change_password,
           password_changed_at
         )
         VALUES (
           NULL,
           NULL,
           ?,
           ?,
           ?,
           ?,
           'SUPER_ADMIN',
           'SYSTEM',
           'Company Super Admin',
           'ACTIVE',
           FALSE,
           CURRENT_TIMESTAMP
         )`,
        [
          ownerName,
          ownerEmail,
          ownerEmail,
          passwordHash
        ]
      );

      // Remove SRSB-specific invoice identity from the newly cloned schema.
      // Each company can later fill its own invoice settings.
      await pool.query(
        `UPDATE invoice_settings
         SET
           legal_name = ?,
           gst_number = NULL,
           registered_address = NULL,
           email = ?,
           phone = NULL,
           bank_account_name = NULL,
           bank_account_number = NULL,
           bank_ifsc = NULL,
           bank_name = NULL,
           bank_branch = NULL,
           authorised_signatory = 'Authorised Signatory',
           invoice_prefix = ?
         WHERE id = 1`,
        [
          tenant.company_name,
          ownerEmail,
          tenant.tenant_code
            .replace(
              /[^A-Z0-9]/g,
              ''
            )
            .slice(0, 20)
        ]
      );
    }
  );
}

export async function provisionTenant({
  tenantCode,
  companyName,
  legalName,
  ownerName,
  ownerEmail,
  ownerPassword,
  subscriptionPlan = 'STANDARD'
}) {
  const code =
    normalizeCode(tenantCode);

  const company =
    String(companyName || '')
      .trim();

  const owner =
    String(ownerName || '')
      .trim();

  const email =
    String(ownerEmail || '')
      .trim()
      .toLowerCase();

  const password =
    String(ownerPassword || '');

  if (
    !/^[A-Z0-9][A-Z0-9_-]{1,38}[A-Z0-9]$/.test(
      code
    )
  ) {
    throw new Error(
      'Company Code must be 3-40 characters using letters, numbers, underscore or hyphen.'
    );
  }

  if (!company) {
    throw new Error(
      'Company name is required.'
    );
  }

  if (!owner) {
    throw new Error(
      'Company Super Admin name is required.'
    );
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new Error(
      'A valid Company Super Admin email is required.'
    );
  }

  if (password.length < 12) {
    throw new Error(
      'Initial Company Super Admin password must contain at least 12 characters.'
    );
  }

  const databaseName =
    databaseNameForCode(code);

  const [existing] =
    await masterPool.query(
      `SELECT id
       FROM tenants
       WHERE tenant_code = ?
          OR database_name = ?
       LIMIT 1`,
      [
        code,
        databaseName
      ]
    );

  if (existing.length) {
    throw new Error(
      'Company Code already exists.'
    );
  }

  let tenantId = null;
  let databaseCreated = false;

  try {
    await createTenantDatabase(
      databaseName
    );

    databaseCreated = true;

    const [insertResult] =
      await masterPool.query(
        `INSERT INTO tenants (
           tenant_code,
           company_name,
           legal_name,
           database_name,
           owner_email,
           subscription_plan,
           status
         )
         VALUES (?, ?, ?, ?, ?, ?, 'PROVISIONING')`,
        [
          code,
          company,
          String(
            legalName || company
          ).trim(),
          databaseName,
          email,
          String(
            subscriptionPlan ||
            'STANDARD'
          )
            .trim()
            .toUpperCase()
            .slice(0, 50)
        ]
      );

    tenantId =
      Number(
        insertResult.insertId
      );

    const tenant = {
      id: tenantId,
      tenant_code: code,
      tenantCode: code,
      company_name: company,
      companyName: company,
      legal_name:
        String(
          legalName || company
        ).trim(),
      database_name:
        databaseName,
      databaseName,
      owner_email: email,
      ownerEmail: email,
      status: 'PROVISIONING'
    };

    await initialiseTenantSchema(
      tenant
    );

    await createCompanySuperAdmin(
      tenant,
      {
        ownerName: owner,
        ownerEmail: email,
        ownerPassword: password
      }
    );

    await masterPool.query(
      `UPDATE tenants
       SET status = 'ACTIVE'
       WHERE id = ?`,
      [tenantId]
    );

    await masterPool.query(
      `INSERT INTO platform_audit_logs (
         tenant_id,
         action,
         details
       )
       VALUES (?, 'TENANT_PROVISIONED', ?)`,
      [
        tenantId,
        JSON.stringify({
          tenantCode: code,
          databaseName,
          ownerEmail: email
        })
      ]
    );

    return {
      id: tenantId,
      tenantCode: code,
      companyName: company,
      databaseName,
      ownerEmail: email,
      status: 'ACTIVE'
    };
  } catch (error) {
    if (tenantId) {
      await masterPool.query(
        `DELETE FROM tenants
         WHERE id = ?`,
        [tenantId]
      ).catch(() => {});
    }

    if (databaseCreated) {
      await dropTenantDatabase(
        databaseName
      ).catch(() => {});
    }

    throw error;
  }
}
