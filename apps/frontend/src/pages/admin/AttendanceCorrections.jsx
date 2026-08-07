import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, PencilLine, Search, X, XCircle } from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyManual = {
  employeeId: '',
  date: new Date().toISOString().slice(0, 10),
  punchIn: '',
  punchOut: '',
  status: '',
  remarks: ''
};

const statusOptions = ['PRESENT','HALF_DAY','ABSENT','LEAVE','WEEK_OFF','HOLIDAY','MISSING_PUNCH'];

function formatDateTime(value) {
  if (!value) return '—';

  // Attendance punch times are wall-clock values entered by the employee.
  // Do NOT pass them through new Date(...), because an ISO value such as
  // 2026-08-03T09:30:00.000Z would be displayed as 15:00 in India.
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);

  if (!match) return raw;

  const [, year, month, day, hourText, minute, second = '00'] = match;
  const hour = Number(hourText);
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? 'PM' : 'AM';

  return `${Number(day)}/${Number(month)}/${year}, ${displayHour}:${minute}:${second} ${period}`;
}

export default function AttendanceCorrections() {
  const { user } = useAuth();
  const canCreateManualAttendance = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user?.role);
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [manual, setManual] = useState(emptyManual);
  const [showManual, setShowManual] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [comments, setComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/attendance-corrections', {
        params: { search: debouncedSearch || undefined, status: status || undefined }
      });
      setRequests(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load attendance requests.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  const loadEmployees = useCallback(async () => {
    const response = await api.get('/employees', { params: { status: 'ACTIVE' } });
    setEmployees(response.data.data || []);
  }, []);

  useEffect(() => {
    Promise.all([loadRequests(), loadEmployees()]).catch((requestError) => setError(requestError.response?.data?.message || 'Unable to load attendance information.'));
  }, [loadRequests, loadEmployees]);

  async function review(requestId, decision) {
    try {
      setProcessing(requestId);
      setError('');
      const response = await api.patch(`/attendance-corrections/${requestId}/review`, {
        status: decision,
        reviewerComment: comments[requestId] || ''
      });
      setMessage(response.data.message);
      await loadRequests();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Attendance request could not be reviewed.');
    } finally {
      setProcessing(null);
    }
  }

  async function saveManual(event) {
    event.preventDefault();
    try {
      setProcessing('manual');
      setError('');
      const response = await api.put(`/attendance-corrections/manual/${manual.employeeId}/${manual.date}`, {
        punchIn: manual.punchIn || null,
        punchOut: manual.punchOut || null,
        status: manual.status || null,
        remarks: manual.remarks
      });
      setMessage(response.data.message);
      setManual(emptyManual);
      setShowManual(false);
      await loadRequests();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Attendance could not be updated.');
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">Attendance Control</p><h1 className="page-title">Attendance Corrections</h1><p className="page-subtitle">Review forgotten punches and create audited manual attendance entries.</p></div>
        {canCreateManualAttendance && <button className="btn btn-primary" type="button" onClick={() => setShowManual(true)}><PencilLine size={18} /> Manual Attendance</button>}
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {canCreateManualAttendance && showManual && (
        <form className="card form-card" onSubmit={saveManual}>
          <div className="section-heading"><div><h2>Manual Attendance</h2><p className="page-subtitle">Every manual change is saved in the audit log.</p></div><button className="icon-btn" type="button" onClick={() => setShowManual(false)}><X size={20} /></button></div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Employee *</span><select className="input" value={manual.employeeId} onChange={(event) => setManual((current) => ({ ...current, employeeId: event.target.value }))} required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_id})</option>)}</select></label>
            <label className="form-group"><span>Date *</span><input className="input" type="date" value={manual.date} onChange={(event) => setManual((current) => ({ ...current, date: event.target.value }))} required /></label>
            <label className="form-group"><span>Status</span><select className="input" value={manual.status} onChange={(event) => setManual((current) => ({ ...current, status: event.target.value }))}><option value="">Calculate from punch time</option>{statusOptions.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="form-group"><span>Punch In</span><input className="input" type="time" value={manual.punchIn} onChange={(event) => setManual((current) => ({ ...current, punchIn: event.target.value }))} /></label>
            <label className="form-group"><span>Punch Out</span><input className="input" type="time" value={manual.punchOut} onChange={(event) => setManual((current) => ({ ...current, punchOut: event.target.value }))} /></label>
            <label className="form-group"><span>Remarks</span><input className="input" value={manual.remarks} onChange={(event) => setManual((current) => ({ ...current, remarks: event.target.value }))} placeholder="Reason for manual entry" /></label>
          </div>
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowManual(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={processing === 'manual'}>{processing === 'manual' ? 'Savingâ€¦' : 'Save Attendance'}</button></div>
        </form>
      )}

      <div className="card">
        <div className="toolbar"><div className="search-box"><Search size={18} /><input value={search} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Search employee, issue, date or reason" /></div><select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All requests</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><button className="btn btn-secondary" type="button" onClick={loadRequests} disabled={loading}>{loading ? 'Refreshingâ€¦' : 'Refresh'}</button></div>

        <div className="request-list">
          {!loading && !requests.length && <div className="empty-state"><Clock3 size={34} /><strong>No attendance correction requests found.</strong></div>}
          {requests.map((request) => (
            <article className="request-card-modern" key={request.id}>
              <div className="request-card-header"><div><h3>{request.employee_name}</h3><p>{request.employee_code} Â· {request.designation || 'No designation'}</p></div><span className={`badge badge-${String(request.status).toLowerCase()}`}>{request.status}</span></div>
              <div className="request-detail-grid"><div><span>Date</span><strong>{String(request.correction_date).slice(0, 10)}</strong></div><div><span>Issue</span><strong>{request.issue_type.replaceAll('_', ' ')}</strong></div><div><span>Original Punch In</span><strong>{formatDateTime(request.original_punch_in)}</strong></div><div><span>Original Punch Out</span><strong>{formatDateTime(request.original_punch_out)}</strong></div><div><span>Requested Punch In</span><strong>{formatDateTime(request.requested_punch_in)}</strong></div><div><span>Requested Punch Out</span><strong>{formatDateTime(request.requested_punch_out)}</strong></div></div>
              <div className="request-reason"><strong>Employee reason:</strong> {request.reason}</div>
              {request.status === 'PENDING' ? <><textarea className="input" rows="2" value={comments[request.id] || ''} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Admin comment (optional)" /><div className="card-actions"><button className="btn btn-secondary" type="button" onClick={() => review(request.id, 'REJECTED')} disabled={processing === request.id}><XCircle size={17} /> Reject</button><button className="btn btn-primary" type="button" onClick={() => review(request.id, 'APPROVED')} disabled={processing === request.id}><Check size={17} /> Approve</button></div></> : request.reviewer_comment && <div className="review-note"><strong>Review:</strong> {request.reviewer_comment}</div>}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

