# SRSB Work Management

Current fixed source release: **1.2.2**.

This release consolidates the attendance/timezone and recruitment placement-to-invoice fixes that were previously being applied as separate patches.

## Main fixes in 1.2.2

- India wall-clock time is handled consistently for Punch In, Punch Out, attendance correction, attendance calendar and employee dashboard.
- An employee who is punched in today but has not punched out yet is treated as an active/present session instead of an immediate `MISSING_PUNCH` record.
- Attendance corrections preserve the punch value that was not being corrected and validate issue-specific fields.
- Full-day attendance calculation uses one 480-minute threshold in normal punch and correction flows.
- Candidate sourcing cannot become `JOINED` without a completed placement record.
- Selecting `JOINED` from Candidates opens the placement form with company/job role details prefilled.
- Existing inconsistent `JOINED + Placements 0` records show **Complete Placement** so they can be repaired without creating another candidate.
- Invoice candidate selection is limited to completed `JOINED`/`ACTIVE` placements with a joining date and positive Billing CTC.
- Candidate and invoice default dates use India date rather than UTC date.
- Candidate screen encoding artifacts such as `Â·` / `â€”` were removed.

## Validate source

```text
npm run validate:backend
npm run validate:v120
```

The `validate:v120` script name is kept for compatibility, but it validates release **1.2.2**.

## Build Windows desktop installer

Install dependencies once:

```text
npm install
```

Then run:

```text
Build-SRSB-v1.2.2.bat
```

or:

```text
npm run build:desktop
```

The installer is generated under `release` using the version from `package.json`.

## Production database

Do **not** run `database/schema.sql` against an existing Railway production database. The application keeps the existing database and its safe additive migration flow.

## Acceptance testing

Before distributing the installer, complete `ACCEPTANCE-TEST-1.2.2.md`, especially:

1. Punch In -> live work time -> Punch Out.
2. Attendance correction -> Admin approval -> attendance refresh.
3. Candidate -> Job Requirement -> JOINED -> Placement -> Invoice -> Print/PDF.
