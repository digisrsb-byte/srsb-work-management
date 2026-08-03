import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Search,
  RefreshCw,
  CalendarDays,
  Users,
  UserCheck,
  UserX
} from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';

function formatTime(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

function formatDuration(minutes = 0) {
  const total = Number(minutes || 0);
  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceManagement() {
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(getToday());
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const debouncedSearch = useDebouncedValue(search, 300);

  const loadAttendance = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      setError('');

      const params = {};

      if (date) {
        params.date = date;
      }

      if (status) {
        params.status = status;
      }

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

      const response = await api.get('/attendance', { params });

      setRecords(response.data.data || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to load attendance records.'
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [date, status, debouncedSearch]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadAttendance({ silent: true });
    }, 15000);

    const handleFocus = () => {
      loadAttendance({ silent: true });
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadAttendance]);

  const filteredRecords = records;

  const summary = useMemo(() => {
    return {
      total: filteredRecords.length,
      present: filteredRecords.filter(
        (record) => record.status === 'PRESENT'
      ).length,
      halfDay: filteredRecords.filter(
        (record) => record.status === 'HALF_DAY'
      ).length,
      absent: filteredRecords.filter(
        (record) => record.status === 'ABSENT'
      ).length
    };
  }, [filteredRecords]);

  return (
    <div className="attendance-page">
      <div className="section-heading">
        <div>
          <h1 className="page-title">
            Attendance Management
          </h1>

          <p className="page-subtitle">
            View employee punch records and live working time.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            setRefreshing(true);
            await loadAttendance({ silent: true });
            setRefreshing(false);
          }}
          disabled={loading || refreshing}
        >
          <RefreshCw
            size={17}
            className={refreshing ? 'refresh-spin' : ''}
          />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div
          className="message message-error"
          style={{ marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      <div className="attendance-summary-grid">
        <div className="attendance-summary-card">
          <Users size={22} />

          <div>
            <span>Total Records</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="attendance-summary-card">
          <UserCheck size={22} />

          <div>
            <span>Present</span>
            <strong>{summary.present}</strong>
          </div>
        </div>

        <div className="attendance-summary-card">
          <Clock3 size={22} />

          <div>
            <span>Half Day</span>
            <strong>{summary.halfDay}</strong>
          </div>
        </div>

        <div className="attendance-summary-card">
          <UserX size={22} />

          <div>
            <span>Absent</span>
            <strong>{summary.absent}</strong>
          </div>
        </div>
      </div>

      <div className="card attendance-filter-card">
        <div className="attendance-filter-grid">
          <label>
            <span>Date</span>

            <div className="attendance-input-wrap">
              <CalendarDays size={17} />

              <input
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
              />
            </div>
          </label>

          <label>
            <span>Status</span>

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value)
              }
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="ABSENT">Absent</option>
              <option value="LEAVE">Leave</option>
            </select>
          </label>

          <label>
            <span>Search Employee</span>

            <div className="attendance-input-wrap">
              <Search size={17} />

              <input
                type="text"
                value={search}
                onInput={(event) =>
                  setSearch(event.currentTarget.value)
                }
                placeholder="Name, ID or designation"
                autoComplete="off"
                aria-label="Search attendance employees"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Working Time</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>
                      {record.employee_name || '—'}
                    </strong>

                    <div className="attendance-employee-meta">
                      {record.employee_code || '—'}
                      {record.designation
                        ? ` · ${record.designation}`
                        : ''}
                    </div>
                  </td>

                  <td>
                    {formatDate(record.attendance_date)}
                  </td>

                  <td>{formatTime(record.punch_in)}</td>

                  <td>{formatTime(record.punch_out)}</td>

                  <td>
                    <strong>
                      {formatDuration(
                        record.total_work_minutes
                      )}
                    </strong>

                    {!record.punch_out &&
                      record.punch_in && (
                        <div className="attendance-live">
                          Live
                        </div>
                      )}
                  </td>

                  <td>
                    <span
                      className={`badge badge-${String(
                        record.status || ''
                      ).toLowerCase()}`}
                    >
                      {record.status || '—'}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading &&
                filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      No attendance records found.
                    </td>
                  </tr>
                )}

              {loading && (
                <tr>
                  <td colSpan="6">
                    Loading attendance records...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .attendance-page {
          padding: 28px;
        }

        .refresh-spin {
          animation: attendance-spin 0.8s linear infinite;
        }

        @keyframes attendance-spin {
          to { transform: rotate(360deg); }
        }

        .attendance-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .attendance-summary-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 20px;
          background: #ffffff;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .attendance-summary-card svg {
          color: #0f766e;
        }

        .attendance-summary-card span {
          display: block;
          color: #667085;
          font-size: 13px;
        }

        .attendance-summary-card strong {
          display: block;
          margin-top: 4px;
          color: #182230;
          font-size: 24px;
        }

        .attendance-filter-card {
          margin-bottom: 20px;
        }

        .attendance-filter-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .attendance-filter-grid label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: #344054;
          font-size: 13px;
          font-weight: 650;
        }

        .attendance-filter-grid input,
        .attendance-filter-grid select {
          width: 100%;
          min-height: 44px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
          background: #ffffff;
          padding: 10px 12px;
          box-sizing: border-box;
          outline: none;
        }

        .attendance-input-wrap {
          position: relative;
        }

        .attendance-input-wrap svg {
          position: absolute;
          top: 50%;
          left: 12px;
          color: #667085;
          transform: translateY(-50%);
          pointer-events: none;
        }

        .attendance-input-wrap input {
          padding-left: 38px;
        }

        .attendance-employee-meta {
          margin-top: 4px;
          color: #667085;
          font-size: 12px;
        }

        .attendance-live {
          margin-top: 3px;
          color: #0f766e;
          font-size: 11px;
          font-weight: 700;
        }

        @media (max-width: 1000px) {
          .attendance-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .attendance-filter-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .attendance-page {
            padding: 16px;
          }

          .attendance-summary-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}