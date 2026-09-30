USE srsb_hrms;

-- Employee self-service onboarding.
-- Every document version records how it arrived: uploaded by the employee (normal flow),
-- an exceptional administrative upload (reason required), or a DEMO placeholder.
SET @col_channel := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_versions' AND COLUMN_NAME = 'upload_channel'
);
SET @sql_channel := IF(
  @col_channel = 0,
  "ALTER TABLE document_versions ADD COLUMN upload_channel ENUM('EMPLOYEE','ADMIN_EXCEPTION','DEMO') NOT NULL DEFAULT 'EMPLOYEE' AFTER uploaded_by",
  'SELECT 1'
);
PREPARE stmt_channel FROM @sql_channel;
EXECUTE stmt_channel;
DEALLOCATE PREPARE stmt_channel;

SET @col_reason := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_versions' AND COLUMN_NAME = 'upload_reason'
);
SET @sql_reason := IF(
  @col_reason = 0,
  'ALTER TABLE document_versions ADD COLUMN upload_reason VARCHAR(500) NULL AFTER upload_channel',
  'SELECT 1'
);
PREPARE stmt_reason FROM @sql_reason;
EXECUTE stmt_reason;
DEALLOCATE PREPARE stmt_reason;

UPDATE document_versions dv
INNER JOIN document_submissions ds ON ds.id = dv.submission_id
INNER JOIN onboarding_checklist_items oci ON oci.id = ds.checklist_item_id
INNER JOIN onboarding_cases oc ON oc.id = oci.case_id
SET dv.upload_channel = 'DEMO'
WHERE oc.is_demo = 1 AND dv.upload_channel = 'EMPLOYEE';

-- One onboarding case per candidate, enforced by the database so a repeated
-- Joined action can never create a duplicate (uq_onboarding_employee already
-- guarantees one case per employee).
SET @idx_candidate := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'onboarding_cases' AND INDEX_NAME = 'uq_onboarding_cases_candidate'
);
SET @sql_idx_candidate := IF(
  @idx_candidate = 0,
  'ALTER TABLE onboarding_cases ADD UNIQUE KEY uq_onboarding_cases_candidate (candidate_id)',
  'SELECT 1'
);
PREPARE stmt_idx_candidate FROM @sql_idx_candidate;
EXECUTE stmt_idx_candidate;
DEALLOCATE PREPARE stmt_idx_candidate;
