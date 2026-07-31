import { useEffect, useState } from 'react';
import {
  Clock3,
  LogIn,
  LogOut,
  CalendarCheck
} from 'lucide-react';
import api from '../../services/api.js';

function hours(minutes = 0) {
  const value = Number(minutes || 0);

  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function formatDate(date) {
  if (!date) return '—';

  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatTime(date) {
  if (!date) return '—';

  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function MyAttendance() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  async function loadAttendance() {
    try {
      setError('');

      const response = await api.get('/dashboard/employee');
      setData(response.data.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to load attendance.'
      );
    }
  }

  useEffect(() => {
    loadAttendance();
  }, []);

  async function punch(endpoint) {
    try {
      setProcessing(true);
      setError('');
      setMessage('');

      const response = await api.post(
        `/attendance/${endpoint}`
      );

      setMessage(response.data.message);
      await loadAttendance();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Attendance action failed.'
      );
    } finally {
      setProcessing(false);
    }
  }

  if (!data) {
    return (
      <div className="attendance-card">
        Loading attendance...
      </div>
    );
  }

  const attendance = data.attendance;
  const hasPunchedIn = Boolean(attendance?.punch_in);
  const hasPunchedOut = Boolean(attendance?.punch_out);

  return (
    <div className="my-attendance-page">
      <div className="attendance-heading">
        <div>
          <p className="attendance-eyebrow">
            Employee Self Service
          </p>

          <h1>My Attendance</h1>

          <span>
            Punch in, punch out and review your attendance
            history.
          </span>
        </div>
      </div>

      {message && (
        <div className="attendance-message success">
          {message}
        </div>
      )}

      {error && (
        <div className="attendance-message error">
          {error}
        </div>
      )}

      <div className="attendance-summary-grid">
        <div className="attendance-summary-card">
          <div>
            <p>Today's Status</p>
            <h3>
              {attendance?.status || 'Not Punched In'}
            </h3>
          </div>

          <div className="attendance-icon">
            <Clock3 size={24} />
          </div>
        </div>

        <div className="attendance-summary-card">
          <div>
            <p>Monthly Work Time</p>
            <h3>{hours(data.monthly?.minutes)}</h3>
          </div>

          <div className="attendance-icon">
            <CalendarCheck size={24} />
          </div>
        </div>

        <div className="attendance-summary-card">
          <div>
            <p>Today's Work Time</p>
            <h3>
              {hours(attendance?.total_work_minutes)}
            </h3>
          </div>

          <div className="attendance-icon">
            <Clock3 size={24} />
          </div>
        </div>
      </div>

      <div className="attendance-main-grid">
        <div className="attendance-card">
          <div className="attendance-card-title">
            <h2>Attendance Actions</h2>
          </div>

          <p className="attendance-help">
            Punch in when your work begins and punch out when
            your workday ends.
          </p>

          <div className="attendance-actions">
            <button
              className="punch-button punch-in"
              type="button"
              disabled={
                processing ||
                hasPunchedIn
              }
              onClick={() => punch('punch-in')}
            >
              <LogIn size={18} />
              {hasPunchedIn
                ? 'Already Punched In'
                : 'Punch In'}
            </button>

            <button
              className="punch-button punch-out"
              type="button"
              disabled={
                processing ||
                !hasPunchedIn ||
                hasPunchedOut
              }
              onClick={() => punch('punch-out')}
            >
              <LogOut size={18} />
              {hasPunchedOut
                ? 'Already Punched Out'
                : 'Punch Out'}
            </button>
          </div>
        </div>

        <div className="attendance-card">
          <div className="attendance-card-title">
            <h2>Today's Attendance</h2>
          </div>

          <div className="today-details">
            <div>
              <span>Punch In</span>
              <strong>
                {formatTime(attendance?.punch_in)}
              </strong>
            </div>

            <div>
              <span>Punch Out</span>
              <strong>
                {formatTime(attendance?.punch_out)}
              </strong>
            </div>

            <div>
              <span>Worked</span>
              <strong>
                {hours(attendance?.total_work_minutes)}
              </strong>
            </div>

            <div>
              <span>Status</span>
              <strong>
                {attendance?.status || 'Not Punched In'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="attendance-card attendance-history">
        <div className="attendance-card-title">
          <h2>Recent Attendance</h2>
        </div>

        <div className="attendance-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Working Hours</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {(data.recentAttendance || []).map((row) => (
                <tr key={`${row.attendance_date}-${row.id || ''}`}>
                  <td>{formatDate(row.attendance_date)}</td>
                  <td>{formatTime(row.punch_in)}</td>
                  <td>{formatTime(row.punch_out)}</td>
                  <td>
                    {hours(row.total_work_minutes)}
                  </td>
                  <td>
                    <span
                      className={`attendance-status ${String(
                        row.status || ''
                      ).toLowerCase()}`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}

              {!data.recentAttendance?.length && (
                <tr>
                  <td colSpan="5" className="empty-row">
                    No attendance records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .my-attendance-page {
          padding: 28px;
        }

        .attendance-heading {
          margin-bottom: 22px;
        }

        .attendance-eyebrow {
          margin: 0 0 6px;
          color: #0f8b8d;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .attendance-heading h1 {
          margin: 0;
          color: #182230;
        }

        .attendance-heading span {
          display: block;
          margin-top: 6px;
          color: #667085;
        }

        .attendance-message {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 14px;
        }

        .attendance-message.success {
          background: #ecfdf3;
          color: #067647;
        }

        .attendance-message.error {
          background: #fff1f1;
          color: #b42318;
        }

        .attendance-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }

        .attendance-summary-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .attendance-summary-card p {
          margin: 0;
          color: #667085;
          font-size: 13px;
          font-weight: 600;
        }

        .attendance-summary-card h3 {
          margin: 8px 0 0;
          color: #182230;
          font-size: 22px;
        }

        .attendance-icon {
          display: grid;
          place-items: center;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: #ccfbf1;
          color: #0f766e;
        }

        .attendance-main-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .attendance-card {
          padding: 22px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .attendance-card-title h2 {
          margin: 0;
          color: #182230;
          font-size: 18px;
        }

        .attendance-help {
          margin: 10px 0 18px;
          color: #667085;
          line-height: 1.6;
        }

        .attendance-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .punch-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 18px;
          border: 0;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .punch-button.punch-in {
          background: #0f8b8d;
          color: white;
        }

        .punch-button.punch-out {
          background: #eef2f6;
          color: #344054;
        }

        .punch-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .today-details {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          margin-top: 18px;
        }

        .today-details div {
          padding: 14px;
          border-radius: 12px;
          background: #f8fafc;
        }

        .today-details span,
        .today-details strong {
          display: block;
        }

        .today-details span {
          color: #667085;
          font-size: 12px;
        }

        .today-details strong {
          margin-top: 6px;
          color: #182230;
        }

        .attendance-history {
          margin-top: 20px;
        }

        .attendance-table-wrapper {
          margin-top: 16px;
          overflow-x: auto;
          border: 1px solid #eaecf0;
          border-radius: 12px;
        }

        .attendance-table-wrapper table {
          width: 100%;
          min-width: 720px;
          border-collapse: collapse;
        }

        .attendance-table-wrapper th {
          padding: 13px 15px;
          background: #f8fafc;
          color: #475467;
          text-align: left;
          font-size: 12px;
          text-transform: uppercase;
        }

        .attendance-table-wrapper td {
          padding: 14px 15px;
          border-top: 1px solid #eaecf0;
          color: #344054;
          font-size: 14px;
        }

        .attendance-status {
          display: inline-block;
          padding: 5px 9px;
          border-radius: 999px;
          background: #eef2f6;
          font-size: 11px;
          font-weight: 800;
        }

        .attendance-status.present {
          background: #ecfdf3;
          color: #067647;
        }

        .attendance-status.absent,
        .attendance-status.missing_punch {
          background: #fff1f1;
          color: #b42318;
        }

        .attendance-status.half_day,
        .attendance-status.leave {
          background: #fff7e6;
          color: #b54708;
        }

        .attendance-status.holiday,
        .attendance-status.week_off {
          background: #eef4ff;
          color: #3538cd;
        }

        .empty-row {
          padding: 35px !important;
          text-align: center;
          color: #667085 !important;
        }

        @media (max-width: 900px) {
          .attendance-summary-grid {
            grid-template-columns: 1fr;
          }

          .attendance-main-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .my-attendance-page {
            padding: 16px;
          }

          .today-details {
            grid-template-columns: 1fr;
          }

          .attendance-actions {
            flex-direction: column;
          }

          .punch-button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}