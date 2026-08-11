import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import api from '../../services/api.js';
import { isSrsbHeadAdmin } from '../../utils/srsbHeadAdmin.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function ActivationCodes() {
  const { user } = useAuth();
  const [codes, setCodes] = useState([]);
  const [note, setNote] = useState('');
  const [expiresDays, setExpiresDays] = useState('90');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [latestCode, setLatestCode] = useState('');

  const loadCodes = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/activation-codes', {
        params: { unused: '0' }
      });
      setCodes(response.data.data || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to load activation codes.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSrsbHeadAdmin(user)) {
      loadCodes();
    }
  }, [user, loadCodes]);

  if (!isSrsbHeadAdmin(user)) {
    return <Navigate to="/admin" replace />;
  }

  async function createCode(event) {
    event.preventDefault();
    try {
      setCreating(true);
      setError('');
      setMessage('');
      const response = await api.post('/activation-codes', {
        note: note.trim() || undefined,
        expiresDays: Number(expiresDays) || 90
      });
      const created = response.data.data;
      setLatestCode(created?.code || '');
      setMessage(response.data.message || 'Activation code created.');
      setNote('');
      await loadCodes();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Activation code could not be created.'
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setMessage(`Copied: ${code}`);
      window.setTimeout(() => setCopiedCode(''), 2000);
    } catch {
      setError('Could not copy to clipboard. Select and copy manually.');
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Platform</p>
          <h1 className="page-title">Activation Codes</h1>
          <p className="page-subtitle">
            Generate codes for new companies to complete EXE / web setup.
            Only the SRSB Head Super Admin can access this page.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={loadCodes}
          disabled={loading}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {message && (
        <div className="message message-success">{message}</div>
      )}

      <form className="card settings-card" onSubmit={createCode}>
        <div className="settings-card-heading">
          <KeyRound size={24} />
          <div>
            <h2>Generate activation code</h2>
            <p>Share the code with the new company for first-time setup.</p>
          </div>
        </div>

        <div className="form-grid">
          <label className="form-group">
            <span>Note (optional)</span>
            <input
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Acme Corp / Friend Company"
            />
          </label>
          <label className="form-group">
            <span>Expires in (days)</span>
            <input
              className="input"
              type="number"
              min="1"
              max="3650"
              value={expiresDays}
              onChange={(event) => setExpiresDays(event.target.value)}
            />
          </label>
        </div>

        <button className="btn btn-primary" disabled={creating}>
          <Plus size={17} />{' '}
          {creating ? 'Generating…' : 'Generate activation code'}
        </button>

        {latestCode && (
          <div
            className="message message-success"
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <strong style={{ letterSpacing: 1 }}>{latestCode}</strong>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => copyCode(latestCode)}
            >
              {copiedCode === latestCode ? (
                <>
                  <Check size={15} /> Copied
                </>
              ) : (
                <>
                  <Copy size={15} /> Copy
                </>
              )}
            </button>
          </div>
        )}
      </form>

      <div className="card table-wrap" style={{ marginTop: 18 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Note</th>
              <th>Created</th>
              <th>Expires</th>
              <th>Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6">Loading activation codes…</td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan="6">No activation codes yet.</td>
              </tr>
            ) : (
              codes.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong style={{ letterSpacing: 0.5 }}>{item.code}</strong>
                  </td>
                  <td>{item.note || '—'}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{formatDate(item.expiresAt)}</td>
                  <td>
                    {item.usedAt ? (
                      <span className="status-badge status-cancelled">Used</span>
                    ) : (
                      <span className="status-badge status-success">Unused</span>
                    )}
                  </td>
                  <td>
                    {!item.usedAt && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => copyCode(item.code)}
                      >
                        {copiedCode === item.code ? (
                          <>
                            <Check size={14} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
