# SRSB Work Management

Current fixed source release: **1.2.2**.

This release consolidates the attendance/timezone and recruitment placement-to-invoice fixes that were previously being applied as separate patches.

## Main fixes in 1.2.2

- India wall-clock time is handled consistently for Punch In, Punch Out, attendance correction, attendance calendar and employee dashboard.
- An employee who is punched in today but has not punched out yet is treated as an active/present session instead of an immediate `MISSING_PUNCH` record.
- Attendance corrections preserve the punch value that was not being corrected and validate issue-specific fields.
- Full-day attendance calculation uses one 480-minute threshold in normal punch and correction flows.
- Candidate sourcing cannot become `JOINED` without a completed placement record.
- Selecting `JOINED` from Candidates opens the placement form with company/job role details prefilled.
- Existing inconsistent `JOINED + Placements 0` records show **Complete Placement** so they can be repaired without creating another candidate.
- Invoice candidate selection is limited to completed `JOINED`/`ACTIVE` placements with a joining date and positive Billing CTC.
- Candidate and invoice default dates use India date rather than UTC date.
- Candidate screen encoding artifacts such as `Â·` / `â€”` were removed.

## Validate source

```text
npm run validate:backend
npm run validate:v120
```

The `validate:v120` script name is kept for compatibility, but it validates release **1.2.2**.

## Build Windows desktop installer

Install dependencies once:

```text
npm install
```

Then run:

```text
Build-SRSB-v1.2.2.bat
```

or:

```text
npm run build:desktop
```

The installer is generated under `release` using the version from `package.json`.

## Production database

Do **not** run `database/schema.sql` against an existing Railway production database. The application keeps the existing database and its safe additive migration flow.

## Acceptance testing

Before distributing the installer, complete `ACCEPTANCE-TEST-1.2.2.md`, especially:

1. Punch In -> live work time -> Punch Out.
2. Attendance correction -> Admin approval -> attendance refresh.
3. Candidate -> Job Requirement -> JOINED -> Placement -> Invoice -> Print/PDF.

## Multi-company setup (activation code → EXE wizard → login)

Architecture: one hosted API + **Master DB** (`MASTER_DB_NAME`, default `srsb_platform`) that maps each company to its **own MySQL database**. The same Windows `.exe` is used by every company.

### 1. Platform / Railway notes
- Set `MASTER_DB_NAME` (or `PLATFORM_DB_NAME`) alongside the existing `DB_NAME` (legacy SRSB tenant).
- The MySQL user must be allowed to `CREATE DATABASE` so onboarding can provision tenant DBs.
- On boot the API ensures the master schema and registers the default company (`DEFAULT_COMPANY_CODE`, usually `SRSB`) against the existing `DB_NAME`. Do **not** run destructive `database/schema.sql` on production.

### 2. Issue an activation code (us)
CLI (recommended):

```bash
npm run activation:create -- --note="Acme Corp" --expires-days=90
```

Optional HTTP (requires `PLATFORM_ADMIN_KEY` in backend env):

```bash
curl -X POST "$API/api/platform/activation-codes" \
  -H "X-Platform-Key: $PLATFORM_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"note\":\"Acme Corp\",\"expiresDays\":90}"
```

### 3. Company installs EXE / opens web app
- First launch with no saved company code opens the **Setup Wizard** (`#/setup`).
- Steps: activation code → company profile → logo/signature → bank details → first admin.
- API validates the code, creates `company_<code>` DB, runs additive schema ensures, saves `company_settings`, creates the admin user, and marks the activation code used.
- App stores `srsb_company_code` locally and routes to login with that code prefilled.

### 4. Login
- Use **Company code + Login ID + Password**.
- JWT includes tenant claims; every authenticated request binds only that company DB.
- Suspended companies cannot log in (and mid-session requests return 403).

### 5. Branding
- Company logo/name/address/GST/bank drive login branding, sidebar, and invoice PDF/print.
- Company admins edit profile/logo later under **Settings → Company profile**.

### 6. Platform ops (list / suspend / activate)
```bash
npm run companies:list
npm run companies:suspend -- --code=ACME
npm run companies:activate -- --code=ACME
```

HTTP equivalents (with `PLATFORM_ADMIN_KEY`): `GET /api/platform/companies`, `PATCH /api/platform/companies/:code/status` with body `{ "status": "SUSPENDED" | "ACTIVE" }`.

### Local smoke test
1. Start MySQL + `npm run dev:backend` + `npm run dev:frontend` (or desktop).
2. `npm run activation:create -- --note=test`
3. Open `/setup`, complete wizard with the code.
4. Sign in with the new company code + admin.
5. Confirm sidebar/login branding and an invoice PDF use the new company details.
6. Confirm existing `SRSB` login still works against `DB_NAME`.
