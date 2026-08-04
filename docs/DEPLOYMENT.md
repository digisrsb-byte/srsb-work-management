# SRSB Work Management 1.1.0 deployment

This release upgrades the existing GitHub repository, existing Railway backend and existing Railway MySQL database. Do not create a second repository or Railway project.

## 1. Back up the existing database

Create a Railway MySQL backup before the first 1.1.0 deployment.

Do not run `database/schema.sql` against the existing Railway database. That file is only for a completely fresh installation. The backend startup migration in `apps/backend/src/migrations/ensureV110Schema.js` adds the 1.1.0 structures without deleting current records.

## 2. Private-repository update access

The desktop updater checks the public Railway endpoint:

```text
https://srsb-work-management-production.up.railway.app/api/app-updates/latest
```

When the existing GitHub repository is private, add this backend-only Railway variable:

```text
GITHUB_RELEASE_TOKEN=<fine-grained read-only token for the existing repository>
```

Never add this token to frontend or desktop files. Optional defaults:

```text
GITHUB_RELEASE_OWNER=digisrsb-byte
GITHUB_RELEASE_REPO=srsb-work-management
GITHUB_RELEASE_CACHE_SECONDS=300
PUBLIC_API_URL=https://srsb-work-management-production.up.railway.app
```

## 3. Push 1.1.0 to the existing repository

```cmd
git add apps database scripts .github package.json package-lock.json Build-SRSB-v1.1.0.bat Publish-Future-Update.bat README-V1.1.0.md Verify-Deployed-v1.1.0.*
git commit -m "Release SRSB Work Management 1.1.0"
git push origin main
```

Wait for the same Railway backend service to show Online. Its startup applies the additive migration.

## 4. Verify the deployed backend

Run:

```text
Verify-Deployed-v1.1.0.bat
```

Test Head Admin, Admin/HR and Employee workflows before publishing the release.

## 5. Build the Windows application

Run:

```text
Build-SRSB-v1.1.0.bat
```

Expected installer:

```text
release\SRSB-Work-Management-Setup-1.1.0.exe
```

Install it on one pilot computer and complete the acceptance test.

## 6. Publish the first automatic-update release

After the pilot passes:

```cmd
git tag v1.1.0
git push origin v1.1.0
```

The existing GitHub Actions workflow publishes the installer as a Release asset. Version 1.1.0 is the one-time installer employees receive manually. Future desktop releases can be installed from **Settings & Updates → Check for Updates**.

Backend-only changes continue to deploy through Railway and do not require a new desktop installation.
