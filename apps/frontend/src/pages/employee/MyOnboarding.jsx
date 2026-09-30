import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  EmptyState,
  ErrorState,
  InfoItem,
  Modal,
  TableSkeleton,
  apiError,
  formatDate
} from '../admin/assets/assetUi.jsx';
import {
  ACCEPTED_FILE_TYPES,
  CaseStatusBadge,
  DocumentHistory,
  ItemStatusBadge,
  MAX_UPLOAD_MB,
  OWNER_EDITABLE_STATUSES,
  ProgressBar,
  REVIEW_DECISION_LABELS,
  UPLOADABLE_STATUSES,
  formatDateTime,
  formatFileSize,
  openDocumentVersion,
  requiredProgress,
  validateUploadFile
} from '../onboarding/onboardingUi.jsx';
import BankDetailsSection from '../onboarding/BankDetailsSection.jsx';

const GROUPS = [
  { requirement: 'REQUIRED', title: 'Required documents' },
  { requirement: 'OPTIONAL', title: 'Optional documents' },
  { requirement: 'NOT_APPLICABLE', title: 'Not applicable' }
];

function reviewResult(item) {
  if (item.item_status === 'UPLOADED') {
    return (
      <div className="helper-text">
        Uploaded {formatDateTime(item.uploaded_at)}. Not sent yet: press <strong>Submit for verification</strong> at
        the end of this page.
      </div>
    );
  }
  if (item.item_status === 'SUBMITTED') {
    return (
      <div className="helper-text">
        Submitted {formatDateTime(item.uploaded_at)}. Waiting for an Admin to verify it. You can replace or remove it
        until then.
      </div>
    );
  }
  if (!item.last_decision || item.last_reviewed_version_id !== item.version_id) return null;
  return (
    <div className={`review-note review-note-${item.last_decision.toLowerCase()}`}>
      <strong>{REVIEW_DECISION_LABELS[item.last_decision]}</strong>
      {item.last_reviewer_name ? ` by ${item.last_reviewer_name}` : ''} · {formatDateTime(item.last_reviewed_at)}
      {item.last_comments && item.last_decision !== 'VERIFIED' ? <div>Reviewer comment: “{item.last_comments}”</div> : null}
    </div>
  );
}

function ChecklistItem({ item, caseOpen, busy, error, onUpload, onRemove, onOpen, onHistory, onNotApplicable }) {
  const editable = OWNER_EDITABLE_STATUSES.includes(item.item_status);
  const canUpload = caseOpen && (UPLOADABLE_STATUSES.includes(item.item_status) || editable);
  const canRemove = caseOpen && editable && Boolean(item.submission_id);
  const needsAction = ['CORRECTION_REQUIRED', 'REJECTED'].includes(item.item_status);
  const uploadLabel = editable
    ? 'Replace document'
    : needsAction
      ? 'Upload corrected document'
      : 'Upload document';

  return (
    <div className={`checklist-item${needsAction ? ' checklist-item-attention' : ''}`}>
      <div>
        <div className="checklist-item-title">
          {item.label}
          <ItemStatusBadge status={item.item_status} />
        </div>
        <div className="checklist-item-meta">
          {item.original_name ? (
            <div className="helper-text">
              <button type="button" className="link-button" onClick={() => onOpen(item)}>
                {item.original_name}
              </button>
              {' · '}Version {item.version_number}
              {item.file_size ? ` · ${formatFileSize(item.file_size)}` : ''}
              {item.upload_channel === 'ADMIN_EXCEPTION' ? ` · Uploaded by HR: ${item.upload_reason}` : ''}
            </div>
          ) : item.item_status === 'PENDING' ? (
            <div className="helper-text">Not submitted yet.</div>
          ) : null}
          {reviewResult(item)}
        </div>
      </div>

      <div className="checklist-item-actions">
        {canUpload ? (
          <label
            className={`btn ${!editable && (needsAction || item.requirement === 'REQUIRED') ? 'btn-primary' : 'btn-secondary'}`}
            style={{ cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Working…' : uploadLabel}
            <input
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              style={{ display: 'none' }}
              disabled={busy}
              aria-label={`${uploadLabel}: ${item.label}`}
              onChange={(event) => {
                onUpload(item, event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        ) : null}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {canRemove ? (
            <button type="button" className="link-button" disabled={busy} onClick={() => onRemove(item)}>
              Remove
            </button>
          ) : null}
          {item.submission_id ? (
            <button type="button" className="link-button" onClick={() => onHistory(item)}>
              History
            </button>
          ) : null}
          {caseOpen && item.requirement === 'OPTIONAL' && item.item_status === 'PENDING' ? (
            <button type="button" className="link-button" disabled={busy} onClick={() => onNotApplicable(item)}>
              Not applicable to me
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="message message-error checklist-item-error" role="alert">{error}</div> : null}
    </div>
  );
}

export default function MyOnboarding() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [itemErrors, setItemErrors] = useState({});
  const [busyItem, setBusyItem] = useState(null);
  const [history, setHistory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/onboarding/my');
      setData(response.data.data);
    } catch (err) {
      setLoadError(apiError(err, 'Unable to load your onboarding checklist.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setItemError(itemId, text) {
    setItemErrors((current) => ({ ...current, [itemId]: text }));
  }

  async function upload(item, file) {
    if (!file || busyItem) return;
    setMessage('');
    const invalid = validateUploadFile(file);
    if (invalid) {
      setItemError(item.checklist_item_id, invalid);
      return;
    }
    setItemError(item.checklist_item_id, '');
    setBusyItem(item.checklist_item_id);
    try {
      const formData = new FormData();
      formData.append('checklistItemId', item.checklist_item_id);
      formData.append('file', file);
      const response = await api.post(`/onboarding/${data.case.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage(response.data.message);
      await load({ quiet: true });
    } catch (err) {
      setItemError(item.checklist_item_id, apiError(err, 'The document could not be uploaded.'));
    } finally {
      setBusyItem(null);
    }
  }

  async function removeDocument(item) {
    if (busyItem) return;
    if (!window.confirm(`Remove ${item.original_name || item.label}?\n\nThe file stays in the document history and ${item.label} goes back to "Not submitted".`)) return;
    setMessage('');
    setItemError(item.checklist_item_id, '');
    setBusyItem(item.checklist_item_id);
    try {
      const response = await api.post(`/onboarding/documents/${item.submission_id}/withdraw`);
      setMessage(response.data.message);
      await load({ quiet: true });
    } catch (err) {
      setItemError(item.checklist_item_id, apiError(err, 'The document could not be removed.'));
      await load({ quiet: true });
    } finally {
      setBusyItem(null);
    }
  }

  async function submitForVerification(count) {
    if (submitting || busyItem) return;
    if (!window.confirm(`Submit ${count} document${count === 1 ? '' : 's'} for verification?\n\nAn Admin will review them. You can still replace or remove a document until it is reviewed.`)) return;
    setSubmitting(true);
    setMessage('');
    setSubmitError('');
    try {
      const response = await api.post(`/onboarding/${data.case.id}/submit`);
      setMessage(response.data.message);
      await load({ quiet: true });
    } catch (err) {
      setSubmitError(apiError(err, 'Your documents could not be submitted.'));
      await load({ quiet: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function markNotApplicable(item) {
    if (!window.confirm(`Mark ${item.label} as not applicable to you?`)) return;
    setBusyItem(item.checklist_item_id);
    setMessage('');
    try {
      const response = await api.post(`/onboarding/checklist-items/${item.checklist_item_id}/na`);
      setMessage(response.data.message);
      await load({ quiet: true });
    } catch (err) {
      setItemError(item.checklist_item_id, apiError(err, 'The document could not be updated.'));
    } finally {
      setBusyItem(null);
    }
  }

  async function openFile(item, version) {
    try {
      await openDocumentVersion(version?.id || item.version_id, version?.original_name || item.original_name, version?.mime_type || item.mime_type);
    } catch (err) {
      setItemError(item.checklist_item_id, err.message);
    }
  }

  async function openHistory(item) {
    try {
      const response = await api.get(`/onboarding/documents/${item.submission_id}/history`);
      setHistory({ item, ...response.data.data });
    } catch (err) {
      setItemError(item.checklist_item_id, apiError(err, 'Unable to load the document history.'));
    }
  }

  const header = (
    <div className="section-heading" style={{ marginBottom: 0 }}>
      <div>
        <h1 className="page-title">My Onboarding</h1>
        <p className="page-subtitle">Enter your bank details and upload your joining documents here. An Admin verifies each one and lets you know if anything needs to change.</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="grid" style={{ gap: 18 }}>
        {header}
        <div className="card"><TableSkeleton columns={3} rows={6} /></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid" style={{ gap: 18 }}>
        {header}
        <ErrorState message={loadError} onRetry={() => load()} />
      </div>
    );
  }

  if (!data?.case) {
    return (
      <div className="grid" style={{ gap: 18 }}>
        {header}
        <div className="card">
          <EmptyState title="No onboarding checklist yet">
            Your joining checklist appears here once HR marks you as Joined in Recruitment.
          </EmptyState>
        </div>
      </div>
    );
  }

  const onboardingCase = data.case;
  const items = data.items || [];
  const caseOpen = !['ACTIVATED', 'CANCELLED'].includes(onboardingCase.status);
  const progress = requiredProgress(items);
  const needsAction = items.filter((i) => ['CORRECTION_REQUIRED', 'REJECTED'].includes(i.item_status));
  const awaitingReview = items.filter((i) => i.item_status === 'SUBMITTED').length;
  const notSubmitted = items.filter((i) => i.requirement === 'REQUIRED' && i.item_status === 'PENDING').length;
  const drafts = items.filter((i) => i.item_status === 'UPLOADED');
  const missingRequired = items.filter(
    (i) => i.requirement === 'REQUIRED' && ['PENDING', 'CORRECTION_REQUIRED', 'REJECTED'].includes(i.item_status)
  );
  const canSubmit = caseOpen && drafts.length > 0 && missingRequired.length === 0;

  return (
    <div className="grid" style={{ gap: 18 }}>
      {header}

      {user?.must_change_password ? (
        <div className="message message-warning">
          You are signed in with a temporary password. <Link to="/employee/settings">Change your password</Link> to keep your
          account secure.
        </div>
      ) : null}

      {onboardingCase.status === 'ACTIVATED' ? (
        <div className="message message-success" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            Your onboarding is complete. Your account was activated on {formatDateTime(onboardingCase.activated_at)}.
            {user?.onboardingOnly ? ' Sign in again to open the full Employee Portal.' : ''}
          </span>
          {user?.onboardingOnly ? (
            <button type="button" className="btn btn-primary" onClick={logout}>Sign in again</button>
          ) : null}
        </div>
      ) : onboardingCase.status === 'READY' ? (
        <div className="message message-info">
          All your required documents and bank details are verified. HR will activate your account shortly.
        </div>
      ) : needsAction.length ? (
        <div className="message message-error">
          {needsAction.length === 1 ? '1 document needs' : `${needsAction.length} documents need`} your attention:{' '}
          {needsAction.map((i) => i.label).join(', ')}. Read the reviewer&apos;s comment and upload a corrected file.
        </div>
      ) : notSubmitted ? (
        <div className="message message-info">
          Upload your {notSubmitted} remaining required document{notSubmitted === 1 ? '' : 's'}, then press Submit for
          verification at the end of this page.
        </div>
      ) : drafts.length ? (
        <div className="message message-warning">
          {drafts.length === 1 ? '1 document is' : `${drafts.length} documents are`} uploaded but not sent yet. Press{' '}
          <strong>Submit for verification</strong> at the end of this page to send them to the Admin.
        </div>
      ) : awaitingReview ? (
        <div className="message message-info">Your documents are submitted and waiting for Admin verification.</div>
      ) : null}

      {message ? <div className="message message-success" role="status">{message}</div> : null}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{onboardingCase.full_name}</h2>
            <CaseStatusBadge status={onboardingCase.status} />
          </div>
          <div className="info-grid">
            <InfoItem label="Employee ID">{onboardingCase.emp_code}</InfoItem>
            <InfoItem label="Joining date">{formatDate(onboardingCase.joining_date)}</InfoItem>
            <InfoItem label="Designation">{onboardingCase.designation}</InfoItem>
            <InfoItem label="Company">{onboardingCase.company_name}</InfoItem>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Onboarding progress</h2>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {progress.uploaded} of {progress.total} required documents uploaded · {progress.done} verified
          </div>
          <ProgressBar
            done={progress.done}
            pending={progress.uploaded - progress.done}
            total={progress.total}
            label={`${progress.uploaded} of ${progress.total} uploaded, ${progress.done} verified`}
          />
          <div className="progress-legend">
            <span style={{ '--legend-color': 'var(--primary)' }}>Verified by Admin</span>
            <span style={{ '--legend-color': '#93c5fd' }}>Uploaded, awaiting verification</span>
          </div>
          <p className="helper-text" style={{ marginBottom: 0 }}>
            {drafts.length} not sent yet · {awaitingReview} awaiting verification · {needsAction.length} need correction ·{' '}
            {notSubmitted} not uploaded. Accepted files: PDF, JPG, PNG, WEBP or Word, up to {MAX_UPLOAD_MB} MB.
          </p>
        </div>
      </div>

      <BankDetailsSection
        caseId={onboardingCase.id}
        bank={data.bank}
        onChanged={async (text) => {
          if (text) setMessage(text);
          await load({ quiet: true });
        }}
      />

      <div className="card">
        {GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.requirement === group.requirement);
          if (!groupItems.length) return null;
          return (
            <section key={group.requirement} className="checklist-group">
              <h2>{group.title}</h2>
              <div className="checklist-list">
                {groupItems.map((item) => (
                  <ChecklistItem
                    key={item.checklist_item_id}
                    item={item}
                    caseOpen={caseOpen}
                    busy={busyItem === item.checklist_item_id}
                    error={itemErrors[item.checklist_item_id]}
                    onUpload={upload}
                    onRemove={removeDocument}
                    onOpen={(target) => openFile(target)}
                    onHistory={openHistory}
                    onNotApplicable={markNotApplicable}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {caseOpen ? (
          <section className="checklist-group" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h2>Submit for verification</h2>
            {submitError ? (
              <div className="message message-error" role="alert" style={{ marginBottom: 12 }}>{submitError}</div>
            ) : null}
            <p className="helper-text" style={{ marginTop: 0 }}>
              {missingRequired.length
                ? `Upload these required documents first: ${missingRequired.map((i) => i.label).join(', ')}.`
                : drafts.length
                  ? `${drafts.length} uploaded document${drafts.length === 1 ? ' is' : 's are'} ready to send: ${drafts.map((i) => i.label).join(', ')}.`
                  : awaitingReview
                    ? 'Everything you uploaded has been sent to the Admin. Replacing a document makes it ready to submit again.'
                    : 'Upload your documents above, then submit them here.'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSubmit || submitting || Boolean(busyItem)}
              onClick={() => submitForVerification(drafts.length)}
            >
              {submitting
                ? 'Submitting…'
                : `Submit for verification${drafts.length ? ` (${drafts.length})` : ''}`}
            </button>
          </section>
        ) : null}
      </div>

      {history ? (
        <Modal
          title={`${history.item.label}: history`}
          subtitle="Every file you submitted and every review decision is kept."
          onClose={() => setHistory(null)}
        >
          <DocumentHistory history={history} onOpen={(version) => openFile(history.item, version)} />
        </Modal>
      ) : null}
    </div>
  );
}
