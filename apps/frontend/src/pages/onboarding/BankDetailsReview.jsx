import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api.js';
import { ErrorState, InfoItem, Modal, TableSkeleton, apiError } from '../admin/assets/assetUi.jsx';
import {
  ACCOUNT_TYPE_LABELS,
  BankStatusBadge,
  REVIEW_DECISION_LABELS,
  formatDateTime,
  formatFileSize,
  openBankProof
} from './onboardingUi.jsx';

const MIN_REVIEW_COMMENT = 5;

function ReviewForm({ bank, busy, onReview }) {
  const [accountCheck, setAccountCheck] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});

  async function submit(decision) {
    const next = {};
    const text = comment.trim();
    if (decision === 'VERIFIED' && !accountCheck.trim()) {
      next.accountNumberCheck = 'Type the account number shown on the proof.';
    }
    if (decision === 'CORRECTION_REQUIRED' && text.length < MIN_REVIEW_COMMENT) {
      next.comments = 'Tell the employee what needs to be corrected.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const result = await onReview({
      decision,
      comments: text || undefined,
      revision: bank.revision,
      accountNumberCheck: decision === 'VERIFIED' ? accountCheck : undefined
    });
    if (result?.fields) setErrors(result.fields);
    if (result?.ok) {
      setAccountCheck('');
      setComment('');
    }
  }

  return (
    <div className="review-form" style={{ marginTop: 14 }}>
      <label className="form-group" style={{ gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Account number on the proof</span>
        <input
          className="input"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={22}
          value={accountCheck}
          onChange={(event) => setAccountCheck(event.target.value)}
        />
        <span className="helper-text">
          Open the proof and type the account number exactly as it appears. It is compared with the employee&apos;s entry
          without either number being shown.
        </span>
      </label>
      {errors.accountNumberCheck ? <div className="field-error" role="alert">{errors.accountNumberCheck}</div> : null}
      <textarea
        className="input"
        placeholder="Comment for the employee (required to request a correction)"
        aria-label="Bank details review comment"
        value={comment}
        maxLength={1000}
        onChange={(event) => setComment(event.target.value)}
      />
      {errors.comments ? <div className="field-error" role="alert">{errors.comments}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => submit('VERIFIED')}>
          {busy ? 'Saving…' : 'Mark Verified'}
        </button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => submit('CORRECTION_REQUIRED')}>
          Request correction
        </button>
      </div>
    </div>
  );
}

function BankHistory({ caseId, history }) {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <h3 style={{ margin: '0 0 8px' }}>Proof files</h3>
        {history.proofs.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {history.proofs.map((proof) => (
              <li key={proof.id}>
                <button type="button" className="link-button" onClick={() => openBankProof(caseId, proof).catch(() => {})}>
                  {proof.original_name}
                </button>{' '}
                · {formatFileSize(proof.file_size)} · {formatDateTime(proof.uploaded_at)}
                {proof.uploaded_by_name ? ` · ${proof.uploaded_by_name}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper-text">No proof uploaded.</p>
        )}
      </div>
      <div>
        <h3 style={{ margin: '0 0 8px' }}>Review decisions</h3>
        {history.reviews.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {history.reviews.map((review) => (
              <li key={review.id}>
                <strong>{REVIEW_DECISION_LABELS[review.decision] || review.decision}</strong> by {review.reviewer_name} ·{' '}
                {formatDateTime(review.created_at)} · account {review.account_number_masked || '—'}
                {review.comments ? <div className="helper-text">“{review.comments}”</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper-text">Not reviewed yet.</p>
        )}
      </div>
    </div>
  );
}

export default function BankDetailsReview({ caseId, isDemo, onReviewed }) {
  const [bank, setBank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const response = await api.get(`/onboarding/${caseId}/bank-details`);
      setBank(response.data.data);
    } catch (err) {
      setLoadError(apiError(err, 'Unable to load the bank details.'));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(body) {
    if (busy) return null;
    setBusy(true);
    setError('');
    try {
      const response = await api.patch(`/onboarding/${caseId}/bank-details/review`, body);
      setBank(response.data.data.bank);
      await onReviewed(response.data.message);
      return { ok: true };
    } catch (err) {
      setError(apiError(err, 'The bank details could not be reviewed.'));
      if ([404, 409].includes(err?.response?.status)) await load();
      return { ok: false, fields: err?.response?.data?.details?.fields };
    } finally {
      setBusy(false);
    }
  }

  async function openProof() {
    try {
      await openBankProof(caseId, bank.proof);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openHistory() {
    try {
      const response = await api.get(`/onboarding/${caseId}/bank-details/history`);
      setHistory(response.data.data);
    } catch (err) {
      setError(apiError(err, 'Unable to load the bank details history.'));
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Bank details</h2>
        {bank ? <BankStatusBadge status={bank.status} /> : null}
      </div>
      <p className="helper-text" style={{ margin: '4px 0 12px' }}>
        Entered by the employee in My Onboarding, separately from the documents. Payroll uses them only after an Admin or
        Super Admin verifies them. The account number is always masked.
        {isDemo ? ' DEMO cases do not need bank details for activation.' : ''}
      </p>

      {loading ? (
        <TableSkeleton columns={3} rows={2} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !bank.rowStatus ? (
        <p className="helper-text" style={{ margin: 0 }}>The employee has not entered bank details yet.</p>
      ) : (
        <>
          <div className="info-grid">
            <InfoItem label="Account holder">{bank.accountHolderName || '—'}</InfoItem>
            <InfoItem label="Bank">{bank.bankName || '—'}</InfoItem>
            <InfoItem label="Account number">{bank.accountNumberMasked || '—'}</InfoItem>
            <InfoItem label="IFSC">{bank.ifscCode || '—'}</InfoItem>
            <InfoItem label="Account type">{ACCOUNT_TYPE_LABELS[bank.accountType] || '—'}</InfoItem>
            <InfoItem label="Branch">{bank.branchName || '—'}</InfoItem>
            <InfoItem label="Bank proof">
              {bank.proof ? (
                <button type="button" className="link-button" onClick={openProof}>{bank.proof.originalName}</button>
              ) : (
                'Not uploaded'
              )}
            </InfoItem>
            <InfoItem label="Submitted">{bank.submittedAt ? formatDateTime(bank.submittedAt) : 'Not submitted yet'}</InfoItem>
          </div>

          {bank.lastReview ? (
            <div className={`review-note review-note-${bank.lastReview.decision.toLowerCase()}`}>
              <strong>{REVIEW_DECISION_LABELS[bank.lastReview.decision]}</strong>
              {bank.lastReview.revision !== bank.revision ? ' (earlier version)' : ''} by {bank.lastReview.reviewerName} ·{' '}
              {formatDateTime(bank.lastReview.createdAt)}
              {bank.lastReview.comments ? <div>“{bank.lastReview.comments}”</div> : null}
            </div>
          ) : null}

          {bank.rowStatus === 'DRAFT' ? (
            <p className="helper-text">The employee is still editing; they have not submitted these details for verification.</p>
          ) : null}
          {bank.rowStatus === 'PENDING_VERIFICATION' && !bank.permissions.canReview ? (
            <p className="helper-text">Awaiting verification by an Admin or Super Admin.</p>
          ) : null}

          {error ? <div className="message message-error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}

          {bank.permissions.canReview ? <ReviewForm bank={bank} busy={busy} onReview={review} /> : null}

          <div style={{ marginTop: 12 }}>
            <button type="button" className="link-button" onClick={openHistory}>History</button>
          </div>
        </>
      )}

      {history ? (
        <Modal title="Bank details: history" subtitle="Every proof file and review decision is kept." onClose={() => setHistory(null)}>
          <BankHistory caseId={caseId} history={history} />
        </Modal>
      ) : null}
    </div>
  );
}
