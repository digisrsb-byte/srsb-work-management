import { useCallback, useEffect, useState } from 'react';
import { Clock3, Plus } from 'lucide-react';
import api from '../../services/api.js';

const emptyForm = {
  correctionDate: new Date().toISOString().slice(0, 10),
  issueType: 'FORGOT_PUNCH_OUT',
  requestedPunchIn: '',
  requestedPunchOut: '',
  reason: ''
};

const issues = [
  ['FORGOT_PUNCH_IN', 'Forgot Punch In'],
  ['FORGOT_PUNCH_OUT', 'Forgot Punch Out'],
  ['FORGOT_BOTH', 'Forgot Both'],
  ['INCORRECT_TIME', 'Incorrect Punch Time'],
  ['ATTENDANCE_MISSING', 'Attendance Missing'],
  ['OTHER', 'Other']
];

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

export default function MyAttendanceCorrections() {
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/attendance-corrections/my');
      setRequests(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load your attendance requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const response = await api.post('/attendance-corrections', form);
      setMessage(response.data.message);
      setForm(emptyForm);
      setShowForm(false);
      await loadRequests();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Attendance correction request could not be submitted.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row"><div><p className="eyebrow">Employee Self Service</p><h1 className="page-title">Attendance Correction</h1><p className="page-subtitle">Request Admin support when you forgot a punch or attendance is incorrect.</p></div><button className="btn btn-primary" type="button" onClick={() => setShowForm((current) => !current)}><Plus size={18} /> New Request</button></div>
      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showForm && <form className="card form-card" onSubmit={submit}><div className="form-grid form-grid-3"><label className="form-group"><span>Attendance Date *</span><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={form.correctionDate} onChange={(event) => setForm((current) => ({ ...current, correctionDate: event.target.value }))} required /></label><label className="form-group"><span>Issue *</span><select className="input" value={form.issueType} onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value }))}>{issues.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-group"><span>Requested Punch In</span><input className="input" type="time" value={form.requestedPunchIn} onChange={(event) => setForm((current) => ({ ...current, requestedPunchIn: event.target.value }))} /></label><label className="form-group"><span>Requested Punch Out</span><input className="input" type="time" value={form.requestedPunchOut} onChange={(event) => setForm((current) => ({ ...current, requestedPunchOut: event.target.value }))} /></label><label className="form-group form-span-2"><span>Reason *</span><textarea className="input" rows="3" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required minLength={5} /></label></div><div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Submittingâ€¦' : 'Submit Request'}</button></div></form>}

      <div className="card"><div className="section-heading"><div><h2>My Requests</h2><p className="page-subtitle">Admin-approved requests automatically update your attendance record.</p></div><button className="btn btn-secondary" type="button" onClick={loadRequests} disabled={loading}>{loading ? 'Refreshingâ€¦' : 'Refresh'}</button></div><div className="request-list">{!loading && !requests.length && <div className="empty-state"><Clock3 size={34} /><strong>No correction requests submitted.</strong></div>}{requests.map((request) => <article className="request-card-modern" key={request.id}><div className="request-card-header"><div><h3>{String(request.correction_date).slice(0, 10)}</h3><p>{request.issue_type.replaceAll('_', ' ')}</p></div><span className={`badge badge-${String(request.status).toLowerCase()}`}>{request.status}</span></div><div className="request-detail-grid"><div><span>Requested Punch In</span><strong>{formatDateTime(request.requested_punch_in)}</strong></div><div><span>Requested Punch Out</span><strong>{formatDateTime(request.requested_punch_out)}</strong></div></div><div className="request-reason"><strong>Reason:</strong> {request.reason}</div>{request.reviewer_comment && <div className="review-note"><strong>Admin comment:</strong> {request.reviewer_comment}</div>}</article>)}</div></div>
    </div>
  );
}

