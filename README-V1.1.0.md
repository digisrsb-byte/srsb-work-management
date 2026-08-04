# SRSB Work Management 1.1.0

This release upgrades the existing SRSB Work Management project. It uses the same GitHub repository, Railway backend, MySQL database, backend URL, employees, passwords and existing records.

## Included in 1.1.0

- Automatic desktop update check and in-app Update Now flow through the existing Railway backend
- Current application version in Settings
- Modern desktop UI using Windows Segoe UI Variable / Segoe UI typography
- Employee Department dropdown limited to Technical and HR
- Free-text Designation field
- Reporting Manager and Joining Date
- Expanded client company, GST, address, email, phone and contact-person details
- Candidate profile, application stage and complete placement/employment history
- Invoice creation, GST type, tax amounts, supporting-file upload, payment history and outstanding amount
- Employee attendance-correction requests
- Admin/HR manual attendance and approval workflow with audit logs
- Holiday calendar and automatic HOLIDAY attendance status
- Search, filters, refresh states and clearer empty/error/success messages

## Important database rule

Do **not** run `database/schema.sql` on the existing Railway database. It is a fresh-install schema and starts by recreating the database.

The existing Railway database is upgraded additively when the backend starts through:

```text
apps/backend/src/migrations/ensureV110Schema.js
```

Existing employees, passwords, attendance, leave, clients and requirements are preserved.

## Build the Windows application

From the project folder, double-click:

```text
Build-SRSB-v1.1.0.bat
```

The installer is created at:

```text
release\SRSB-Work-Management-Setup-1.1.0.exe
```

## Deploy to the existing Railway project

1. Take a MySQL backup in Railway.
2. Commit and push the source to the existing repository:

```cmd
git add apps .github scripts package.json package-lock.json Build-SRSB-v1.1.0.bat Publish-Future-Update.bat README-V1.1.0.md
git commit -m "Release SRSB Work Management 1.1.0"
git push origin main
```

3. Wait for the existing Railway backend service to show Online.
4. Test the new APIs and install the 1.1.0 desktop application on one test computer.
5. Test Head Admin, Admin and Employee workflows before sharing it with everyone.

## Initial release and future automatic updates

After 1.1.0 has passed testing, create the first GitHub release:

```cmd
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions builds the Windows installer and attaches it to the GitHub Release. The desktop application checks the existing Railway backend, and Railway securely obtains the approved installer from GitHub. Employees who already have 1.1.0 can use the in-app updater for later versions such as 1.1.1.

When the existing repository is private, add this Railway backend variable before testing updates:

```text
GITHUB_RELEASE_TOKEN=<fine-grained read-only token for the existing repository>
```

The token stays only in Railway. Do not put it in the desktop app, frontend, source ZIP or chat. The optional owner/repository variables are already defaulted to the existing repository:

```text
GITHUB_RELEASE_OWNER=digisrsb-byte
GITHUB_RELEASE_REPO=srsb-work-management
```


For a future desktop release, double-click:

```text
Publish-Future-Update.bat
```

It updates version numbers, builds locally, commits, tags and pushes. GitHub Actions then publishes the installer. Backend-only changes still deploy through Railway and do not require a desktop update.

## Required acceptance test

- Employee: select Technical/HR Department and type a Designation
- Client: save GST/address/contact data and reopen the page
- Requirement: saved client appears in Client/Brand dropdown
- Candidate: add placement history, edit it and reopen the application
- Invoice: create invoice, apply only one GST system, record payment and check pending amount
- Attendance: employee requests correction; another authorised user approves/rejects it
- Manual Attendance: visible only to Head Admin, Admin and HR
- Holiday: add a holiday and verify attendance shows HOLIDAY
- Search and Refresh: test all relevant pages
- Update: Settings shows installed version, checks through Railway and downloads the approved GitHub Release installer
