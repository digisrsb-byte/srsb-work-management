# Sensitive data encryption — plan, decisions and status

Status: **service and tests prepared; nothing enabled; no migration run; no existing record or file touched.**
Branch: `feature/my-change` (fast-forwarded to `dev` only). `main` is not affected.

## 1. Problem

Bank and identity numbers and onboarding documents are stored in plain form:

| Location | Contents | Current protection |
|---|---|---|
| `employee_bank_details.account_number`, `pan_number`, `uan_number`, `pf_number`, `esi_number` | Bank account, PAN, UAN, PF, ESI numbers | Plain `VARCHAR` |
| `employee_documents.document_number` | Aadhaar, PAN, passport, driving licence numbers | Plain `VARCHAR(100)` |
| `apps/backend/uploads/onboarding/` (+ `document_versions`) | Uploaded ID proofs, bank statements, certificates | Plain files; access-checked, audited, `no-store` download |
| MySQL server | Whole database | No InnoDB/redo/undo/binlog encryption, no keyring, TLS not required |

Related leaks to fix with the rollout:

- `apps/backend/src/middleware/errorHandler.js` logs whole error objects; mysql2 errors include the SQL with bound values.
- `document_versions.stored_name` keeps the uploader's original file name.
- Upload folder path is hard-coded in `apps/backend/src/middleware/upload.js`, so another environment cannot be pointed at its own folder.

## 2. Current environment (checked with `npm run check:env`, classifications only)

- `NODE_ENV=development`, database on this machine (loopback), localhost app URLs, `DEMO_MODE=true`.
- Database name equals the documented production name `srsb_hrms`.
- 14 of 18 employees are not demo-flagged; none of the 5 bank rows belong to demo employees; SMTP is configured.
- No separate staging database exists.

Conclusion: this is a local development instance, but its data cannot be assumed fake. It is **not** a confirmed
staging environment. Treat all existing bank rows and uploads as real personal data: do not display, copy or migrate them.

## 3. Decisions needed (owner: Mohan / management)

| # | Decision | Recommended option | Why |
|---|---|---|---|
| D1 | Where production runs | A dedicated server or VM (office server or cloud VM) running Node under PM2/Windows service behind Nginx with HTTPS, reachable only over VPN/office network as in `docs/DEPLOYMENT.md`; MySQL on the same private network, not exposed to the internet | Matches the existing deployment guide; keeps personal data off the public internet |
| D2 | Where encryption keys live | A managed secret store: the cloud provider's key/secret service (Azure Key Vault, AWS Secrets Manager/KMS, GCP Secret Manager) if production is in the cloud; otherwise a root/Administrator-only environment file outside the app folder, loaded by the service manager, with OS-level disk encryption (BitLocker) | Keys stay out of git, out of the database and out of database backups |
| D3 | Who manages key backups | Two named custodians (e.g. founder + one senior admin). Keys stored in a company password manager vault plus a sealed offline copy, kept separately from database backups; documented rotation (yearly or on staff change) and a recovery drill | A lost key means permanently unreadable data; a key stored next to backups defeats encryption |
| D4 | Which processes need full bank details | None today. Only a future salary bank-transfer file export should decrypt, restricted to Super Admin (optionally Admin with a new `sensitive_data` permission), with a written reason, audit entry, rate limit and no caching. All screens and payslips use last-4 only | Minimises who and what can ever see full numbers |
| D5 | Staging environment | A separate database `srsb_hrms_staging` (ideally on a separate machine), its own `.env`, its own keys and its own uploads folder, seeded only with fictional data | Required before any migration rehearsal |

## 4. Design (implemented as a standalone service)

`apps/backend/src/services/fieldEncryption.js`

- AES-256-GCM with a fresh random 12-byte IV and 16-byte authentication tag per value.
- Each ciphertext is bound to a context such as `employee_bank_details.account_number:<id>` (additional
  authenticated data), so a value copied onto another row or column fails to decrypt.
- Stored field format: `v1:<keyId>:<iv>:<tag>:<ciphertext>`; the key id allows rotation (`needsReencryption`).
- Separate HKDF-derived keys for fields and files from each master key.
- `blindIndex` (HMAC-SHA256 with a separate `BLIND_INDEX_KEY`) for duplicate checks and lookups without decrypting.
- `lastFour` for masked display; values too short to mask are withheld.
- File format: `SRSBENC1 | keyId | iv | tag | ciphertext`, bound to the stored file name.
- Keys load lazily from `FIELD_ENCRYPTION_KEYS`, `FIELD_ENCRYPTION_ACTIVE_KEY_ID`, `BLIND_INDEX_KEY`;
  invalid configuration fails loudly; key material never appears in logs, `util.inspect` or JSON.

Not yet imported by any application code, so app behaviour is unchanged.

Tests: `apps/backend/test/fieldEncryption.test.js` (`npm test`), fictional data only, no database access.

## 5. Rollout plan (each step needs approval)

1. **Staging (D5):** create `srsb_hrms_staging`, separate `.env`, keys and `UPLOADS_DIR`; seed fictional employees, bank rows and files.
2. **Code changes (tested in staging):**
   - Migration `018_encrypt_sensitive_fields.sql` (next free number after `017_onboarding_bank_details.sql`, which already added
     `account_number_enc` / `_last4` / `_hash` to `employee_bank_details`): add nullable `*_enc`, `*_last4`, `*_hash` columns to
     `employee_documents`; `is_encrypted` / key id on `document_versions`; backfill legacy bank rows. No drops.
   - `sensitiveDataService.js`: the only module that encrypts/decrypts; masked getters return last-4 only.
   - `payrollController.getPayslip`: read `*_last4` instead of raw columns (frontend already shows masked values).
   - `upload.js` / `onboardingController.downloadDocument`: encrypt on write with random file names, decrypt in memory on authorised download; configurable `UPLOADS_DIR`.
   - `seedDemo.js`: write through the service.
   - `errorHandler.js` and `auditService.js`: redact SQL values and sensitive keys.
   - `env.js`: validate keys at startup in production.
3. **Backup:** `mysqldump --single-transaction` of the database plus an archive of `uploads/`, stored encrypted, outside the repository, restricted access.
4. **Restore test:** restore into a scratch database; compare row counts and `CHECKSUM TABLE`; must pass before step 5.
5. **Backfill (production, after approval):** `scripts/encrypt-sensitive-data.mjs` with `--dry-run`, batches, one transaction per batch, idempotent, prints counts only; files verified by SHA-256 after decrypt.
6. **Validate:** plaintext count equals encrypted count; 100 % decrypt round-trip; last-4 matches; payslip masked output unchanged.
7. **Switch reads** to encrypted/last-4 columns.
8. **Contract (separate approval, after a sign-off window):** null then drop plaintext columns; delete plaintext files; decide retention of pre-encryption backups.

Rollback: before step 8, revert the code (plaintext still present). After step 8, restore the step-3 backup or decrypt with the key.

## 6. Database-level encryption and TLS

### 6.1 Current state (from `npm run check:db-encryption`, read-only)

Instance checked: the app's configured MySQL server — MySQL 8.0.46 on this machine (loopback), port 3306,
database `srsb_hrms`. Identify any session with `SELECT @@server_uuid, @@port, VERSION();` and compare with the
`server_uuid` printed by the script; the same UUID means the same instance.

| Item | Status |
|---|---|
| `employee_bank_details`, `employee_documents`, `document_versions`, `document_submissions` | `ENCRYPTION=N` |
| All `srsb_hrms` tablespaces | 0 of 56 encrypted; schema default encryption `NO` |
| `default_table_encryption`, `innodb_redo_log_encrypt`, `innodb_undo_log_encrypt`, `binlog_encryption` | `OFF` |
| Keyring | No keyring plugin or component loaded (encryption cannot be enabled yet) |
| Binary log | `log_bin=ON` with `binlog_encryption=OFF`: row changes, including bank rows, are written in plain form |
| Slow query log | `ON`, file output: slow statements are logged with their literal values |
| TLS on server | Available (`have_ssl=YES`, TLS 1.2/1.3, certificate configured) |
| TLS on app connection | Not used — `apps/backend/src/config/database.js` sets no `ssl` option; `require_secure_transport=OFF` |
| Accounts | 1 account, local-only, none require TLS; the app connects as `root` |

MySQL 8.0 reached end of life in April 2026; plan an upgrade to 8.4 LTS, which supports keyring components only.

### 6.2 Prerequisites

1. Decision D1 (where production runs) — database settings must be applied by whoever administers that server.
   If production uses a managed cloud MySQL (Azure Database for MySQL, AWS RDS), storage encryption with a managed
   key and enforced TLS are provider settings and most of 6.3 is replaced by enabling them.
2. A **separate staging MySQL instance** (another machine, VM or container with its own data directory). Keyring,
   redo/undo/binlog encryption and `require_secure_transport` are instance-wide, so a second database on this
   server is not enough.
3. Administrator access to the MySQL configuration and service restart, and an agreed maintenance window
   (loading a keyring component requires a restart).
4. Keyring choice. Community edition: `component_keyring_file`. Keyring file stored outside the data directory,
   readable only by the MySQL service account, on a BitLocker-encrypted volume.
5. Keyring custody (decision D3): back up the keyring file separately from database backups. Losing it makes
   every encrypted tablespace permanently unreadable.
6. A dedicated least-privilege app account (`SELECT, INSERT, UPDATE, DELETE` on `srsb_hrms`) instead of `root`;
   migrations run with a separate admin account.
7. Free disk space at least equal to the largest table (each `ALTER TABLE … ENCRYPTION` rebuilds the table).

### 6.3 Steps (staging first, production only after approval)

At-rest encryption:

1. Back up (6.4) and pass the restore test.
2. Install `component_keyring_file`: a `mysqld.my` manifest next to `mysqld` and a
   `component_keyring_file.cnf` naming the keyring path; restart; confirm
   `performance_schema.keyring_component_status` shows `Component_status = Active`.
3. Back up the keyring file immediately (step 6.2.5).
4. `SET PERSIST` `default_table_encryption=ON`, `table_encryption_privilege_check=ON`,
   `innodb_redo_log_encrypt=ON`, `innodb_undo_log_encrypt=ON`, `binlog_encryption=ON`.
5. `ALTER SCHEMA srsb_hrms DEFAULT ENCRYPTION='Y'`, then `ALTER TABLE … ENCRYPTION='Y'` for every table
   (sensitive tables first), and `ALTER TABLESPACE mysql ENCRYPTION='Y'`.
6. Deal with plaintext history: `FLUSH BINARY LOGS`, then purge older binary logs once a verified backup exists;
   rotate the slow query log and securely delete old files; lower slow-log exposure (disable or restrict access).
7. Verify with `npm run check:db-encryption` (56 of 56 encrypted, settings `ON`, keyring active).
8. Schedule master-key rotation: `ALTER INSTANCE ROTATE INNODB MASTER KEY` and
   `ALTER INSTANCE ROTATE BINLOG MASTER KEY`.

TLS:

1. Issue a server certificate from a company-controlled CA (replace MySQL's auto-generated certificate) and set
   `ssl_ca`, `ssl_cert`, `ssl_key`.
2. Create the app account `REQUIRE SSL` (or `REQUIRE X509`).
3. App change (needs approval): optional `ssl` settings in `database.js` and `scripts/apply-migrations.mjs` from
   `DB_SSL_CA` with certificate verification on; no change when unset.
4. Confirm the app connection shows a non-empty `Ssl_cipher`, then `SET PERSIST require_secure_transport=ON`
   and confirm non-TLS connections are rejected.

### 6.4 Backup, restore and rollback

- Before any change: `mysqldump --single-transaction --routines --triggers --events srsb_hrms`, plus a copy of the
  MySQL configuration file. Dumps are plain SQL even when tables are encrypted, so compress them with AES-256
  (e.g. 7-Zip) and store them outside the repository with restricted access.
- Restore test: load the dump into a scratch database on the staging instance; compare row counts and
  `CHECKSUM TABLE` for every table; run the app smoke tests against it.
- After enabling: take a new backup, back up the keyring file separately, and prove recovery by restoring onto a
  fresh instance that has only the backed-up keyring.
- Rollback: `ALTER TABLE … ENCRYPTION='N'` for every table and `SET PERSIST` the settings back to `OFF`. Keep the
  keyring component loaded until no tablespace is encrypted. TLS rollback: `require_secure_transport=OFF` and
  unset the app's `DB_SSL_*` settings.

### 6.5 Staging tests (fictional data only)

1. Seed the staging instance with fictional employees, bank rows and uploads.
2. Run `npm test`, `npm run check:db-encryption` and the smoke tests in `docs/DEPLOYMENT_PHASES_5_15.md`.
3. Restart MySQL and confirm tables stay readable; start once without keyring access and record the failure mode.
4. Confirm binary logs are unreadable without the keyring.
5. Restore the post-encryption backup onto a fresh instance using only the backed-up keyring.
6. Confirm the app works over TLS and a non-TLS client is rejected.
7. Run the rollback steps and confirm the app still works.

## 7. Risks

- Key loss makes encrypted data unrecoverable (see D3).
- Old backups and copies of the database elsewhere still contain plaintext.
- Encrypted columns cannot be searched or sorted in SQL; use the blind index for equality lookups.
- Aadhaar has low entropy; the blind index is only safe while `BLIND_INDEX_KEY` stays secret.
- Stored PAN values are not in valid PAN format (data quality); they will be encrypted as stored.
- Database-level encryption (InnoDB keyring, TLS) needs server administrator access and is an additional layer, not a replacement: anyone with SQL access (the app, `root`) still reads plain values, so field encryption remains necessary.
- Losing the MySQL keyring file makes the encrypted database unreadable.
- Existing binary logs, slow query logs and old backups already hold plain values and must be rotated or purged.
- MySQL 8.0 is past end of life; the keyring setup should be planned with the 8.4 LTS upgrade.
