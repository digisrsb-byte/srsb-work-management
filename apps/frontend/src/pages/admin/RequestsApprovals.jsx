import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  CheckCircle2,
  XCircle,
  CalendarDays,
  Search,
  RefreshCw
} from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';

function formatDate(date) {
  if (!date) return '—';

  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(date) {
  if (!date) return '—';

  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function RequestsApprovals() {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [comments, setComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const debouncedSearch = useDebouncedValue(search, 300);

  const loadRequests = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      setError('');

      const params = {};

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

      const response = await api.get('/leave', { params });

      setRequests(response.data.data || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to load approval requests.'
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = requests;

  const summary = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter(
        (request) => request.status === 'PENDING'
      ).length,
      approved: requests.filter(
        (request) => request.status === 'APPROVED'
      ).length,
      rejected: requests.filter(
        (request) => request.status === 'REJECTED'
      ).length
    };
  }, [requests]);

  function updateComment(id, value) {
    setComments((current) => ({
      ...current,
      [id]: value
    }));
  }

  async function reviewRequest(id, status) {
    try {
      setProcessingId(id);
      setError('');
      setMessage('');

      await api.patch(`/leave/${id}/review`, {
        status,
        reviewerComment: comments[id] || ''
      });

      setMessage(
        status === 'APPROVED'
          ? 'Leave request approved successfully.'
          : 'Leave request rejected successfully.'
      );

      setComments((current) => ({
        ...current,
        [id]: ''
      }));

      await loadRequests();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to review the leave request.'
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="requests-page">
      <div className="requests-heading">
        <div>
          <p className="requests-eyebrow">
            HR Management
          </p>

          <h1>Requests & Approvals</h1>

          <span>
            Review employee leave requests and approval history.
          </span>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            setRefreshing(true);
            await loadRequests({ silent: true });
            setRefreshing(false);
          }}
          disabled={loading || refreshing}
        >
          <RefreshCw
            size={17}
            className={refreshing ? 'request-refresh-spin' : ''}
          />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {message && (
        <div className="requests-message success">
          {message}
        </div>
      )}

      {error && (
        <div className="requests-message error">
          {error}
        </div>
      )}

      <div className="request-summary-grid">
        <div className="request-summary-card">
          <p>Total Requests</p>
          <h3>{summary.total}</h3>
        </div>

        <div className="request-summary-card">
          <p>Pending</p>
          <h3>{summary.pending}</h3>
        </div>

        <div className="request-summary-card">
          <p>Approved</p>
          <h3>{summary.approved}</h3>
        </div>

        <div className="request-summary-card">
          <p>Rejected</p>
          <h3>{summary.rejected}</h3>
        </div>
      </div>

      <div className="request-toolbar">
        <div className="request-search">
          <Search size={18} />

          <input
            type="text"
            value={search}
            onInput={(event) =>
              setSearch(event.currentTarget.value)
            }
            placeholder="Search employee or leave type"
            autoComplete="off"
            aria-label="Search employee or leave type"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.currentTarget.value)
          }
        >
          <option value="ALL">All Requests</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="requests-list">
        {loading ? (
          <div className="request-empty">
            Loading approval requests...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="request-empty">
            No requests found.
          </div>
        ) : (
          filteredRequests.map((request) => (
            <div
              className="request-card"
              key={request.id}
            >
              <div className="request-card-top">
                <div className="request-employee">
                  <div className="request-icon">
                    <CalendarDays size={20} />
                  </div>

                  <div>
                    <h3>{request.employee_name}</h3>

                    <span>
                      {request.employee_code}
                      {request.designation
                        ? ` • ${request.designation}`
                        : ''}
                    </span>
                  </div>
                </div>

                <span
                  className={`request-status ${request.status.toLowerCase()}`}
                >
                  {request.status}
                </span>
              </div>

              <div className="request-details-grid">
                <div>
                  <span>Leave Type</span>
                  <strong>
                    {request.leave_type.replaceAll(
                      '_',
                      ' '
                    )}
                  </strong>
                </div>

                <div>
                  <span>Duration</span>
                  <strong>
                    {request.duration_type.replaceAll(
                      '_',
                      ' '
                    )}
                  </strong>
                </div>

                <div>
                  <span>Start Date</span>
                  <strong>
                    {formatDate(request.start_date)}
                  </strong>
                </div>

                <div>
                  <span>End Date</span>
                  <strong>
                    {formatDate(request.end_date)}
                  </strong>
                </div>
              </div>

              <div className="request-reason">
                <span>Reason</span>
                <p>{request.reason}</p>
              </div>

              {request.status === 'PENDING' ? (
                <div className="request-review">
                  <textarea
                    rows="3"
                    value={comments[request.id] || ''}
                    onChange={(event) =>
                      updateComment(
                        request.id,
                        event.target.value
                      )
                    }
                    placeholder="Add reviewer comment"
                    maxLength="500"
                  />

                  <div className="request-actions">
                    <button
                      type="button"
                      className="approve-button"
                      disabled={
                        processingId === request.id
                      }
                      onClick={() =>
                        reviewRequest(
                          request.id,
                          'APPROVED'
                        )
                      }
                    >
                      <CheckCircle2 size={17} />
                      Approve
                    </button>

                    <button
                      type="button"
                      className="reject-button"
                      disabled={
                        processingId === request.id
                      }
                      onClick={() =>
                        reviewRequest(
                          request.id,
                          'REJECTED'
                        )
                      }
                    >
                      <XCircle size={17} />
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="review-history">
                  <p>
                    <strong>Reviewed by:</strong>{' '}
                    {request.reviewed_by_name || '—'}
                  </p>

                  <p>
                    <strong>Reviewed at:</strong>{' '}
                    {formatDateTime(request.reviewed_at)}
                  </p>

                  {request.reviewer_comment && (
                    <p>
                      <strong>Comment:</strong>{' '}
                      {request.reviewer_comment}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <style>{`
        .requests-page {
          padding: 28px;
        }

        .requests-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
        }

        .request-refresh-spin {
          animation: request-spin 0.8s linear infinite;
        }

        @keyframes request-spin {
          to { transform: rotate(360deg); }
        }

        .requests-eyebrow {
          margin: 0 0 6px;
          color: #0f8b8d;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .requests-heading h1 {
          margin: 0;
          color: #182230;
        }

        .requests-heading span {
          display: block;
          margin-top: 6px;
          color: #667085;
        }

        .requests-message {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 14px;
        }

        .requests-message.success {
          background: #ecfdf3;
          color: #067647;
        }

        .requests-message.error {
          background: #fff1f1;
          color: #b42318;
        }

        .request-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }

        .request-summary-card {
          padding: 19px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 15px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .request-summary-card p {
          margin: 0;
          color: #667085;
          font-size: 13px;
          font-weight: 600;
        }

        .request-summary-card h3 {
          margin: 8px 0 0;
          color: #182230;
          font-size: 25px;
        }

        .request-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
          padding: 16px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 14px;
        }

        .request-search {
          display: flex;
          align-items: center;
          gap: 9px;
          flex: 1;
          max-width: 460px;
          padding: 0 12px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
        }

        .request-search input {
          width: 100%;
          height: 42px;
          border: 0;
          outline: none;
          font: inherit;
        }

        .request-toolbar select {
          min-width: 170px;
          height: 44px;
          padding: 0 12px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
          background: white;
        }

        .requests-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .request-card {
          padding: 21px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .request-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .request-employee {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .request-icon {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #ccfbf1;
          color: #0f766e;
        }

        .request-employee h3 {
          margin: 0;
          color: #182230;
        }

        .request-employee span {
          display: block;
          margin-top: 4px;
          color: #667085;
          font-size: 13px;
        }

        .request-status {
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .request-status.pending {
          background: #fff7e6;
          color: #b54708;
        }

        .request-status.approved {
          background: #ecfdf3;
          color: #067647;
        }

        .request-status.rejected,
        .request-status.cancelled {
          background: #fff1f1;
          color: #b42318;
        }

        .request-details-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 18px;
        }

        .request-details-grid div {
          padding: 13px;
          border-radius: 11px;
          background: #f8fafc;
        }

        .request-details-grid span,
        .request-details-grid strong {
          display: block;
        }

        .request-details-grid span {
          color: #667085;
          font-size: 12px;
        }

        .request-details-grid strong {
          margin-top: 5px;
          color: #182230;
          font-size: 14px;
        }

        .request-reason {
          margin-top: 16px;
        }

        .request-reason span {
          color: #667085;
          font-size: 12px;
          font-weight: 700;
        }

        .request-reason p {
          margin: 6px 0 0;
          color: #344054;
          line-height: 1.6;
        }

        .request-review {
          margin-top: 17px;
        }

        .request-review textarea {
          width: 100%;
          padding: 11px 12px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
          font: inherit;
          resize: vertical;
          box-sizing: border-box;
        }

        .request-actions {
          display: flex;
          gap: 10px;
          margin-top: 12px;
        }

        .approve-button,
        .reject-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 15px;
          border: 0;
          border-radius: 9px;
          font-weight: 700;
          cursor: pointer;
        }

        .approve-button {
          background: #0f8b8d;
          color: white;
        }

        .reject-button {
          background: #fff1f1;
          color: #b42318;
        }

        .approve-button:disabled,
        .reject-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .review-history {
          margin-top: 17px;
          padding: 14px;
          border-radius: 11px;
          background: #f8fafc;
          color: #475467;
          font-size: 13px;
        }

        .review-history p {
          margin: 5px 0;
        }

        .request-empty {
          padding: 60px 20px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          text-align: center;
          color: #667085;
        }

        @media (max-width: 900px) {
          .request-summary-grid,
          .request-details-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .requests-page {
            padding: 16px;
          }

          .request-summary-grid,
          .request-details-grid {
            grid-template-columns: 1fr;
          }

          .request-toolbar {
            flex-direction: column;
          }

          .request-search {
            max-width: none;
          }

          .request-toolbar select {
            width: 100%;
          }

          .request-card-top {
            flex-direction: column;
          }

          .request-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}