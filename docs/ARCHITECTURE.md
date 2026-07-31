# Architecture

## Frontend

- React + Vite
- React Router
- Axios
- Recharts
- CSS variables for easy colour changes
- Separate admin, manager and employee layouts

## Backend

- Node.js + Express
- MySQL2 connection pool
- JWT authentication
- bcrypt password hashing
- Role-based permissions
- Central error handler
- Request validation
- Audit logging foundation

## Database

The initial schema contains:

- users
- employees
- departments
- attendance
- leave_requests
- attendance_correction_requests
- clients
- job_openings
- candidates
- candidate_applications
- tasks
- monthly_targets
- invoices
- invoice_payments
- expenses
- notifications
- audit_logs

Future changes should be applied through migration files in `database/migrations`.
