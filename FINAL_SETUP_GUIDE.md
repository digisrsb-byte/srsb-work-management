# SRSB Work Management — Final Setup

## Final recovery rules

- **Employee / Recruiter / HR / Manager:** Forgot-password creates a request visible to Admin and Super Admin. Admin sets the new final password.
- **Admin / Super Admin:** Forgot-password sends a 6-digit OTP to the account's registered `recovery_email` (or official email when recovery email is empty). After OTP verification, the user creates a new password.
- Existing passwords are never displayed. Only bcrypt password hashes are stored.

## RBAC rules

- **Super Admin:** manages every account, creates Admins, changes Admin recovery emails, changes roles, resets passwords, activates/deactivates and deletes accounts.
- **Admin:** manages non-Admin staff and their passwords. Admin cannot create, edit, reset or delete Admin/Super Admin accounts.
- **HR / Manager:** operational dashboard access only. No employee-account or password-management access.
- **Employee / Recruiter:** employee portal and permitted work modules only.

Backend middleware enforces permissions. Hiding a button in the frontend is not treated as security.

## First run

1. Copy `apps/backend/.env.example` to `apps/backend/.env`.
2. Enter MySQL and SMTP credentials in `.env`.
3. Run `npm install` from the project root.
4. Start three CMD windows:

```cmd
npm run dev:backend
npm run dev:frontend
npm run dev:desktop
```

The backend automatically adds the `username`, `recovery_email`, OTP and reset-request database structures when it starts.

## Configure Super Admin recovery

Log in as Super Admin, open **Employees**, edit the Super Admin record and set:

- Username, for example `superadmin`
- Official email
- Recovery email, for example `info@srsbworkforcesolutions.com`

Only Super Admin can create or manage Admin/Super Admin accounts.

## SMTP variables

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@srsbworkforcesolutions.com
SMTP_PASSWORD="YOUR_MAILBOX_PASSWORD"
SMTP_FROM_NAME=SRSB Workforce Solutions
SMTP_FROM_EMAIL=info@srsbworkforcesolutions.com
OTP_EXPIRY_MINUTES=10
```

Do not place SMTP credentials in frontend or Electron files.

## Hosting and future Android application

The UI communicates through the REST API configured by `VITE_API_URL`. For hosting, set it to the public HTTPS backend URL before building.

A future React Native/Android application can use the same API, JWT authentication, RBAC rules, MySQL data and password-recovery endpoints. No business logic needs to be copied into the mobile application.

## Windows installer

```cmd
npm run build:desktop
```

The generated installer will be inside the Electron release/output directory configured by electron-builder.
