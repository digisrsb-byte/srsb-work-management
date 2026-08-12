import {
  closeAllDatabasePools,
  initializePlatform
} from './config/database.js';
import { migrateAllTenants } from './services/tenantMigrationService.js';

try {
  await initializePlatform();
  await migrateAllTenants();

  console.log(
    'All active company databases migrated successfully.'
  );

  await closeAllDatabasePools();
  process.exit(0);
} catch (error) {
  console.error(
    'Multi-tenant migration failed:',
    error
  );

  await closeAllDatabasePools()
    .catch(() => {});

  process.exit(1);
}
