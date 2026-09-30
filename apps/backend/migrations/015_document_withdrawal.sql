USE srsb_hrms;

-- Employees can remove a submitted document before it is reviewed.
-- The file stays in the document history (withdrawn_at is stamped on that version)
-- and the checklist item returns to 'Not submitted'.
ALTER TABLE document_submissions
  MODIFY COLUMN latest_status
    ENUM('SUBMITTED','VERIFIED','REJECTED','CORRECTION_REQUIRED','WITHDRAWN','UPLOADED') NOT NULL DEFAULT 'SUBMITTED';

SET @col_withdrawn := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_versions' AND COLUMN_NAME = 'withdrawn_at'
);
SET @sql_withdrawn := IF(
  @col_withdrawn = 0,
  'ALTER TABLE document_versions ADD COLUMN withdrawn_at DATETIME NULL AFTER uploaded_at',
  'SELECT 1'
);
PREPARE stmt_withdrawn FROM @sql_withdrawn;
EXECUTE stmt_withdrawn;
DEALLOCATE PREPARE stmt_withdrawn;
