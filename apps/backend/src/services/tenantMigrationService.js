import {
  runForAllTenants,
  runWithTenant
} from '../config/database.js';
import { ensureTenantSecuritySchema } from '../migrations/ensureTenantSecuritySchema.js';
import { ensureV110Schema } from '../migrations/ensureV110Schema.js';
import { ensureV120Schema } from '../migrations/ensureV120Schema.js';

export async function migrateTenant(
  tenant
) {
  return runWithTenant(
    tenant,
    async () => {
      const databaseName =
        tenant.database_name ||
        tenant.databaseName;

      await ensureTenantSecuritySchema(
        databaseName
      );

      await ensureV110Schema();
      await ensureV120Schema();
    }
  );
}

export async function migrateAllTenants() {
  return runForAllTenants(
    async (tenant) => {
      const databaseName =
        tenant.database_name ||
        tenant.databaseName;

      await ensureTenantSecuritySchema(
        databaseName
      );

      await ensureV110Schema();
      await ensureV120Schema();

      console.log(
        `[tenant-migration] ${tenant.tenant_code} (${databaseName}) ready.`
      );
    }
  );
}
