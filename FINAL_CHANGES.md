# SRSB Final Account Control Changes

- Forgot Password now creates an Admin request using Employee ID.
- No OTP, SMTP or employee email password is required.
- Admin/Super Admin Password Management page added.
- Admin/Super Admin can set a new final password for an employee.
- Admin/Super Admin can reset passwords directly from the Employees table.
- Admin/Super Admin can edit official email, roles, status, and employee details.
- Admin/Super Admin can delete accounts, subject to Super Admin protections.
- Existing passwords are never displayed because only bcrypt hashes are stored.
- Password request history includes pending/resolved/rejected status and resolving admin.
- Password reset table is created automatically when the backend starts.
