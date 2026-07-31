# Final Password Management Setup

This version does not require SMTP or OTP.

## Final flow

1. Employee clicks **Forgot password?** and enters the Employee ID.
2. The request appears under **Password Management** for Admin/Super Admin.
3. Admin verifies the employee and enters a new password twice.
4. The password is securely hashed and becomes the employee's final active password.
5. Admin shares the password securely with the employee.

## Security rules

- Existing passwords are never visible to Admin or Super Admin.
- The database stores only bcrypt password hashes.
- Only Admin and Super Admin can create, edit, reset, deactivate, or delete employee accounts.
- Only Admin and Super Admin can add or change an employee's official email.
- Admin cannot reset or delete a Super Admin account; only another Super Admin can do that.
- Users cannot delete their own account.

## Database

The backend automatically creates `password_reset_requests` when it starts. The same table is also included in:

- `database/schema.sql`
- `apps/backend/migrations/005_create_password_reset_requests.sql`

## Run

Open three CMD windows from the project folder:

```cmd
npm run dev:backend
```

```cmd
npm run dev:frontend
```

```cmd
npm run dev:desktop
```
