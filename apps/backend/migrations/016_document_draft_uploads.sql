USE srsb_hrms;

-- Employee uploads start as UPLOADED (a draft the employee can still replace or remove) and
-- move to SUBMITTED only when the employee presses "Submit for verification".
-- New enum values are appended so existing rows keep their stored values.
ALTER TABLE onboarding_checklist_items
  MODIFY COLUMN status
    ENUM('PENDING','SUBMITTED','VERIFIED','REJECTED','CORRECTION_REQUIRED','NOT_APPLICABLE','UPLOADED')
    NOT NULL DEFAULT 'PENDING';

ALTER TABLE document_submissions
  MODIFY COLUMN latest_status
    ENUM('SUBMITTED','VERIFIED','REJECTED','CORRECTION_REQUIRED','WITHDRAWN','UPLOADED')
    NOT NULL DEFAULT 'SUBMITTED';
