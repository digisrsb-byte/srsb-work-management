import { useEffect, useState } from 'react';

export const ASSET_STATUS_LABELS = {
  AVAILABLE: 'Available',
  ASSIGNED: 'Assigned',
  REPAIR: 'Under Repair',
  LOST: 'Lost',
  RETIRED: 'Retired'
};

const STATUS_BADGE_CLASS = {
  AVAILABLE: 'badge-active',
  ASSIGNED: 'badge-open',
  REPAIR: 'badge-pending',
  LOST: 'badge-inactive',
  RETIRED: 'badge-muted'
};

export const ASSIGNMENT_STATUS_LABELS = {
  ACTIVE: 'Currently assigned',
  RETURNED: 'Returned',
  TRANSFERRED: 'Transferred',
  LOST: 'Lost'
};

export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];

export const CONDITION_LABELS = {
  NEW: 'New',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor (still usable)',
  DAMAGED: 'Damaged'
};

export const REPAIR_OUTCOME_LABELS = {
  REPAIRED: 'Repaired',
  NOT_REPAIRABLE: 'Not repairable',
  CLOSED: 'Closed'
};

export function AssetStatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_BADGE_CLASS[status] || 'badge-muted'}`}>
      {ASSET_STATUS_LABELS[status] || status || '—'}
    </span>
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function toDateInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayInput() {
  return toDateInput(new Date());
}

export function formatMoney(value) {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  });
}

export function itemCountLabel(count) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

export function makeModel(asset) {
  return [asset?.make, asset?.model].filter(Boolean).join(' ') || '—';
}

export function assetTitle(asset) {
  return asset?.asset_name || asset?.category || asset?.asset_tag || 'Asset';
}

export function apiError(err, fallback) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response) return fallback;
  return 'Cannot reach the server. Check your connection and that the HRMS backend is running, then try again.';
}

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function TableSkeleton({ columns = 5, rows = 4 }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((__, col) => (
                <td key={col}>
                  <div className="skeleton" style={{ width: `${55 + ((row + col) % 4) * 10}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="message message-error" role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span>{message}</span>
      {onRetry ? (
        <button className="btn btn-secondary" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function InfoItem({ label, children }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="value">{children || '—'}</div>
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, width = 640 }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="asset-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card asset-modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="asset-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
