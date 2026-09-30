import crypto from 'crypto';
import { blindIndex, lastFour } from './fieldEncryption.js';

// Validation and normalisation for onboarding bank details. Error messages name the field
// only; they never repeat what was typed, so they are safe to return and to log.

export const ACCOUNT_TYPES = ['SAVINGS', 'CURRENT'];
export const EDITABLE_STATUSES = ['DRAFT', 'PENDING_VERIFICATION', 'CORRECTION_REQUIRED'];
export const BANK_BLIND_INDEX_PURPOSE = 'bank_account';

const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const HOLDER_NAME_PATTERN = /^[A-Za-z][A-Za-z .'-]*$/;
const BANK_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,&()'-]*$/;
const MAX_TEXT = 160;

export const FIELD_LABELS = {
  accountHolderName: 'Account holder name',
  bankName: 'Bank name',
  accountNumber: 'Account number',
  confirmAccountNumber: 'Confirm account number',
  ifscCode: 'IFSC code',
  accountType: 'Account type',
  branchName: 'Branch name',
  proof: 'Bank proof'
};

function cleanText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function normalizeAccountNumber(value) {
  if (value == null) return '';
  return String(value).replace(/[\s-]/g, '');
}

export function normalizeIfsc(value) {
  return cleanText(value).replace(/\s/g, '').toUpperCase();
}

function validateName(errors, field, value, pattern, required) {
  if (!value) {
    if (required) errors[field] = `${FIELD_LABELS[field]} is required.`;
    return;
  }
  if (value.length > MAX_TEXT) {
    errors[field] = `${FIELD_LABELS[field]} must be ${MAX_TEXT} characters or fewer.`;
  } else if (pattern && !pattern.test(value)) {
    errors[field] = `${FIELD_LABELS[field]} contains characters that are not allowed.`;
  }
}

/*
 * Validates the Save Draft form. Draft saves may leave fields blank, but anything entered must
 * be well-formed. The account number is optional on later saves (blank keeps the stored one);
 * whenever it is entered, the confirmation must match.
 */
export function validateBankInput(body = {}) {
  const errors = {};
  const values = {
    accountHolderName: cleanText(body.accountHolderName),
    bankName: cleanText(body.bankName),
    ifscCode: normalizeIfsc(body.ifscCode),
    accountType: cleanText(body.accountType).toUpperCase(),
    branchName: cleanText(body.branchName)
  };

  validateName(errors, 'accountHolderName', values.accountHolderName, HOLDER_NAME_PATTERN, false);
  validateName(errors, 'bankName', values.bankName, BANK_NAME_PATTERN, false);
  validateName(errors, 'branchName', values.branchName, BANK_NAME_PATTERN, false);

  if (values.ifscCode && !IFSC_PATTERN.test(values.ifscCode)) {
    errors.ifscCode = 'IFSC code must be 11 characters: 4 letters, then 0, then 6 letters or digits (for example ABCD0123456).';
  }
  if (values.accountType && !ACCOUNT_TYPES.includes(values.accountType)) {
    errors.accountType = 'Account type must be Savings or Current.';
  }

  const accountNumber = normalizeAccountNumber(body.accountNumber);
  const confirmAccountNumber = normalizeAccountNumber(body.confirmAccountNumber);
  if (accountNumber || confirmAccountNumber) {
    if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
      errors.accountNumber = 'Account number must be 9 to 18 digits.';
    } else if (!confirmAccountNumber) {
      errors.confirmAccountNumber = 'Enter the account number again to confirm it.';
    } else if (confirmAccountNumber !== accountNumber) {
      errors.confirmAccountNumber = 'The two account numbers do not match.';
    }
  }

  return { values, accountNumber: errors.accountNumber || errors.confirmAccountNumber ? null : accountNumber || null, errors };
}

// Required fields that are still missing before the saved draft can be submitted.
export function missingForSubmit(row) {
  const checks = [
    ['accountHolderName', row?.account_holder_name],
    ['bankName', row?.bank_name],
    ['accountNumber', row?.account_number_enc],
    ['ifscCode', row?.ifsc_code],
    ['accountType', row?.account_type],
    ['proof', row?.proof_id]
  ];
  return checks.filter(([, value]) => !value).map(([field]) => FIELD_LABELS[field]);
}

// AAD contexts bind each ciphertext to its table, column and owner.
export function onboardingAccountContext(caseId) {
  return `onboarding_bank_details.account_number:case-${caseId}`;
}

export function employeeAccountContext(employeeId) {
  return `employee_bank_details.account_number:employee-${employeeId}`;
}

export function accountNumberHash(accountNumber, keyring) {
  return blindIndex(accountNumber, { purpose: BANK_BLIND_INDEX_PURPOSE, ...(keyring ? { keyring } : {}) });
}

export function accountLastFour(accountNumber) {
  return lastFour(accountNumber);
}

// Constant-time comparison of the verifier's typed number against the stored keyed hash.
export function accountNumberMatches(typed, storedHash, keyring) {
  const normalized = normalizeAccountNumber(typed);
  if (!ACCOUNT_NUMBER_PATTERN.test(normalized) || !storedHash) return false;
  const candidate = Buffer.from(accountNumberHash(normalized, keyring), 'hex');
  const stored = Buffer.from(String(storedHash), 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

/*
 * What the employee and reviewers see. The draft status is shown as "Not submitted", or as
 * "Correction required" when the last review asked for changes that are not resubmitted yet.
 */
export function displayStatus(row, lastDecision) {
  if (!row) return 'NOT_SUBMITTED';
  if (row.status === 'DRAFT') return lastDecision === 'CORRECTION_REQUIRED' ? 'CORRECTION_REQUIRED' : 'NOT_SUBMITTED';
  return row.status;
}
