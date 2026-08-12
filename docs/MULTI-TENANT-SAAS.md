# SRSB Work Management - Multi-Tenant SaaS Foundation

## Goal

One application codebase can serve many independent companies.

Each company receives:

- a unique Company Code
- its own MySQL database
- its own Company Super Admin
- its own employees, attendance, recruitment, clients, tasks, invoices and payments
- its own company display name and logo

The backend never accepts a database name from the desktop application.
The tenant/database is resolved from a signed JWT.

## Database layout

Control plane:

- `srsb_platform`
  - `tenants`
  - `platform_audit_logs`

Tenant databases:

- `srsb_hrms` for the existing SRSB workspace
- `srsb_tenant_acme001`
- `srsb_tenant_xyz001`
- etc.

The existing `DB_NAME` is automatically registered as the default tenant
using `DEFAULT_TENANT_CODE` (default `SRSB`) on the first multi-tenant start.

## Required backend environment variables

Keep your existing MySQL/JWT/mail variables and add:

```env
MASTER_DB_NAME=srsb_platform
DEFAULT_TENANT_CODE=SRSB
DEFAULT_TENANT_NAME="SRSB Workforce Solutions"
TENANT_POOL_CONNECTION_LIMIT=5
TENANT_POOL_CACHE_MAX=50
PLATFORM_ADMIN_KEY="USE_A_LONG_RANDOM_SECRET_HERE"
```

`DB_USER` must have permission to create databases if you want the backend
to provision customer databases automatically.

The platform key must exist only on the backend/server. Never put it in
Vite, Electron, frontend code, GitHub source, screenshots or customer PCs.

## First deployment

1. Back up the current production database.
2. Apply the source update.
3. Add the environment variables above to the backend host.
4. Deploy/restart the backend.
5. Startup creates `MASTER_DB_NAME` if permitted.
6. The existing `DB_NAME` is registered as Company Code `SRSB`.
7. Every active tenant database is migrated independently.
8. Existing pre-multi-tenant sessions are rejected once and users sign in again.
9. Older desktop versions that do not send Company Code temporarily fall back
   to `DEFAULT_TENANT_CODE`, so SRSB can be upgraded without a hard outage.
10. Build/distribute the new desktop version after backend testing.

## Creating a company

Use the included `Create-New-Company.bat` from an SRSB-controlled admin PC.

It asks for:

- backend URL
- `PLATFORM_ADMIN_KEY`
- Company Code
- company display/legal name
- Company Super Admin name/email/password

The backend then:

1. verifies that the code is unique
2. creates a separate MySQL database
3. builds the complete HRMS schema
4. runs tenant migrations
5. creates the company SYSTEM/SUPER_ADMIN account
6. clears SRSB-specific invoice identity from the new tenant database
7. activates the tenant in the master registry

Example result:

```text
Company Code : ACME001
Database     : srsb_tenant_acme001
Super Admin  : admin@acme.example
```

## Login

The new login screen asks for:

```text
Company Code
Email / Employee ID
Password
```

The JWT contains signed:

```text
tenantId
tenantCode
user id
role
```

Every authenticated request resolves the tenant again in the master database
and binds the existing `pool` API to that tenant using AsyncLocalStorage.

Controllers therefore cannot switch companies by accepting a database name
from request body/query/header.

## Company branding

Company Super Admin -> Settings -> Company Branding

Can change:

- Company Display Name
- Legal Company Name
- Logo

Logo types:

- PNG
- JPG/JPEG
- WEBP
- maximum 750 KB

The company name/logo appear on login and in the application brand area.
Company reports also use the tenant company name instead of a hard-coded SRSB name.

## Background jobs

Attendance/birthday/reminder schedulers dispatch sequentially across all
active tenant databases.

This prevents one tenant's scheduled job from running against another
tenant's data and avoids opening all tenant connections at startup.

## Connection scaling

Tenant pools are created on demand.

`TENANT_POOL_CACHE_MAX=50` means a backend process keeps at most 50 tenant
pools warm. Older pools are evicted as new companies become active.

Actual company capacity is limited by:

- MySQL/database infrastructure
- connection quotas
- CPU/RAM
- storage
- backup/migration strategy

There is no per-company code branch or hard-coded company limit.

## Security rules

- never trust `tenantId` or database name from the frontend
- tenant identity comes from a signed JWT
- tenant is revalidated against the master registry on every authenticated request
- suspended companies cannot use existing sessions
- platform provisioning uses a server-only platform secret
- Company Super Admin is a dedicated SYSTEM account
- normal employee records cannot become SUPER_ADMIN through login
- platform audit log records tenant provisioning/status/branding events

## Before production

For a commercial deployment also configure:

- automated per-database backups
- managed secret storage
- TLS for MySQL connections when required by the provider
- monitoring/alerts
- point-in-time recovery
- platform-admin web UI
- tenant migration reporting/retry controls
- object storage for large branding/assets if logo/file volume grows
- per-tenant rate/usage limits and subscription enforcement
