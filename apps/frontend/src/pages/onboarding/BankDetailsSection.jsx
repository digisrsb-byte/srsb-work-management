import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api.js';
import { InfoItem, apiError } from '../admin/assets/assetUi.jsx';
import {
  ACCEPTED_FILE_TYPES,
  ACCOUNT_TYPE_LABELS,
  BankStatusBadge,
  MAX_UPLOAD_MB,
  formatDateTime,
  formatFileSize,
  openBankProof,
  validateUploadFile
} from './onboardingUi.jsx';

const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function formFrom(bank) {
  return {
    accountHolderName: bank?.accountHolderName || '',
    bankName: bank?.bankName || '',
    accountType: bank?.accountType || '',
    ifscCode: bank?.ifscCode || '',
    branchName: bank?.branchName || '',
    accountNumber: '',
    confirmAccountNumber: ''
  };
}

function digitsOnly(value) {
  return value.replace(/[\s-]/g, '');
}

// Mirrors the server rules so mistakes show before saving; the server re-checks everything.
function validateForm(form, { requireComplete, hasSavedNumber, hasProof }) {
  const errors = {};
  const accountNumber = digitsOnly(form.accountNumber);
  const confirm = digitsOnly(form.confirmAccountNumber);
  if (accountNumber || confirm) {
    if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) errors.accountNumber = 'Account number must be 9 to 18 digits.';
    else if (!confirm) errors.confirmAccountNumber = 'Enter the account number again to confirm it.';
    else if (confirm !== accountNumber) errors.confirmAccountNumber = 'The two account numbers do not match.';
  }
  const ifsc = form.ifscCode.trim().toUpperCase();
  if (ifsc && !IFSC_PATTERN.test(ifsc)) {
    errors.ifscCode = 'IFSC code must be 11 characters: 4 letters, then 0, then 6 letters or digits.';
  }
  if (requireComplete) {
    if (!form.accountHolderName.trim()) errors.accountHolderName = 'Account holder name is required.';
    if (!form.bankName.trim()) errors.bankName = 'Bank name is required.';
    if (!form.accountType) errors.accountType = 'Choose Savings or Current.';
    if (!ifsc) errors.ifscCode = 'IFSC code is required.';
    if (!accountNumber && !hasSavedNumber) errors.accountNumber = 'Account number is required.';
    if (!hasProof) errors.proof = 'Upload a cancelled cheque, passbook page or bank statement.';
  }
  return errors;
}

function StatusMessage({ bank }) {
  const review = bank.lastReview;
  if (bank.status === 'VERIFIED') {
    return (
      <div className="review-note review-note-verified">
        <strong>Verified</strong>
        {bank.reviewerName ? ` by ${bank.reviewerName}` : ''} · {formatDateTime(bank.reviewedAt)}. Payroll will use these
        details. Contact HR if they need to change.
      </div>
    );
  }
  if (bank.status === 'CORRECTION_REQUIRED') {
    return (
      <div className="review-note review-note-correction_required">
        <strong>Correction required</strong>
        {review?.reviewerName ? ` by ${review.reviewerName}` : ''} · {formatDateTime(review?.createdAt)}
        {review?.comments ? <div>Reviewer comment: “{review.comments}”</div> : null}
        <div>
          {bank.hasUnsubmittedChanges
            ? 'Your changes are saved but not sent yet. Press Submit for verification.'
            : 'Correct the details or upload a clearer proof, save, then submit again.'}
        </div>
      </div>
    );
  }
  if (bank.status === 'PENDING_VERIFICATION') {
    return (
      <div className="helper-text">
        Submitted {formatDateTime(bank.submittedAt)}. Waiting for an Admin to verify. You can still correct a mistake:
        saving changes withdraws the submission until you submit again.
      </div>
    );
  }
  if (bank.hasUnsubmittedChanges) {
    return (
      <div className="helper-text">
        Draft saved {formatDateTime(bank.updatedAt)}. Not sent yet: complete the details and press{' '}
        <strong>Submit for verification</strong>.
      </div>
    );
  }
  return (
    <div className="helper-text">
      Enter the account your salary should be paid into and upload a cancelled cheque, passbook page or bank statement
      that shows the account holder name and account number.
    </div>
  );
}

export default function BankDetailsSection({ caseId, bank, onChanged }) {
  const [form, setForm] = useState(() => formFrom(bank));
  const [file, setFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setForm(formFrom(bank));
    setFile(null);
  }, [bank]);

  const saved = useMemo(() => formFrom(bank), [bank]);
  const dirty =
    Boolean(file) ||
    Object.keys(saved).some((key) => (form[key] || '') !== (saved[key] || ''));
  const permissions = bank?.permissions || {};
  const canEdit = Boolean(permissions.canEdit);

  function update(field) {
    return (event) => {
      const value = field === 'ifscCode' ? event.target.value.toUpperCase() : event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  function chooseFile(event) {
    const chosen = event.target.files?.[0] || null;
    event.target.value = '';
    if (!chosen) return;
    const invalid = validateUploadFile(chosen);
    setFieldErrors((current) => ({ ...current, proof: invalid || undefined }));
    setFile(invalid ? null : chosen);
  }

  function applyServerError(err, fallback) {
    const fields = err?.response?.data?.details?.fields;
    if (fields) setFieldErrors(fields);
    setError(apiError(err, fallback));
  }

  async function save({ quiet = false } = {}) {
    const errors = validateForm(form, { requireComplete: false });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Please correct the highlighted fields.');
      return null;
    }
    const data = new FormData();
    data.append('accountHolderName', form.accountHolderName);
    data.append('bankName', form.bankName);
    data.append('accountType', form.accountType);
    data.append('ifscCode', form.ifscCode);
    data.append('branchName', form.branchName);
    if (form.accountNumber) {
      data.append('accountNumber', form.accountNumber);
      data.append('confirmAccountNumber', form.confirmAccountNumber);
    }
    if (file) data.append('file', file);
    const response = await api.post(`/onboarding/${caseId}/bank-details`, data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (!quiet) await onChanged(response.data.message);
    return response.data.data;
  }

  async function saveDraft() {
    if (busy) return;
    setBusy('save');
    setError('');
    try {
      await save();
    } catch (err) {
      applyServerError(err, 'Your bank details could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function submit() {
    if (busy) return;
    const errors = validateForm(form, {
      requireComplete: true,
      hasSavedNumber: bank?.hasAccountNumber,
      hasProof: Boolean(file || bank?.proof)
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Complete the highlighted fields before submitting.');
      return;
    }
    if (!window.confirm('Submit your bank details for verification?\n\nAn Admin will check them against your proof document.')) return;
    setBusy('submit');
    setError('');
    try {
      if (dirty || bank?.rowStatus !== 'DRAFT') await save({ quiet: true });
      const response = await api.post(`/onboarding/${caseId}/bank-details/submit`);
      await onChanged(response.data.message);
    } catch (err) {
      applyServerError(err, 'Your bank details could not be submitted.');
      await onChanged(null);
    } finally {
      setBusy('');
    }
  }

  async function openProof() {
    try {
      await openBankProof(caseId, bank.proof);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!bank) return null;

  const proofLine = bank.proof ? (
    <span>
      <button type="button" className="link-button" onClick={openProof}>{bank.proof.originalName}</button>
      {bank.proof.fileSize ? ` · ${formatFileSize(bank.proof.fileSize)}` : ''} · {formatDateTime(bank.proof.uploadedAt)}
    </span>
  ) : (
    'Not uploaded'
  );

  return (
    <section className="card bank-details-card" aria-labelledby="bank-details-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 id="bank-details-title" style={{ margin: 0 }}>Bank Details</h2>
        <BankStatusBadge status={bank.status} />
      </div>
      <p className="helper-text" style={{ margin: '4px 0 12px' }}>
        Used for your salary payments. This is separate from the document checklist below.
      </p>
      <StatusMessage bank={bank} />

      {!canEdit ? (
        <div className="info-grid" style={{ marginTop: 14 }}>
          <InfoItem label="Account holder">{bank.accountHolderName || '—'}</InfoItem>
          <InfoItem label="Bank">{bank.bankName || '—'}</InfoItem>
          <InfoItem label="Account number">{bank.accountNumberMasked || '—'}</InfoItem>
          <InfoItem label="IFSC">{bank.ifscCode || '—'}</InfoItem>
          <InfoItem label="Account type">{ACCOUNT_TYPE_LABELS[bank.accountType] || '—'}</InfoItem>
          <InfoItem label="Branch">{bank.branchName || '—'}</InfoItem>
          <InfoItem label="Bank proof">{proofLine}</InfoItem>
        </div>
      ) : (
        <form
          className="bank-details-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft();
          }}
        >
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="bank-holder">Account holder name</label>
              <input id="bank-holder" className="input" maxLength={160} value={form.accountHolderName} onChange={update('accountHolderName')} />
              {fieldErrors.accountHolderName ? <div className="field-error">{fieldErrors.accountHolderName}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-name">Bank name</label>
              <input id="bank-name" className="input" maxLength={160} value={form.bankName} onChange={update('bankName')} />
              {fieldErrors.bankName ? <div className="field-error">{fieldErrors.bankName}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-account">Account number</label>
              <input
                id="bank-account"
                className="input"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={22}
                placeholder={bank.accountNumberMasked ? `Saved: ${bank.accountNumberMasked}` : ''}
                value={form.accountNumber}
                onChange={update('accountNumber')}
              />
              {bank.accountNumberMasked ? (
                <div className="helper-text">Leave blank to keep the saved account number.</div>
              ) : null}
              {fieldErrors.accountNumber ? <div className="field-error">{fieldErrors.accountNumber}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-account-confirm">Confirm account number</label>
              <input
                id="bank-account-confirm"
                className="input"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={22}
                value={form.confirmAccountNumber}
                onChange={update('confirmAccountNumber')}
                onPaste={(event) => event.preventDefault()}
              />
              <div className="helper-text">Type it again; pasting is disabled here.</div>
              {fieldErrors.confirmAccountNumber ? <div className="field-error">{fieldErrors.confirmAccountNumber}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-ifsc">IFSC code</label>
              <input
                id="bank-ifsc"
                className="input"
                maxLength={11}
                spellCheck={false}
                placeholder="ABCD0123456"
                value={form.ifscCode}
                onChange={update('ifscCode')}
              />
              {fieldErrors.ifscCode ? <div className="field-error">{fieldErrors.ifscCode}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-type">Account type</label>
              <select id="bank-type" className="input" value={form.accountType} onChange={update('accountType')}>
                <option value="">Choose…</option>
                <option value="SAVINGS">Savings</option>
                <option value="CURRENT">Current</option>
              </select>
              {fieldErrors.accountType ? <div className="field-error">{fieldErrors.accountType}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-branch">Branch name (optional)</label>
              <input id="bank-branch" className="input" maxLength={160} value={form.branchName} onChange={update('branchName')} />
              {fieldErrors.branchName ? <div className="field-error">{fieldErrors.branchName}</div> : null}
            </div>
            <div className="form-group">
              <label htmlFor="bank-proof">Bank proof</label>
              <div className="helper-text">
                Current: {proofLine}
                {file ? <div>New file to upload: {file.name} ({formatFileSize(file.size)})</div> : null}
              </div>
              <label className="btn btn-secondary" style={{ justifySelf: 'start', cursor: busy ? 'wait' : 'pointer' }}>
                {bank.proof || file ? 'Replace proof' : 'Upload proof'}
                <input
                  id="bank-proof"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  style={{ display: 'none' }}
                  disabled={Boolean(busy)}
                  onChange={chooseFile}
                />
              </label>
              <div className="helper-text">
                Cancelled cheque, passbook page or bank statement. PDF, JPG, PNG, WEBP or Word, up to {MAX_UPLOAD_MB} MB.
              </div>
              {fieldErrors.proof ? <div className="field-error">{fieldErrors.proof}</div> : null}
            </div>
          </div>

          {error ? <div className="message message-error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button type="submit" className="btn btn-secondary" disabled={Boolean(busy) || !dirty}>
              {busy === 'save' ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(busy) || (bank.rowStatus === 'PENDING_VERIFICATION' && !dirty)}
              onClick={submit}
            >
              {busy === 'submit' ? 'Submitting…' : 'Submit for Verification'}
            </button>
          </div>
        </form>
      )}

      {!canEdit && error ? <div className="message message-error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}
    </section>
  );
}
