import { useEffect, useMemo, useState } from 'react';
import { KeyRound, XCircle } from 'lucide-react';
import api from '../../services/api.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default function PasswordManagement() {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get('/employees/password-reset-requests');
      setRequests(response.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load password reset requests.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const pending = useMemo(() => requests.filter(r => r.status === 'PENDING').length, [requests]);

  async function resetPassword(event) {
    event.preventDefault();
    setError(''); setMessage('');
    if (newPassword.length < 8) return setError('Password must contain at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    try {
      const response = await api.patch(`/employees/${selected.employee_db_id}/reset-password`, { newPassword });
      setMessage(response.data.message + ' Share this password securely with the employee.');
      setSelected(null); setNewPassword(''); setConfirmPassword('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Password could not be reset.');
    }
  }

  async function reject(requestId) {
    if (!window.confirm('Reject this password reset request?')) return;
    try {
      const response = await api.patch(`/employees/password-reset-requests/${requestId}/reject`);
      setMessage(response.data.message);
      await load();
    } catch (err) { setError(err.response?.data?.message || 'Request could not be rejected.'); }
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Password Management</h1>
          <p className="page-subtitle">Admin and Super Admin can reset final employee passwords. Existing passwords are never visible.</p>
        </div>
        <span className="badge badge-pending">{pending} Pending</span>
      </div>

      {message && <div className="message message-success" style={{ marginBottom: 16 }}>{message}</div>}
      {error && <div className="message message-error" style={{ marginBottom: 16 }}>{error}</div>}

      {selected && (
        <form className="card" onSubmit={resetPassword} style={{ marginBottom: 20 }}>
          <h2>Reset Password — {selected.full_name}</h2>
          <p className="page-subtitle">Employee ID: {selected.employee_id}. The password saved here becomes the employee's final active password.</p>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="form-group"><label>New Password</label><input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength="8" required /></div>
            <div className="form-group"><label>Confirm Password</label><input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength="8" required /></div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button className="btn btn-primary" type="submit"><KeyRound size={16}/> Save Final Password</button>
            <button className="btn btn-secondary" type="button" onClick={() => { setSelected(null); setNewPassword(''); setConfirmPassword(''); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee ID</th><th>Employee</th><th>Email</th><th>Role</th><th>Requested</th><th>Status</th><th>Resolved By</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="8">Loading...</td></tr> : requests.map(request => (
                <tr key={request.id}>
                  <td><strong>{request.employee_id}</strong></td>
                  <td>{request.full_name}</td>
                  <td>{request.email || 'Admin has not added email'}</td>
                  <td>{request.role}</td>
                  <td>{formatDate(request.requested_at)}</td>
                  <td><span className={`badge badge-${request.status.toLowerCase()}`}>{request.status}</span></td>
                  <td>{request.resolved_by_name || '—'}</td>
                  <td>
                    {request.status === 'PENDING' ? <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button className="btn btn-primary" type="button" onClick={() => { setSelected(request); setMessage(''); setError(''); }}><KeyRound size={15}/> Reset</button>
                      <button className="btn btn-secondary" type="button" onClick={() => reject(request.id)}><XCircle size={15}/> Reject</button>
                    </div> : 'Completed'}
                  </td>
                </tr>
              ))}
              {!loading && !requests.length && <tr><td colSpan="8">No password reset requests.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
