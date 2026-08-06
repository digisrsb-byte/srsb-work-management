# SRSB Work Management 1.2.0

Version 1.2.0 expands the existing Railway-backed desktop application. It does not create a new repository, Railway project, or MySQL database.

## Included changes

### Candidates and placements
- Candidate enrolment date, date of birth, source and source details.
- Sourcing history for multiple client job requirements.
- Working company/job-requirement reference data.
- Placement and employment history with client, designation, joining/leaving dates, CTC, gross salary, recruiter and replacement period.
- Placed-candidate reference data for recruitment invoices.

### Recruitment invoices — Super Admin only
- Invoice access enforced in both frontend and backend for `SUPER_ADMIN`.
- Select one client and one or more candidates placed with that client.
- Recruitment fee from annual CTC percentage, gross-salary percentage, fixed fee or custom fee.
- CGST + SGST, IGST or no GST.
- Invoice preview before saving.
- A4 PDF download and Windows print support.
- Configurable SRSB company, GST, bank, invoice prefix and authorised-signatory details.
- No due-date field and no GST/supporting-file field in the version 1.2.0 invoice form.

Before creating a real invoice, open **Invoices → Invoice Settings** and enter the authorised bank details. Bank account information is deliberately not hard-coded in source control.

### Holiday and greeting calendar
- Monthly calendar and list views.
- Add, edit, move and delete holidays.
- Department-specific or company-wide holidays.
- Editable dashboard greeting text and display dates.
- Employee birthday greeting and candidate birthday reminder cards.

### Tasks
- Edit title, description, assignee, priority, status, progress, start date, due date and remarks.
- Due-date changes require a reason and preserve the original deadline.
- Employees can request an extension; authorised managers can approve or reject it.
- Full change history and task attachments.

### Attendance
- Calendar-only main view for employee and management attendance.
- Green present, red absent, blue holiday, yellow leave, orange half day and grey weekend/future.
- Admin/HR/Manager attendance correction from a selected calendar date.

## Safe database update

The backend runs the additive migration `ensureV120Schema()` during startup. It adds columns/tables and keeps existing users and records.

Do not run `database/schema.sql` against the live Railway database. That file is for a fresh local installation and begins by recreating the database.

## Windows build

Run:

```text
Build-SRSB-v1.2.0.bat
```

Expected output:

```text
release\SRSB-Work-Management-Setup-1.2.0.exe
```

## Deployment order

1. Keep the current production application available.
2. Commit and push the version 1.2.0 source to the existing GitHub `main` branch.
3. Wait for the existing Railway backend deployment to become Active.
4. Run `Verify-Deployed-v1.2.0.bat`.
5. Install and test the new Windows installer with Super Admin, Admin and Employee accounts.
6. Share only the final `.exe` after acceptance testing.

## Required acceptance tests

- Normal Admin cannot see or access Invoices.
- Super Admin can configure invoice settings, preview, download and print an invoice.
- Client state code is retained.
- Candidate sourcing dropdown shows active job requirements.
- Placement history can be added and selected in an invoice.
- Holiday calendar can add/edit/delete and dashboard greeting appears on configured dates.
- Task due date can be edited with a reason; employee extension requests can be reviewed.
- Attendance renders as the colour-coded monthly calendar.
