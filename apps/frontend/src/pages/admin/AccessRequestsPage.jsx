import { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AccessRequestsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({
    requestedAction: '',
    module: 'companies',
    reason: '',
    companyIds: []
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isSuper = user?.role === 'SUPER_ADMIN';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [r, c] = await Promise.all([
        api.get('/access-requests'),
        api.get('/access/companies').catch(() => ({ data: { data: [] } }))
      ]);
      setRows(r.data.data || []);
      setCompanies(c.data.data || []);
    } catch (err) {
      setRows([]);
      setError(
        err.response?.data?.message ||
          'Unable to load access requests. Check that the access-request tables exist and you are signed in.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/access-requests', {
        requestedAction: form.requestedAction,
        module: form.module,
        reason: form.reason,
        requestedScope: { companyIds: form.companyIds.map(Number) }
      });
      setMessage('Access request submitted.');
      setForm({ requestedAction: '', module: 'companies', reason: '', companyIds: [] });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to submit request.');
    }
  }

  async function decide(id, decision) {
    setError('');
    setMessage('');
    try {
      await api.patch(`/access-requests/${id}/decision`, {
        decision,
        reviewNotes: window.prompt('Review notes (optional)') || ''
      });
      setMessage(`Request ${decision.toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Decision failed.');
    }
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Access Requests</h1>
          <p className="page-subtitle">
            Request restricted actions; Super Admin reviews and grants only the requested scope.
          </p>
        </div>
      </div>

      {message ? <div className="message-success">{message}</div> : null}
      {error ? <div className="message-error">{error}</div> : null}

      {!isSuper ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>New request</h2>
          <form onSubmit={submit} className="grid" style={{ gap: 10 }}>
            <input
              className="input"
              placeholder="Requested action (e.g. Manage company assets)"
              value={form.requestedAction}
              onChange={(e) => setForm({ ...form, requestedAction: e.target.value })}
              required
            />
            <select
              className="input"
              value={form.module}
              onChange={(e) => setForm({ ...form, module: e.target.value })}
            >
              <option value="companies">companies</option>
              <option value="assets">assets</option>
              <option value="permissions">permissions</option>
              <option value="reports">reports</option>
              <option value="employees">employees</option>
              <option value="access_requests">access_requests</option>
            </select>
            <textarea
              className="input"
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
            />
            <div className="grid" style={{ gap: 6 }}>
              {companies.length ? (
                companies.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={
                        form.companyIds.includes(String(c.id)) ||
                        form.companyIds.includes(c.id)
                      }
                      onChange={() => {
                        const id = String(c.id);
                        setForm((f) => ({
                          ...f,
                          companyIds: f.companyIds.map(String).includes(id)
                            ? f.companyIds.filter((x) => String(x) !== id)
                            : [...f.companyIds, id]
                        }));
                      }}
                    />
                    Request scope: {c.name}
                  </label>
                ))
              ) : (
                <p className="page-subtitle" style={{ margin: 0 }}>
                  No company list available for your role. Describe the needed company scope in the
                  reason field.
                </p>
              )}
            </div>
            <button className="btn btn-primary" type="submit">
              Submit request
            </button>
          </form>
        </div>
      ) : null}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Requester</th>
                <th>Role</th>
                <th>Module</th>
                <th>Action</th>
                <th>Reason</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Reviewed by</th>
                <th>Reviewed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--text-muted)' }}>
                    Loading access requests…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.requester_name}</td>
                    <td>{row.requester_role || '—'}</td>
                    <td>{row.module || '—'}</td>
                    <td>{row.requested_action}</td>
                    <td>{row.reason || '—'}</td>
                    <td>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString()
                        : '—'}
                    </td>
                    <td>{row.status}</td>
                    <td>{row.reviewer_name || '—'}</td>
                    <td>
                      {row.reviewed_at
                        ? new Date(row.reviewed_at).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      {isSuper && row.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => decide(row.id, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger"
                            type="button"
                            onClick={() => decide(row.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </div>
                      ) : row.review_notes ? (
                        <span className="page-subtitle">{row.review_notes}</span>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : !error ? (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--text-muted)' }}>
                    No access requests yet. Submit a request above when you need restricted access.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
