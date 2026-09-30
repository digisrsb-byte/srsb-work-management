import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ErrorState,
  InfoItem,
  Modal,
  TableSkeleton,
  apiError,
  formatDate
} from './admin/assets/assetUi.jsx';
import {
  ACCEPTED_FILE_TYPES,
  CaseStatusBadge,
  DemoBadge,
  DocumentHistory,
  EXCEPTION_UPLOAD_ROLES,
  INVITATION_STATE,
  ITEM_STATUS,
  InvitationBadge,
  ItemStatusBadge,
  ONBOARDING_MANAGER_ROLES,
  ProgressBar,
  REQUIREMENT_LABELS,
  DOCUMENT_VERIFIER_ROLES,
  REVIEW_DECISION_LABELS,
  UPLOADABLE_STATUSES,
  UPLOAD_CHANNEL_LABELS,
  blockerStatusLabel,
  buildPlaceholderPdf,
  formatDateTime,
  formatFileSize,
  openDocumentVersion,
  requiredProgress,
  validateUploadFile
} from './onboarding/onboardingUi.jsx';
import BankDetailsReview from './onboarding/BankDetailsReview.jsx';

const MIN_REVIEW_COMMENT = 5;
const MIN_EXCEPTION_REASON = 15;
const DEMO_EXCEPTION_REASON = 'DEMO placeholder for a fictional employee';

function ReviewControls({ doc, busy, onReview }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  function submit(decision) {
    const text = comment.trim();
    if (decision !== 'VERIFIED' && text.length < MIN_REVIEW_COMMENT) {
      setError(
        decision === 'REJECTED'
          ? 'Explain why the document is rejected so the employee knows what to upload.'
          : 'Tell the employee what needs to be corrected.'
      );
      return;
    }
    setError('');
    onReview(doc, decision, text).then((ok) => {
      if (ok) setComment('');
    });
  }

  return (
    <div className="review-form">
      <textarea
        className="input"
        placeholder="Comment for the employee (required for correction or rejection)"
        aria-label={`Review comment for ${doc.label}`}
        value={comment}
        maxLength={1000}
        onChange={(e) => setComment(e.target.value)}
      />
      {error ? <div className="field-error" role="alert">{error}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => submit('VERIFIED')}>
          {busy ? 'Saving…' : 'Verify'}
        </button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => submit('CORRECTION_REQUIRED')}>
          Request correction
        </button>
        <button className="btn btn-danger" type="button" disabled={busy} onClick={() => submit('REJECTED')}>
          Reject
        </button>
      </div>
    </div>
  );
}

function ExceptionUploadModal({ onboardingCase, documents, onClose, onUploaded }) {
  const isDemo = Boolean(onboardingCase.is_demo);
  const candidates = documents.filter((d) => UPLOADABLE_STATUSES.includes(d.item_status));
  const [itemId, setItemId] = useState(candidates[0] ? String(candidates[0].checklist_item_id) : '');
  const [reason, setReason] = useState(isDemo ? DEMO_EXCEPTION_REASON : '');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const doc = candidates.find((d) => String(d.checklist_item_id) === itemId);
    if (!doc) {
      setError('Choose the document you are uploading.');
      return;
    }
    if (reason.trim().length < MIN_EXCEPTION_REASON) {
      setError(`Explain why HR is uploading this document instead of the employee (at least ${MIN_EXCEPTION_REASON} characters).`);
      return;
    }
    let upload = file;
    if (isDemo) {
      const blob = buildPlaceholderPdf([
        'DEMO PLACEHOLDER DOCUMENT',
        `Document: ${doc.label}`,
        `Fictional employee: ${onboardingCase.full_name}`,
        'This is not a real identity or personal document.',
        'Generated for SRSB HRMS product demos only.'
      ]);
      upload = new File([blob], `DEMO-${doc.document_type.toLowerCase()}-placeholder.pdf`, { type: 'application/pdf' });
    }
    const invalid = validateUploadFile(upload);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('checklistItemId', doc.checklist_item_id);
      formData.append('reason', reason.trim());
      formData.append('file', upload);
      const response = await api.post(`/onboarding/${onboardingCase.id}/documents/exception`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUploaded(response.data.message);
    } catch (err) {
      setError(apiError(err, 'The document could not be uploaded.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isDemo ? 'Attach DEMO placeholder' : 'Upload on behalf of the employee'}
      subtitle={
        isDemo
          ? 'Attaches a generated placeholder PDF to this fictional case. No real documents are used.'
          : 'Exception only: employees normally upload their own documents. Your name and reason are recorded in the document history and audit log, and the employee is notified.'
      }
      onClose={onClose}
    >
      {candidates.length === 0 ? (
        <p className="helper-text">Every document is already submitted, verified or not applicable.</p>
      ) : (
        <form className="grid" style={{ gap: 12 }} onSubmit={submit}>
          <label>
            <span className="label">Document</span>
            <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {candidates.map((d) => (
                <option key={d.checklist_item_id} value={d.checklist_item_id}>
                  {d.label} ({ITEM_STATUS[d.item_status]?.label})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Reason</span>
            <textarea
              className="input"
              value={reason}
              maxLength={500}
              placeholder="For example: Employee handed over the original at the office and has no scanner."
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {!isDemo ? (
            <label>
              <span className="label">File</span>
              <input
                className="input"
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          ) : null}
          {error ? <div className="message message-error" role="alert">{error}</div> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Uploading…' : isDemo ? 'Attach placeholder' : 'Upload document'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ResendInvitationModal({ onboardingCase, invitation, onClose, onSent }) {
  const [email, setEmail] = useState(invitation?.email || onboardingCase.email || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fallback, setFallback] = useState(null);
  const [copied, setCopied] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError('Enter a valid email address the employee can access.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await api.post(`/onboarding/${onboardingCase.id}/invitation/resend`, { email: value });
      const link = response.data.data?.fallbackActivationUrl;
      if (link) {
        setFallback({ link, message: response.data.message });
        setSaving(false);
        onSent(null);
        return;
      }
      onSent(response.data.message);
    } catch (err) {
      setError(apiError(err, 'The invitation could not be sent.'));
      setSaving(false);
      onSent(null);
    }
  }

  return (
    <Modal
      title="Resend account invitation"
      subtitle="Sends a new single-use activation link. Any earlier link stops working immediately."
      onClose={onClose}
      width={520}
    >
      {fallback ? (
        <div className="grid" style={{ gap: 12 }}>
          <div className="message message-warning" role="alert">{fallback.message}</div>
          <textarea className="input" readOnly value={fallback.link} rows={3} onFocus={(e) => e.target.select()} />
          <p className="helper-text" style={{ margin: 0 }}>
            This link works once, expires like an emailed link, and is shown only because the server runs in
            development mode. Sign out or use a private window before opening it.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fallback.link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button className="btn btn-primary" type="button" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
      <form className="grid" style={{ gap: 12 }} onSubmit={submit}>
        <label>
          <span className="label">Employee email</span>
          <input
            className="input"
            type="email"
            value={email}
            maxLength={160}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <p className="helper-text" style={{ margin: 0 }}>
          Correct the address here if it was wrong. The employee verifies it by opening the link, then creates their own
          password. No password is ever emailed.
        </p>
        {error ? <div className="message message-error" role="alert">{error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Sending…' : 'Send new link'}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}

function AccountAccessCard({ invitation, canResend, onResend }) {
  const latest = invitation.latest;
  const pending = invitation.loginStatus === 'PENDING_ACTIVATION';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Login account</h2>
        <InvitationBadge state={invitation.state} />
      </div>
      <p className="helper-text">{INVITATION_STATE[invitation.state]?.hint}</p>

      {invitation.state === 'FAILED' && latest?.deliveryError ? (
        <div className="message message-error" role="alert" style={{ marginBottom: 12 }}>
          Email not delivered: {latest.deliveryError} Check the address and resend the invitation.
        </div>
      ) : null}
      {invitation.state === 'EXPIRED' ? (
        <div className="message message-warning" style={{ marginBottom: 12 }}>
          The activation link expired on {formatDateTime(latest?.expiresAt)}. Resend the invitation to give the employee a new link.
        </div>
      ) : null}

      <div className="info-grid">
        <InfoItem label="Login">{pending ? 'Pending activation' : 'Active (Employee ID + password)'}</InfoItem>
        <InfoItem label="Email">{invitation.email}</InfoItem>
        <InfoItem label="Email verified">{invitation.emailVerifiedAt ? formatDateTime(invitation.emailVerifiedAt) : 'Not yet'}</InfoItem>
        {latest ? (
          <>
            <InfoItem label="Last invitation">
              {latest.sentAt ? `Sent ${formatDateTime(latest.sentAt)}` : `Created ${formatDateTime(latest.createdAt)}`}
              {latest.createdByName ? ` by ${latest.createdByName}` : ''}
            </InfoItem>
            <InfoItem label={latest.status === 'ACCEPTED' ? 'Accepted' : 'Link expires'}>
              {latest.status === 'ACCEPTED' ? formatDateTime(latest.acceptedAt) : formatDateTime(latest.expiresAt)}
            </InfoItem>
            <InfoItem label="Invitations sent">{latest.count}</InfoItem>
          </>
        ) : null}
      </div>

      {pending && canResend ? (
        <button className="btn btn-primary" type="button" style={{ marginTop: 14 }} onClick={onResend}>
          Resend invitation
        </button>
      ) : null}
      {pending && !canResend ? (
        <p className="helper-text">An Admin, Super Admin or HR user can resend the invitation.</p>
      ) : null}
    </div>
  );
}

function ActivationModal({ onboardingCase, documents, busy, error, onConfirm, onClose }) {
  const required = documents.filter((d) => d.requirement === 'REQUIRED');
  const verified = required.filter((d) => d.item_status === 'VERIFIED').length;
  const notApplicable = required.filter((d) => d.item_status === 'NOT_APPLICABLE').length;
  const optionalVerified = documents.filter((d) => d.requirement !== 'REQUIRED' && d.item_status === 'VERIFIED').length;

  return (
    <Modal title="Activate employee?" subtitle="This gives the employee full access to the Employee Portal." onClose={onClose} width={520}>
      <div className="info-grid" style={{ marginBottom: 14 }}>
        <InfoItem label="Employee">{onboardingCase.full_name}</InfoItem>
        <InfoItem label="Employee ID">{onboardingCase.emp_code}</InfoItem>
        <InfoItem label="Company">{onboardingCase.company_name}</InfoItem>
        <InfoItem label="Joining date">{formatDate(onboardingCase.joining_date)}</InfoItem>
      </div>
      <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
        <li>{verified} of {required.length} required documents verified{notApplicable ? `, ${notApplicable} not applicable` : ''}</li>
        <li>{optionalVerified} optional document{optionalVerified === 1 ? '' : 's'} verified</li>
        {onboardingCase.is_demo ? null : <li>Bank details verified</li>}
        <li>
          {onboardingCase.is_demo
            ? 'DEMO case: the case is closed but the fictional employee keeps an inactive login.'
            : 'The employee status changes to Active and they are notified.'}
        </li>
      </ul>
      {error ? <div className="message message-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={busy}>
          {busy ? 'Activating…' : 'Confirm activation'}
        </button>
      </div>
    </Modal>
  );
}

export default function OnboardingCaseDetail() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const isVerifier = DOCUMENT_VERIFIER_ROLES.includes(user?.role);
  const canManage = ONBOARDING_MANAGER_ROLES.includes(user?.role);
  const canUploadException = EXCEPTION_UPLOAD_ROLES.includes(user?.role);

  const [data, setData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [history, setHistory] = useState(null);
  const [showException, setShowException] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [activateError, setActivateError] = useState('');
  const [showResend, setShowResend] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const [checklistRes, docsRes] = await Promise.all([
        api.get(`/onboarding/${caseId}/checklist`),
        api.get(`/onboarding/${caseId}/documents`)
      ]);
      setData(checklistRes.data.data);
      setDocuments(docsRes.data.data || []);
    } catch (err) {
      setLoadError(apiError(err, 'Unable to load this onboarding case.'));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(key, action) {
    if (busyKey) return false;
    setBusyKey(key);
    setMessage('');
    setError('');
    try {
      const response = await action();
      setMessage(response?.data?.message || 'Saved.');
      await load({ quiet: true });
      return true;
    } catch (err) {
      setError(apiError(err, 'The action could not be completed.'));
      // Another reviewer may have acted on this document; show the latest state.
      if ([404, 409].includes(err?.response?.status)) await load({ quiet: true });
      return false;
    } finally {
      setBusyKey('');
    }
  }

  function review(doc, decision, comments) {
    return runAction(`review-${doc.submission_id}`, () =>
      api.patch(`/onboarding/documents/${doc.submission_id}/review`, {
        decision,
        comments,
        versionId: doc.version_id
      })
    );
  }

  function markNa(doc) {
    if (!window.confirm(`Mark ${doc.label} as not applicable for this employee?`)) return;
    runAction(`na-${doc.checklist_item_id}`, () => api.post(`/onboarding/checklist-items/${doc.checklist_item_id}/na`));
  }

  async function activate() {
    setBusyKey('activate');
    setActivateError('');
    setMessage('');
    setError('');
    try {
      const response = await api.post(`/onboarding/${caseId}/activate`);
      setShowActivate(false);
      setMessage(response.data.message);
      await load({ quiet: true });
    } catch (err) {
      setActivateError(apiError(err, 'The employee could not be activated.'));
      await load({ quiet: true });
    } finally {
      setBusyKey('');
    }
  }

  async function openFile(versionId, name, mimeType) {
    try {
      await openDocumentVersion(versionId, name, mimeType);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openHistory(doc) {
    try {
      const response = await api.get(`/onboarding/documents/${doc.submission_id}/history`);
      setHistory({ label: doc.label, ...response.data.data });
    } catch (err) {
      setError(apiError(err, 'Unable to load document history.'));
    }
  }

  const backLink = <Link className="btn btn-secondary" to="/admin/onboarding">← Back to queue</Link>;

  if (loading) {
    return (
      <div className="card">
        <TableSkeleton columns={5} rows={6} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid" style={{ gap: 14 }}>
        <div style={{ justifySelf: 'start' }}>{backLink}</div>
        <ErrorState message={loadError} onRetry={() => load()} />
      </div>
    );
  }

  const { case: onboardingCase, activation, invitation } = data;
  const isDemo = Boolean(onboardingCase.is_demo);
  const isClosed = ['ACTIVATED', 'CANCELLED'].includes(onboardingCase.status);
  const isOwnCase = Number(user?.id) === Number(onboardingCase.employee_id);
  const canReview = isVerifier && !isClosed && !isOwnCase;
  const progress = requiredProgress(documents);
  const awaitingReview = documents.filter((d) => d.item_status === 'SUBMITTED').length;
  const drafts = documents.filter((d) => d.item_status === 'UPLOADED').length;
  const needsEmployee = documents.filter((d) => ['CORRECTION_REQUIRED', 'REJECTED'].includes(d.item_status)).length;
  const notSubmitted = documents.filter((d) => d.requirement === 'REQUIRED' && d.item_status === 'PENDING').length;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="section-heading" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h1 className="page-title">{onboardingCase.full_name}</h1>
            {isDemo ? <DemoBadge /> : null}
            <CaseStatusBadge status={onboardingCase.status} />
          </div>
          <p className="page-subtitle">
            {onboardingCase.emp_code} · Joining {formatDate(onboardingCase.joining_date)} · Case #{onboardingCase.id}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canUploadException && !isClosed && !isOwnCase ? (
            <button className="btn btn-secondary" type="button" onClick={() => setShowException(true)}>
              {isDemo ? 'Attach DEMO placeholder' : 'Upload on behalf (exception)'}
            </button>
          ) : null}
          {backLink}
        </div>
      </div>

      {isDemo ? (
        <div className="demo-banner" role="note">
          <strong>DEMO case.</strong> This is a fictional employee for product demos with placeholder documents only.
          Never upload real Aadhaar, PAN or other personal documents here.
        </div>
      ) : null}

      {message ? <div className="message message-success" role="status">{message}</div> : null}
      {error ? <ErrorState message={error} /> : null}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Joiner details</h2>
          <div className="info-grid">
            <InfoItem label="Employee ID">{onboardingCase.emp_code}</InfoItem>
            <InfoItem label="Joining date">{formatDate(onboardingCase.joining_date)}</InfoItem>
            <InfoItem label="Designation">{onboardingCase.designation}</InfoItem>
            <InfoItem label="Company">{onboardingCase.company_name}</InfoItem>
            <InfoItem label="Department">{onboardingCase.department_name}</InfoItem>
            <InfoItem label="Email">{onboardingCase.email}</InfoItem>
            <InfoItem label="Account status">
              {onboardingCase.employee_status === 'ACTIVE' ? 'Active' : 'Onboarding access only until activation'}
            </InfoItem>
          </div>
        </div>

        {invitation && !isDemo ? (
          <AccountAccessCard
            invitation={invitation}
            canResend={canManage && onboardingCase.status !== 'CANCELLED'}
            onResend={() => setShowResend(true)}
          />
        ) : null}

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Document progress</h2>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {progress.done} of {progress.total} required documents complete
          </div>
          <ProgressBar done={progress.done} pending={progress.uploaded - progress.done} total={progress.total} />
          <p className="helper-text" style={{ marginTop: 8 }}>
            {awaitingReview} awaiting review · {drafts} uploaded but not submitted by the employee · {needsEmployee}{' '}
            waiting on the employee · {notSubmitted} required not uploaded.
          </p>

          <h2 style={{ marginBottom: 8 }}>Activation</h2>
          {onboardingCase.status === 'ACTIVATED' ? (
            <div className="message message-success">
              Activated {onboardingCase.activated_by_name ? `by ${onboardingCase.activated_by_name} ` : ''}on{' '}
              {formatDateTime(onboardingCase.activated_at)}.
              {isDemo ? ' Demo employees keep an inactive login.' : ' The employee account is active.'}
            </div>
          ) : activation?.allowed ? (
            <>
              <div className="message message-success">
                Ready to activate. Every required document is verified or not applicable
                {isDemo ? '.' : ', and the bank details are verified.'}
              </div>
              {canManage && !isOwnCase ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setActivateError('');
                    setShowActivate(true);
                  }}
                >
                  Activate employee
                </button>
              ) : (
                <p className="helper-text">An Admin, Super Admin or HR user can activate this employee.</p>
              )}
            </>
          ) : (
            <div className="message message-warning">
              Activation becomes available when these requirements are verified or not applicable:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {(activation?.blockers || []).map((b) => (
                  <li key={b.id}>
                    {b.label}: {blockerStatusLabel(b)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <BankDetailsReview
        key={`bank-${onboardingCase.id}-${onboardingCase.status}`}
        caseId={onboardingCase.id}
        isDemo={isDemo}
        onReviewed={async (text) => {
          setError('');
          setMessage(text);
          await load({ quiet: true });
        }}
      />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Submitted documents</h2>
        <p className="helper-text" style={{ marginTop: -6 }}>
          The employee uploads documents from the Employee Portal and can replace or remove a document until it is
          reviewed. An Admin or Super Admin verifies each submission; correction and rejection comments are shown to
          the employee.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Status</th>
                <th>Submission</th>
                <th>Last review</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const reviewable = canReview && doc.submission_id && doc.item_status === 'SUBMITTED';
                const canNa =
                  (doc.requirement === 'REQUIRED' ? isVerifier : canManage) &&
                  !isClosed &&
                  !isOwnCase &&
                  !['NOT_APPLICABLE', 'VERIFIED'].includes(doc.item_status);
                const awaitingVerifier =
                  !isVerifier && !isClosed && doc.submission_id && doc.item_status === 'SUBMITTED';
                const reviewedCurrent = doc.last_decision && doc.last_reviewed_version_id === doc.version_id;

                return (
                  <tr key={doc.checklist_item_id}>
                    <td>
                      <strong>{doc.label}</strong>
                      <div className="helper-text">{REQUIREMENT_LABELS[doc.requirement] || doc.requirement}</div>
                    </td>
                    <td><ItemStatusBadge status={doc.item_status} /></td>
                    <td>
                      {doc.original_name ? (
                        <>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => openFile(doc.version_id, doc.original_name, doc.mime_type)}
                          >
                            {doc.original_name}
                          </button>
                          <div className="helper-text">
                            Version {doc.version_number}
                            {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''} · {formatDateTime(doc.uploaded_at)}
                          </div>
                          <div className="helper-text">
                            {UPLOAD_CHANNEL_LABELS[doc.upload_channel] || 'Uploaded'}
                            {doc.upload_channel === 'ADMIN_EXCEPTION' && doc.uploaded_by_name ? ` (${doc.uploaded_by_name})` : ''}
                          </div>
                          {doc.upload_channel === 'ADMIN_EXCEPTION' && doc.upload_reason ? (
                            <div className="helper-text">Reason: {doc.upload_reason}</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="helper-text">
                          {doc.item_status === 'NOT_APPLICABLE' ? '—' : 'Not submitted by the employee yet'}
                        </span>
                      )}
                    </td>
                    <td>
                      {doc.last_decision ? (
                        <div className={`review-note review-note-${doc.last_decision.toLowerCase()}`} style={{ marginTop: 0 }}>
                          <strong>{REVIEW_DECISION_LABELS[doc.last_decision]}</strong>
                          {reviewedCurrent ? '' : ' (earlier version)'}
                          <div>{doc.last_reviewer_name} · {formatDateTime(doc.last_reviewed_at)}</div>
                          {doc.last_comments ? <div>“{doc.last_comments}”</div> : null}
                        </div>
                      ) : (
                        <span className="helper-text">Not reviewed</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 8, minWidth: 250 }}>
                        {reviewable ? (
                          <ReviewControls
                            doc={doc}
                            busy={Boolean(busyKey)}
                            onReview={review}
                          />
                        ) : awaitingVerifier ? (
                          <span className="helper-text">Awaiting Admin verification</span>
                        ) : doc.item_status === 'UPLOADED' && !isClosed ? (
                          <span className="helper-text">Uploaded by the employee; not submitted for verification yet</span>
                        ) : null}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {doc.submission_id ? (
                            <button className="link-button" type="button" onClick={() => openHistory(doc)}>
                              History
                            </button>
                          ) : null}
                          {canNa ? (
                            <button className="link-button" type="button" disabled={Boolean(busyKey)} onClick={() => markNa(doc)}>
                              Mark not applicable
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {history ? (
        <Modal title={`${history.label}: history`} subtitle="Every submitted version and review decision is kept." onClose={() => setHistory(null)}>
          <DocumentHistory
            history={history}
            onOpen={(version) => openFile(version.id, version.original_name, version.mime_type)}
          />
        </Modal>
      ) : null}

      {showException ? (
        <ExceptionUploadModal
          onboardingCase={onboardingCase}
          documents={documents}
          onClose={() => setShowException(false)}
          onUploaded={async (text) => {
            setShowException(false);
            setError('');
            setMessage(text);
            await load({ quiet: true });
          }}
        />
      ) : null}

      {showResend ? (
        <ResendInvitationModal
          onboardingCase={onboardingCase}
          invitation={invitation}
          onClose={() => setShowResend(false)}
          onSent={async (text) => {
            if (text) {
              setShowResend(false);
              setError('');
              setMessage(text);
            }
            await load({ quiet: true });
          }}
        />
      ) : null}

      {showActivate ? (
        <ActivationModal
          onboardingCase={onboardingCase}
          documents={documents}
          busy={busyKey === 'activate'}
          error={activateError}
          onConfirm={activate}
          onClose={() => setShowActivate(false)}
        />
      ) : null}
    </div>
  );
}
