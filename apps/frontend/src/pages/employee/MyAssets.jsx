import { useEffect, useState } from 'react';
import api from '../../services/api.js';

export default function MyAssets() {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const res = await api.get('/assets/mine');
    setRows(res.data.data || []);
  }

  useEffect(() => {
    load().catch(() => setError('Unable to load assigned assets.'));
  }, []);

  async function acknowledge(assignmentId) {
    try {
      await api.post(`/assets/assignments/${assignmentId}/acknowledge`, {
        notes: 'Acknowledged via employee portal'
      });
      setMessage('Asset acknowledged.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Acknowledge failed.');
    }
  }

  async function report(assetId, recordType) {
    const description = window.prompt(`${recordType} details`) || '';
    if (!description) return;
    try {
      await api.post(`/assets/${assetId}/service`, { recordType, description });
      setMessage(`${recordType} request submitted.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Request failed.');
    }
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">My Assets</h1>
          <p className="page-subtitle">Acknowledge assigned assets and raise repair/replacement requests.</p>
        </div>
      </div>
      {message ? <div className="message-success">{message}</div> : null}
      {error ? <div className="message-error">{error}</div> : null}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>Category</th>
                <th>Assigned</th>
                <th>Acknowledged</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                <tr key={row.assignment_id}>
                  <td>{row.asset_tag}</td>
                  <td>{row.asset_name || row.make || '—'}</td>
                  <td>{row.category}</td>
                  <td>{new Date(row.assigned_at).toLocaleString()}</td>
                  <td>{row.acknowledged ? 'Yes' : 'No'}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!row.acknowledged ? (
                      <button className="btn btn-primary" type="button" onClick={() => acknowledge(row.assignment_id)}>
                        Acknowledge
                      </button>
                    ) : null}
                    <button className="btn btn-secondary" type="button" onClick={() => report(row.id, 'REPAIR')}>Repair</button>
                    <button className="btn btn-secondary" type="button" onClick={() => report(row.id, 'REPLACEMENT')}>Replace</button>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-muted)' }}>
                    No assets are currently assigned to you.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
