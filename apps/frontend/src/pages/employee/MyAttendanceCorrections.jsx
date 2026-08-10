import { useCallback, useEffect, useState } from 'react';
import { Clock3, Plus } from 'lucide-react';
import api from '../../services/api.js';
import { indiaDateValue, wallClockDateTime } from '../../utils/indiaTime.js';

const emptyForm = {
  correctionDate: indiaDateValue(),
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

const formatDateTime = wallClockDateTime;

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

  const showPunchIn = ['FORGOT_PUNCH_IN', 'FORGOT_BOTH', 'INCORRECT_TIME', 'ATTENDANCE_MISSING', 'OTHER'].includes(form.issueType);
  const showPunchOut = ['FORGOT_PUNCH_OUT', 'FORGOT_BOTH', 'INCORRECT_TIME', 'ATTENDANCE_MISSING', 'OTHER'].includes(form.issueType);
  const requirePunchIn = ['FORGOT_PUNCH_IN', 'FORGOT_BOTH', 'ATTENDANCE_MISSING'].includes(form.issueType);
  const requirePunchOut = ['FORGOT_PUNCH_OUT', 'FORGOT_BOTH', 'ATTENDANCE_MISSING'].includes(form.issueType);

  return (
    <div className="module-page">
      <div className="page-heading-row"><div><p className="eyebrow">Employee Self Service</p><h1 className="page-title">Attendance Correction</h1><p className="page-subtitle">Request Admin support when you forgot a punch or attendance is incorrect.</p></div><button className="btn btn-primary" type="button" onClick={() => setShowForm((current) => !current)}><Plus size={18} /> New Request</button></div>
      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showForm && <form className="card form-card" onSubmit={submit}><div className="form-grid form-grid-3"><label className="form-group"><span>Attendance Date *</span><input className="input" type="date" max={indiaDateValue()} value={form.correctionDate} onChange={(event) => setForm((current) => ({ ...current, correctionDate: event.target.value }))} required /></label><label className="form-group"><span>Issue *</span><select className="input" value={form.issueType} onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value, requestedPunchIn: '', requestedPunchOut: '' }))}>{issues.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{showPunchIn && <label className="form-group"><span>Requested Punch In{requirePunchIn ? ' *' : ''}</span><input className="input" type="time" value={form.requestedPunchIn} onChange={(event) => setForm((current) => ({ ...current, requestedPunchIn: event.target.value }))} required={requirePunchIn} /></label>}{showPunchOut && <label className="form-group"><span>Requested Punch Out{requirePunchOut ? ' *' : ''}</span><input className="input" type="time" value={form.requestedPunchOut} onChange={(event) => setForm((current) => ({ ...current, requestedPunchOut: event.target.value }))} required={requirePunchOut} /></label>}<label className="form-group form-span-2"><span>Reason *</span><textarea className="input" rows="3" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required minLength={5} /></label></div><div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit Request'}</button></div></form>}

      <div className="card"><div className="section-heading"><div><h2>My Requests</h2><p className="page-subtitle">Admin-approved requests automatically update your attendance record.</p></div><button className="btn btn-secondary" type="button" onClick={loadRequests} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div><div className="request-list">{!loading && !requests.length && <div className="empty-state"><Clock3 size={34} /><strong>No correction requests submitted.</strong></div>}{requests.map((request) => <article className="request-card-modern" key={request.id}><div className="request-card-header"><div><h3>{String(request.correction_date).slice(0, 10)}</h3><p>{request.issue_type.replaceAll('_', ' ')}</p></div><span className={`badge badge-${String(request.status).toLowerCase()}`}>{request.status}</span></div><div className="request-detail-grid"><div><span>Requested Punch In</span><strong>{formatDateTime(request.requested_punch_in)}</strong></div><div><span>Requested Punch Out</span><strong>{formatDateTime(request.requested_punch_out)}</strong></div></div><div className="request-reason"><strong>Reason:</strong> {request.reason}</div>{request.reviewer_comment && <div className="review-note"><strong>Admin comment:</strong> {request.reviewer_comment}</div>}</article>)}</div></div>
    </div>
  );
}

