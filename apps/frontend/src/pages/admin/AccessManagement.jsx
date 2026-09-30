import { useEffect, useState } from 'react';
import api from '../../services/api.js';

export default function AccessManagement() {
  const [companies, setCompanies] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [adminScopes, setAdminScopes] = useState([]);
  const [selectedScopeIds, setSelectedScopeIds] = useState([]);
  const [companyForm, setCompanyForm] = useState({ code: '', name: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [companyRes, adminRes, permRes] = await Promise.all([
        api.get('/access/companies'),
        api.get('/access/admins'),
        api.get('/access/permissions')
      ]);
      setCompanies(companyRes.data.data || []);
      setAdmins(adminRes.data.data || []);
      setPermissions(permRes.data.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to load access management data.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadScopes(adminId) {
    if (!adminId) {
      setAdminScopes([]);
      setSelectedScopeIds([]);
      return;
    }
    const response = await api.get(`/access/admins/${adminId}/scopes`);
    const scopes = response.data.data || [];
    setAdminScopes(scopes);
    setSelectedScopeIds(scopes.map((s) => s.id));
  }

  async function createCompany(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/access/companies', companyForm);
      setCompanyForm({ code: '', name: '' });
      setMessage('Company created.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create company.');
    }
  }

  async function saveScopes(event) {
    event.preventDefault();
    if (!selectedAdmin) return;
    setMessage('');
    setError('');
    try {
      await api.put(`/access/admins/${selectedAdmin}/scopes`, {
        companyIds: selectedScopeIds
      });
      setMessage('Company scopes updated.');
      await loadScopes(selectedAdmin);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update scopes.');
    }
  }

  async function togglePermission(row, field) {
    setMessage('');
    setError('');
    try {
      await api.put(`/access/permissions/${row.role}`, {
        module: row.module,
        can_view: field === 'can_view' ? !row.can_view : Boolean(row.can_view),
        can_create:
          field === 'can_create' ? !row.can_create : Boolean(row.can_create),
        can_edit: field === 'can_edit' ? !row.can_edit : Boolean(row.can_edit),
        can_approve:
          field === 'can_approve' ? !row.can_approve : Boolean(row.can_approve),
        can_delete:
          field === 'can_delete' ? !row.can_delete : Boolean(row.can_delete),
        can_export:
          field === 'can_export' ? !row.can_export : Boolean(row.can_export)
      });
      setMessage(`Updated ${row.role} / ${row.module}.`);
      const permRes = await api.get('/access/permissions');
      setPermissions(permRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update permission.');
    }
  }

  function toggleScope(companyId) {
    setSelectedScopeIds((current) =>
      current.includes(companyId)
        ? current.filter((id) => id !== companyId)
        : [...current, companyId]
    );
  }

  if (loading) {
    return <div className="card">Loading access management...</div>;
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Access & Company Scope</h1>
          <p className="page-subtitle">
            Manage companies, Admin company assignments, and role permissions.
          </p>
        </div>
      </div>

      {message ? <div className="message-success">{message}</div> : null}
      {error ? <div className="message-error">{error}</div> : null}

      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Companies</h2>
          <form onSubmit={createCompany} className="grid" style={{ gap: 12 }}>
            <input
              className="input"
              placeholder="Code (e.g. SRSB)"
              value={companyForm.code}
              onChange={(e) =>
                setCompanyForm((f) => ({ ...f, code: e.target.value }))
              }
              required
            />
            <input
              className="input"
              placeholder="Company name"
              value={companyForm.name}
              onChange={(e) =>
                setCompanyForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
            <button className="btn btn-primary" type="submit">
              Add company
            </button>
          </form>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>{company.code}</td>
                    <td>{company.name}</td>
                    <td>{company.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Admin company scopes</h2>
          <form onSubmit={saveScopes} className="grid" style={{ gap: 12 }}>
            <select
              className="input"
              value={selectedAdmin}
              onChange={async (e) => {
                const value = e.target.value;
                setSelectedAdmin(value);
                try {
                  await loadScopes(value);
                } catch (err) {
                  setError(
                    err.response?.data?.message || 'Unable to load scopes.'
                  );
                }
              }}
            >
              <option value="">Select Admin / HR / Manager</option>
              {admins
                .filter((a) => a.role !== 'SUPER_ADMIN')
                .map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.full_name} ({admin.role})
                  </option>
                ))}
            </select>

            {selectedAdmin ? (
              <div className="grid" style={{ gap: 8 }}>
                {companies.map((company) => (
                  <label key={company.id} style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedScopeIds.includes(company.id)}
                      onChange={() => toggleScope(company.id)}
                    />
                    {company.name}
                  </label>
                ))}
                <button className="btn btn-primary" type="submit">
                  Save scopes
                </button>
                {adminScopes.length === 0 ? (
                  <p className="page-subtitle">No scopes assigned yet.</p>
                ) : null}
              </div>
            ) : null}
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Role permissions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Module</th>
                <th>View</th>
                <th>Create</th>
                <th>Edit</th>
                <th>Approve</th>
                <th>Delete</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((row) => (
                <tr key={`${row.role}-${row.module}`}>
                  <td>{row.role}</td>
                  <td>{row.module}</td>
                  {[
                    'can_view',
                    'can_create',
                    'can_edit',
                    'can_approve',
                    'can_delete',
                    'can_export'
                  ].map((field) => (
                    <td key={field}>
                      <input
                        type="checkbox"
                        checked={Boolean(row[field])}
                        disabled={row.role === 'SUPER_ADMIN'}
                        onChange={() => togglePermission(row, field)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
