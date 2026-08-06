# SRSB Work Management 1.2.0 deployment

This release upgrades the existing GitHub repository, Railway backend and Railway MySQL database. Do not create a second repository, service or database.

## 1. Protect production data

A valid database backup is strongly recommended before the first 1.2.0 deployment. When a Railway backup is unavailable, avoid destructive SQL and deploy only the additive migration included with this release.

Never run `database/schema.sql` against Railway. The backend startup migration in `apps/backend/src/migrations/ensureV120Schema.js` adds the version 1.2.0 structures without deleting existing users or business records.

## 2. Apply and validate source

Use the version 1.2.0 upgrade package in the current project folder. The apply script creates a local source backup, installs dependencies, validates source and builds the Windows installer.

## 3. Push to the existing repository

Review staged files before committing. Do not stage `.env`, `release`, `node_modules`, backups or temporary patch files.

```cmd
git add .github apps database scripts docs package.json package-lock.json README.md README-V1.2.0.md START_HERE.md Build-SRSB-v1.2.0.bat Publish-Future-Update.bat Verify-Deployed-v1.2.0.bat Verify-Deployed-v1.2.0.cjs VALIDATION-REPORT-V1.2.0.txt
git commit -m "Release SRSB Work Management 1.2.0"
git push origin main
```

## 4. Verify Railway

Wait for the existing backend deployment to become Active, then run:

```text
Verify-Deployed-v1.2.0.bat
```

The script performs read-only checks for login, dashboards, clients, candidate references, placements, invoices, holidays, tasks and attendance calendar.

## 5. Pilot the Windows application

Install:

```text
release\SRSB-Work-Management-Setup-1.2.0.exe
```

Test with:
- Super Admin: invoice settings, preview, PDF download and print.
- Normal Admin: no Invoice menu or API access.
- Employee: attendance calendar, tasks and extension request.
- Recruitment user: candidate sourcing and placement history.

## 6. Automatic updates

The desktop updater checks the existing Railway update endpoint. A private GitHub repository requires a backend-only, read-only release token in Railway. Never put that token in frontend or desktop source.

Backend-only fixes deploy through Railway and do not require a new installer. Frontend or Electron changes require a new desktop release.
