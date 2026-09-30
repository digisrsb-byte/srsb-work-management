import { Link } from 'react-router-dom';
import api from '../../services/api.js';
import { showDocumentViewer } from '../../components/DocumentViewer.jsx';

export const REVIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
export const ONBOARDING_MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];
export const EXCEPTION_UPLOAD_ROLES = ['SUPER_ADMIN', 'ADMIN'];
// Only these roles verify, reject or waive onboarding documents.
export const DOCUMENT_VERIFIER_ROLES = ['SUPER_ADMIN', 'ADMIN'];
export const UPLOADABLE_STATUSES = ['PENDING', 'CORRECTION_REQUIRED', 'REJECTED'];
// The employee can still replace or remove these until an Admin reviews them.
export const OWNER_EDITABLE_STATUSES = ['UPLOADED', 'SUBMITTED'];

export const CASE_STATUS = {
  PENDING: { label: 'Pending', className: 'badge-pending' },
  IN_PROGRESS: { label: 'In progress', className: 'badge-in_progress' },
  READY: { label: 'Ready to activate', className: 'badge-ready' },
  ACTIVATED: { label: 'Activated', className: 'badge-active' },
  CANCELLED: { label: 'Cancelled', className: 'badge-muted' }
};

export const ITEM_STATUS = {
  PENDING: { label: 'Not submitted', className: 'badge-muted' },
  UPLOADED: { label: 'Uploaded · not submitted yet', className: 'badge-in_progress' },
  SUBMITTED: { label: 'Submitted · awaiting Admin verification', className: 'badge-pending' },
  VERIFIED: { label: 'Verified', className: 'badge-active' },
  REJECTED: { label: 'Rejected', className: 'badge-inactive' },
  CORRECTION_REQUIRED: { label: 'Correction required', className: 'badge-inactive' },
  NOT_APPLICABLE: { label: 'Not applicable', className: 'badge-muted' }
};

export const REVIEW_DECISION_LABELS = {
  VERIFIED: 'Verified',
  CORRECTION_REQUIRED: 'Correction requested',
  REJECTED: 'Rejected'
};

export const REQUIREMENT_LABELS = {
  REQUIRED: 'Required',
  OPTIONAL: 'Optional',
  NOT_APPLICABLE: 'Not applicable'
};

export const UPLOAD_CHANNEL_LABELS = {
  EMPLOYEE: 'Uploaded by the employee',
  ADMIN_EXCEPTION: 'Uploaded by HR (exception)',
  DEMO: 'DEMO placeholder'
};

export const ACCEPTED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';
export const MAX_UPLOAD_MB = 10;
const ACCEPTED_EXTENSIONS = ACCEPTED_FILE_TYPES.split(',');

export function validateUploadFile(file) {
  if (!file) return 'Choose a file to upload.';
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return 'Use a PDF, JPG, PNG, WEBP or Word document.';
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `The file is larger than ${MAX_UPLOAD_MB} MB. Upload a smaller file.`;
  }
  if (file.size === 0) return 'The file is empty.';
  return null;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const BANK_STATUS = {
  NOT_SUBMITTED: { label: 'Not submitted', className: 'badge-muted' },
  PENDING_VERIFICATION: { label: 'Pending verification', className: 'badge-pending' },
  VERIFIED: { label: 'Verified', className: 'badge-active' },
  CORRECTION_REQUIRED: { label: 'Correction required', className: 'badge-inactive' }
};

export const ACCOUNT_TYPE_LABELS = { SAVINGS: 'Savings', CURRENT: 'Current' };

export function BankStatusBadge({ status }) {
  const meta = BANK_STATUS[status] || BANK_STATUS.NOT_SUBMITTED;
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

// Activation blockers mix checklist documents with the bank-details requirement.
export function blockerStatusLabel(blocker) {
  const map = blocker.document_type === 'BANK_DETAILS' ? BANK_STATUS : ITEM_STATUS;
  return map[blocker.status]?.label || blocker.status;
}

export function openDocumentVersion(versionId, fileName, mimeType) {
  return openPrivateFile(`/onboarding/versions/${versionId}/download`, fileName, mimeType);
}

export function openBankProof(caseId, proof) {
  return openPrivateFile(`/onboarding/${caseId}/bank-details/proofs/${proof.id}/download`, proof.originalName || proof.original_name, proof.mimeType || proof.mime_type);
}

// Files are only served through the authorised API; the browser gets a temporary blob URL.
export async function openPrivateFile(url, fileName, mimeType) {
  try {
    const response = await api.get(url, { responseType: 'blob' });
    const type = mimeType || response.data.type;
    const blob = new Blob([response.data], { type });
    if (/^(application\/pdf|image\/)/.test(type || '')) {
      showDocumentViewer({ blob, fileName, mimeType: type });
      return;
    }
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName || 'document';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    let message = err?.response ? 'The document could not be opened.' : 'Cannot reach the server.';
    if (err?.response?.data instanceof Blob) {
      try {
        message = JSON.parse(await err.response.data.text()).message || message;
      } catch {
        // Not a JSON error body; keep the generic message.
      }
    }
    throw new Error(message);
  }
}

export function CaseStatusBadge({ status }) {
  const meta = CASE_STATUS[status] || { label: status || '—', className: 'badge-muted' };
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

export function ItemStatusBadge({ status }) {
  const meta = ITEM_STATUS[status] || { label: status || '—', className: 'badge-muted' };
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

export const INVITATION_STATE = {
  NOT_REQUIRED: { label: 'Password login', className: 'badge-muted', hint: 'This account does not use an activation link.' },
  NOT_SENT: { label: 'Invitation not sent', className: 'badge-inactive', hint: 'No activation email has been delivered yet.' },
  FAILED: { label: 'Email failed', className: 'badge-inactive', hint: 'The activation email could not be sent.' },
  SENT: { label: 'Invitation sent', className: 'badge-pending', hint: 'Waiting for the employee to open the link and create a password.' },
  EXPIRED: { label: 'Invitation expired', className: 'badge-inactive', hint: 'The link expired before it was used.' },
  ACCEPTED: { label: 'Account activated', className: 'badge-active', hint: 'The employee verified their email and created a password.' }
};

export function InvitationBadge({ state }) {
  const meta = INVITATION_STATE[state] || { label: state || '—', className: 'badge-muted', hint: '' };
  return (
    <span className={`badge ${meta.className}`} title={meta.hint}>
      {meta.label}
    </span>
  );
}

// The account is created even when the activation email fails, so that case is a warning, not an error.
export function onboardingResultTone(onboarding) {
  return onboarding?.invitation?.deliveryStatus === 'FAILED' ? 'warning' : 'success';
}

export function OnboardingResultMessage({ message, tone = 'success', caseId, canOpenCase, style }) {
  if (!message) return null;
  return (
    <div className={`message ${tone === 'warning' ? 'message-warning' : 'message-success'}`} style={style}>
      {message}
      {caseId && canOpenCase ? (
        <>
          {' '}
          <Link to={`/admin/onboarding/${caseId}`} style={{ fontWeight: 700 }}>
            Open onboarding checklist
          </Link>
        </>
      ) : null}
    </div>
  );
}

export function DemoBadge() {
  return (
    <span className="badge badge-demo" title="Fictional record for product demos">
      DEMO
    </span>
  );
}

// `done` = verified part (solid); optional `pending` = uploaded but not yet verified (light segment).
export function ProgressBar({ done, total, pending = 0, label }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const pendingPercent = total > 0 ? Math.min(100 - percent, Math.round((pending / total) * 100)) : 0;
  return (
    <div className="progress" aria-label={label || `${done} of ${total} complete`}>
      <div className="progress-track">
        <div
          className={`progress-fill${percent === 100 ? ' progress-fill-done' : ''}`}
          style={{ width: `${percent}%`, ...(pendingPercent ? { borderRadius: '999px 0 0 999px' } : {}) }}
        />
        {pendingPercent ? (
          <div className="progress-fill progress-fill-pending" style={{ width: `${pendingPercent}%` }} />
        ) : null}
      </div>
    </div>
  );
}

// done: verified or not applicable. uploaded: has a file from the employee (draft, submitted or verified).
export function requiredProgress(items) {
  const required = items.filter((item) => item.requirement === 'REQUIRED');
  const done = required.filter((item) => ['VERIFIED', 'NOT_APPLICABLE'].includes(item.item_status)).length;
  const uploaded = required.filter((item) =>
    ['UPLOADED', 'SUBMITTED', 'VERIFIED', 'NOT_APPLICABLE'].includes(item.item_status)
  ).length;
  return { done, uploaded, total: required.length };
}

// Versions and review decisions for one document, newest first.
export function DocumentHistory({ history, onOpen }) {
  const reviewsByVersion = new Map();
  for (const review of history.reviews || []) {
    const list = reviewsByVersion.get(review.version_id) || [];
    list.push(review);
    reviewsByVersion.set(review.version_id, list);
  }

  if (!(history.versions || []).length) {
    return <p className="helper-text">No files have been submitted yet.</p>;
  }

  return (
    <ol className="doc-history">
      {history.versions.map((version) => (
        <li key={version.id} className="doc-history-item">
          <div className="doc-history-head">
            <strong>Version {version.version_number}</strong>
            <span className="helper-text">{formatDateTime(version.uploaded_at)}</span>
          </div>
          <div className="helper-text">
            {onOpen ? (
              <button type="button" className="link-button" onClick={() => onOpen(version)}>
                {version.original_name}
              </button>
            ) : (
              version.original_name
            )}
            {version.file_size ? ` · ${formatFileSize(version.file_size)}` : ''}
            {' · '}
            {UPLOAD_CHANNEL_LABELS[version.upload_channel] || 'Uploaded'}
            {version.uploaded_by_name ? ` (${version.uploaded_by_name})` : ''}
          </div>
          {version.upload_reason && version.upload_channel === 'ADMIN_EXCEPTION' ? (
            <div className="helper-text">Reason: {version.upload_reason}</div>
          ) : null}
          {(reviewsByVersion.get(version.id) || []).map((review) => (
            <div key={review.id} className={`review-note review-note-${review.decision.toLowerCase()}`}>
              <strong>{REVIEW_DECISION_LABELS[review.decision] || review.decision}</strong> by {review.reviewer_name} ·{' '}
              {formatDateTime(review.created_at)}
              {review.comments ? <div>“{review.comments}”</div> : null}
            </div>
          ))}
          {version.withdrawn_at ? (
            <div className="helper-text">Removed by the employee before review · {formatDateTime(version.withdrawn_at)}</div>
          ) : !(reviewsByVersion.get(version.id) || []).length ? (
            <div className="helper-text">Not reviewed.</div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function pdfEscape(text) {
  return String(text).replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/[^\x20-\x7E]/g, '-');
}

// One-page PDF that clearly states it is a placeholder, used for DEMO cases instead of real documents.
export function buildPlaceholderPdf(lines) {
  const content = lines
    .map((line, index) => `BT /F1 ${index === 0 ? 22 : 13} Tf 60 ${720 - index * 30} Td (${pdfEscape(line)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}
