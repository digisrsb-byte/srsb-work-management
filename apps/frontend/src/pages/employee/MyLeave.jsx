import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Send,
  XCircle
} from 'lucide-react';
import api from '../../services/api.js';

const initialForm = {
  leaveType: 'CASUAL',
  startDate: '',
  endDate: '',
  durationType: 'FULL_DAY',
  reason: ''
};

function formatDate(date) {
  if (!date) return '-';

  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function MyLeave() {
  const [form, setForm] = useState(initialForm);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadLeaves({ silent = false } = {}) {
    try {
      if (!silent) {
        setLoading(true);
      }

      setError('');

      const response = await api.get('/leave/my');
      setLeaves(response.data.data || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to load leave requests.'
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadLeaves();

    const refreshLeaves = () => {
      loadLeaves({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshLeaves();
      }
    };

    const intervalId = window.setInterval(
      refreshLeaves,
      5000
    );

    window.addEventListener('focus', refreshLeaves);
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshLeaves);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await api.post('/leave', form);

      setSuccess('Leave request submitted successfully.');
      setForm(initialForm);
      await loadLeaves({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to submit leave request.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelLeave(id) {
    try {
      setError('');
      setSuccess('');

      await api.patch(`/leave/${id}/cancel`);

      setSuccess('Leave request cancelled successfully.');
      await loadLeaves({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to cancel leave request.'
      );
    }
  }

  return (
    <div className="my-leave-page">
      <div className="leave-heading">
        <div>
          <p className="leave-eyebrow">Employee Self Service</p>
          <h1>My Leave</h1>
          <span>
            Apply for leave and track approval status.
          </span>
        </div>
      </div>

      {error && (
        <div className="leave-message error">
          {error}
        </div>
      )}

      {success && (
        <div className="leave-message success">
          {success}
        </div>
      )}

      <div className="leave-layout">
        <form
          className="leave-card leave-form"
          onSubmit={handleSubmit}
        >
          <div className="card-title">
            <CalendarDays size={20} />
            <h2>Apply for Leave</h2>
          </div>

          <div className="leave-form-grid">
            <div className="leave-field">
              <label>Leave Type</label>

              <select
                name="leaveType"
                value={form.leaveType}
                onChange={handleChange}
              >
                <option value="CASUAL">Casual Leave</option>
                <option value="SICK">Sick Leave</option>
                <option value="EARNED">Earned Leave</option>
                <option value="UNPAID">Unpaid Leave</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="leave-field">
              <label>Duration</label>

              <select
                name="durationType"
                value={form.durationType}
                onChange={handleChange}
              >
                <option value="FULL_DAY">Full Day</option>
                <option value="FIRST_HALF">First Half</option>
                <option value="SECOND_HALF">Second Half</option>
              </select>
            </div>

            <div className="leave-field">
              <label>Start Date</label>

              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                required
              />
            </div>

            <div className="leave-field">
              <label>End Date</label>

              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                required
              />
            </div>

            <div className="leave-field full-width">
              <label>Reason</label>

              <textarea
                name="reason"
                value={form.reason}
                onChange={handleChange}
                rows="4"
                maxLength="500"
                placeholder="Enter the reason for leave"
                required
              />
            </div>
          </div>

          <button
            className="submit-leave-button"
            type="submit"
            disabled={submitting}
          >
            <Send size={17} />
            {submitting
              ? 'Submitting...'
              : 'Submit Leave Request'}
          </button>
        </form>

        <div className="leave-card">
          <div className="card-title">
            <CalendarDays size={20} />
            <h2>Leave History</h2>
          </div>

          {loading ? (
            <div className="leave-empty">
              Loading leave requests...
            </div>
          ) : leaves.length === 0 ? (
            <div className="leave-empty">
              No leave requests found.
            </div>
          ) : (
            <div className="leave-list">
              {leaves.map((leave) => (
                <div
                  className="leave-item"
                  key={leave.id}
                >
                  <div className="leave-item-top">
                    <div>
                      <strong>
                        {leave.leave_type.replaceAll(
                          '_',
                          ' '
                        )}
                      </strong>

                      <span>
                        {formatDate(leave.start_date)}
                        {' — '}
                        {formatDate(leave.end_date)}
                      </span>
                    </div>

                    <span
                      className={`leave-status ${leave.status.toLowerCase()}`}
                    >
                      {leave.status}
                    </span>
                  </div>

                  <div className="leave-details">
                    <p>
                      <strong>Duration:</strong>{' '}
                      {leave.duration_type.replaceAll(
                        '_',
                        ' '
                      )}
                    </p>

                    <p>
                      <strong>Reason:</strong>{' '}
                      {leave.reason}
                    </p>

                    {leave.reviewed_by_name && (
                      <p>
                        <strong>Reviewed by:</strong>{' '}
                        {leave.reviewed_by_name}
                      </p>
                    )}

                    {leave.reviewer_comment && (
                      <p>
                        <strong>Comment:</strong>{' '}
                        {leave.reviewer_comment}
                      </p>
                    )}
                  </div>

                  {leave.status === 'PENDING' && (
                    <button
                      className="cancel-leave-button"
                      type="button"
                      onClick={() =>
                        cancelLeave(leave.id)
                      }
                    >
                      <XCircle size={16} />
                      Cancel Request
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .my-leave-page {
          padding: 28px;
        }

        .leave-heading {
          margin-bottom: 22px;
        }

        .leave-eyebrow {
          margin: 0 0 6px;
          color: #0f8b8d;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .leave-heading h1 {
          margin: 0;
          color: #182230;
        }

        .leave-heading span {
          display: block;
          margin-top: 6px;
          color: #667085;
        }

        .leave-message {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 14px;
        }

        .leave-message.error {
          background: #fff1f1;
          color: #b42318;
        }

        .leave-message.success {
          background: #ecfdf3;
          color: #067647;
        }

        .leave-layout {
          display: grid;
          grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.1fr);
          gap: 20px;
          align-items: start;
        }

        .leave-card {
          background: #ffffff;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          padding: 22px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 18px;
          color: #182230;
        }

        .card-title h2 {
          margin: 0;
          font-size: 18px;
        }

        .leave-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }

        .leave-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .leave-field.full-width {
          grid-column: 1 / -1;
        }

        .leave-field label {
          color: #344054;
          font-size: 13px;
          font-weight: 700;
        }

        .leave-field input,
        .leave-field select,
        .leave-field textarea {
          padding: 11px 12px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
          font: inherit;
          outline: none;
          background: white;
        }

        .leave-field textarea {
          resize: vertical;
        }

        .submit-leave-button,
        .cancel-leave-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .submit-leave-button {
          width: 100%;
          margin-top: 18px;
          padding: 12px 16px;
          background: #0f8b8d;
          color: white;
        }

        .submit-leave-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .leave-list {
          display: flex;
          flex-direction: column;
          gap: 13px;
        }

        .leave-item {
          padding: 16px;
          border: 1px solid #eaecf0;
          border-radius: 12px;
          background: #fafbfc;
        }

        .leave-item-top {
          display: flex;
          justify-content: space-between;
          gap: 15px;
        }

        .leave-item-top strong,
        .leave-item-top span {
          display: block;
        }

        .leave-item-top > div > span {
          margin-top: 4px;
          color: #667085;
          font-size: 13px;
        }

        .leave-status {
          height: fit-content;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .leave-status.pending {
          background: #fff7e6;
          color: #b54708;
        }

        .leave-status.approved {
          background: #ecfdf3;
          color: #067647;
        }

        .leave-status.rejected,
        .leave-status.cancelled {
          background: #fff1f1;
          color: #b42318;
        }

        .leave-details {
          margin-top: 13px;
          color: #475467;
          font-size: 13px;
        }

        .leave-details p {
          margin: 6px 0;
        }

        .cancel-leave-button {
          margin-top: 12px;
          padding: 9px 12px;
          background: #fff1f1;
          color: #b42318;
        }

        .leave-empty {
          padding: 38px 15px;
          text-align: center;
          color: #667085;
        }

        @media (max-width: 900px) {
          .leave-layout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .my-leave-page {
            padding: 16px;
          }

          .leave-form-grid {
            grid-template-columns: 1fr;
          }

          .leave-field.full-width {
            grid-column: auto;
          }
        }
      `}</style>
    </div>
  );
}