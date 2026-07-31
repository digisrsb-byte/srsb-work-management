# SRSB Work Management — Final Activation Checklist

The application code is prepared. Finance is disabled for this release. Login fields are empty, and password reset is available only through the email address saved against an employee account.

## 1. Configure database
Edit `apps/backend/.env` and set the real MySQL password. Keep quotation marks when the password contains `#`, spaces, or other special characters.

```env
DB_PASSWORD="YOUR_REAL_MYSQL_PASSWORD"
```

## 2. Activate email OTP
Use a company mailbox. For Gmail or Google Workspace, enable 2-Step Verification and create an App Password. Do not use the normal mailbox password.

Fill these values in `apps/backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-company-email@example.com
SMTP_PASSWORD="your-16-character-app-password"
SMTP_FROM_NAME=SRSB Workforce Solutions
SMTP_FROM_EMAIL=your-company-email@example.com
OTP_EXPIRY_MINUTES=10
```

Admin must create each employee with the employee's correct email. The employee proves ownership by receiving the OTP. The application never needs a person to manually verify every email.

## 3. Apply database schema and migrations
From the project root:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\schema.sql
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p srsb_hrms < apps\backend\migrations\003_add_password_changed_at.sql
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p srsb_hrms < apps\backend\migrations\004_create_password_reset_otps.sql
```

If `schema.sql` was already imported, run only migrations that have not yet been applied.

## 4. Run locally
Open three CMD windows in the project root:

```cmd
npm run dev:backend
```

```cmd
npm run dev:frontend
```

```cmd
npm run dev:desktop
```

## 5. Hosting
Host the Express backend and MySQL database on a secure server. Set `CORS_ORIGIN` to the hosted frontend origin. Never upload the real `.env` file to a public repository.

For an Electron-only office deployment, keep the backend hosted and update `VITE_API_URL` in `apps/frontend/.env` to the hosted API URL before building.

```env
VITE_API_URL=https://your-api-domain.example.com/api
```

Then build the Windows desktop installer:

```cmd
npm run build:desktop
```

## Security behaviour included

- Passwords are stored as bcrypt hashes.
- Login accepts Employee ID or registered email.
- Login fields are empty by default.
- Forgot Password sends a six-digit OTP only to the email stored in the employee record.
- OTP expires after ten minutes and has a maximum of five incorrect attempts.
- The response does not reveal whether an account exists.
- Finance navigation and API route are disabled for this release.
