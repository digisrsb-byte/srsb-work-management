import { useEffect, useState } from 'react';
import api from '../services/api.js';

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const res = await api.get('/notifications');
    setRows(res.data.data || []);
  }

  useEffect(() => {
    load().catch(() => setError('Unable to load notifications.'));
  }, []);

  async function markAll() {
    await api.put('/notifications/read-all');
    await load();
  }

  async function markOne(id) {
    await api.put(`/notifications/${id}/read`);
    await load();
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Notification Center</h1>
          <p className="page-subtitle">Workflow alerts across onboarding, payroll, assets and access.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={markAll}>Mark all read</button>
      </div>
      {error ? <div className="message-error">{error}</div> : null}
      <div className="card">
        {rows.length === 0 ? (
          <p className="page-subtitle">No notifications.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>When</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.type}</td>
                    <td>{row.title}</td>
                    <td>{row.message}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.is_read ? 'Read' : 'Unread'}</td>
                    <td>
                      {!row.is_read ? (
                        <button className="btn btn-secondary" type="button" onClick={() => markOne(row.id)}>
                          Mark read
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
