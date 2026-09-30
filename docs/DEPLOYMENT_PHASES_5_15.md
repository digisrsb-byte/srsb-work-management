# Production deployment preparation (Phase 15)

## Prerequisites

1. MySQL 8.x running and reachable.
2. Node.js 20+ installed.
3. Copy env files:
   - `apps/backend/.env.example` → `apps/backend/.env`
   - `apps/frontend/.env.example` → `apps/frontend/.env`
4. Set strong `JWT_SECRET`, correct DB credentials, SMTP values, and `UPLOAD_MAX_MB`.

## Database

```bat
cd apps\backend
node scripts\setup-local-mysql.mjs
node scripts\apply-migrations.mjs
npm run seed
```

Apply order includes migrations `001`–`007` (companies, onboarding, salary/payroll/assets/access).

## Run (development)

```bat
npm run dev:backend
npm run dev:frontend
npm run dev:desktop
```

## Production API

```bat
cd apps\backend
npm install --omit=dev
npm start
```

Recommended: run behind PM2 / Windows service, reverse proxy (Nginx), HTTPS, and restrict CORS to known origins.

## Security checklist

- Do not commit `.env` or `apps/backend/uploads/`
- Confirm JWT auth on all protected routes
- Confirm company scope for Admin roles
- Confirm export permission is checked separately via `/api/reports/export`
- Confirm payslip and document downloads are authorized
- Confirm locked payroll cannot be edited without Super Admin reopen + audit reason

## Backup

Daily MySQL dump of `srsb_hrms` and backup of `apps/backend/uploads`.

## Smoke tests after deploy

1. Super Admin login with email
2. Employee login with employee ID
3. Create salary setup with PF/ESI/PT set or marked N/A / Details required
4. Create payroll run → calculate → submit → approve → lock → pay
5. Employee opens payslip PDF
6. Register asset → assign → acknowledge → return
7. Admin access request → Super Admin approve/reject
8. Ops reports export CSV/PDF
