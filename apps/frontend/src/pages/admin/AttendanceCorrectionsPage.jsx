import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AttendanceCorrectionsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get('employeeId') && searchParams.get('date');
  const overrideRef = useRef(null);
  const [override, setOverride] = useState(() => ({
    employeeId: searchParams.get('employeeId') || '',
    date: searchParams.get('date') || new Date().toISOString().slice(0, 10),
    status: 'PRESENT',
    punchIn: searchParams.get('punchIn') || '09:00',
    punchOut: '18:00',
    reason: prefill ? 'Missing punch-out' : ''
  }));

  const canOverride = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user?.role);

  async function load() {
    try {
      setError('');
      const params = statusFilter ? { status: statusFilter } : {};
      const [c, e] = await Promise.all([
        api.get('/attendance/corrections', { params }),
        canOverride ? api.get('/employees') : Promise.resolve({ data: { data: [] } })
      ]);
      setRows(c.data.data || []);
      setEmployees(e.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load correction requests.');
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  useEffect(() => {
    if (prefill && employees.length) {
      overrideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [prefill, employees.length]);

  async function approve(id) {
    try {
      await api.post(`/attendance/corrections/${id}/approve`, { comment: 'Approved' });
      setMessage('Correction approved. Attendance updated.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to approve.');
    }
  }

  async function reject(id) {
    const reason = window.prompt('Rejection reason (required)');
    if (!reason?.trim()) return;
    try {
      await api.post(`/attendance/corrections/${id}/reject`, { reason: reason.trim() });
      setMessage('Correction rejected.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reject.');
    }
  }

  async function saveOverride(event) {
    event.preventDefault();
    try {
      setError('');
      const res = await api.post('/attendance/override', {
        employeeId: Number(override.employeeId),
        date: override.date,
        status: override.status,
        punchIn: override.status === 'ABSENT' ? undefined : override.punchIn,
        punchOut: override.status === 'ABSENT' ? undefined : override.punchOut,
        reason: override.reason
      });
      setMessage(res.data.message || 'Override saved.');
      setOverride((o) => ({ ...o, reason: '' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save override.');
    }
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Attendance Correction Requests</h1>
          <p className="page-subtitle">
            Review employee forgot-punch requests and apply approved attendance updates.
          </p>
        </div>
      </div>

      {message ? <div className="message-success">{message}</div> : null}
      {error ? <div className="message-error">{error}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <label>
          Status filter
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="">All</option>
          </select>
        </label>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Current</th>
                <th>Requested</th>
                <th>In</th>
                <th>Out</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.employee_name}
                    <div style={{ fontSize: 12, color: '#667085' }}>{row.employee_code}</div>
                  </td>
                  <td>{fmtDate(row.correction_date)}</td>
                  <td>{row.current_status || '—'}</td>
                  <td>{row.requested_status}</td>
                  <td>{fmtTime(row.requested_punch_in)}</td>
                  <td>{fmtTime(row.requested_punch_out)}</td>
                  <td>{row.reason}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" type="button" onClick={() => approve(row.id)}>
                          Approve
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => reject(row.id)}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      row.reviewed_by_name || '—'
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9}>No requests found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {canOverride ? (
        <div className="card" ref={overrideRef} style={{ scrollMarginTop: 88 }}>
          <h2>Manual Attendance Override</h2>
          <p className="page-subtitle">Admin/HR/Super Admin only. Reason is mandatory and audited.</p>
          {prefill ? (
            <div className="message message-info" style={{ marginTop: 8 }}>
              Pre-filled from attendance finalization: set the correct punch-out time, check the status, then save.
            </div>
          ) : null}
          <form onSubmit={saveOverride} className="two-col" style={{ marginTop: 12 }}>
            <select
              className="input"
              value={override.employeeId}
              onChange={(e) => setOverride((o) => ({ ...o, employeeId: e.target.value }))}
              required
            >
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_id})
                </option>
              ))}
            </select>
            <input
              className="input"
              type="date"
              value={override.date}
              onChange={(e) => setOverride((o) => ({ ...o, date: e.target.value }))}
              required
            />
            <select
              className="input"
              value={override.status}
              onChange={(e) => setOverride((o) => ({ ...o, status: e.target.value }))}
            >
              <option value="PRESENT">Present</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="ABSENT">Absent</option>
            </select>
            {override.status !== 'ABSENT' ? (
              <>
                <input
                  className="input"
                  type="time"
                  value={override.punchIn}
                  onChange={(e) => setOverride((o) => ({ ...o, punchIn: e.target.value }))}
                  required
                />
                <input
                  className="input"
                  type="time"
                  value={override.punchOut}
                  onChange={(e) => setOverride((o) => ({ ...o, punchOut: e.target.value }))}
                  required
                />
              </>
            ) : null}
            <input
              className="input"
              placeholder="Reason"
              value={override.reason}
              onChange={(e) => setOverride((o) => ({ ...o, reason: e.target.value }))}
              required
            />
            <button className="btn btn-primary" type="submit">
              Save Override
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
