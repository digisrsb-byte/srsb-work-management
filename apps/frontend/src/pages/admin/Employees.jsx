import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, Package, Plus, Pencil, Search, Trash2, X } from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import {
  DemoBadge,
  OnboardingResultMessage,
  REVIEWER_ROLES
} from '../onboarding/onboardingUi.jsx';
import AddEmployeeWizard from './AddEmployeeWizard.jsx';

const emptyForm = {
  employeeId: '',
  username: '',
  fullName: '',
  email: '',
  recoveryEmail: '',
  phone: '',
  dateOfBirth: '',
  joiningDate: '',
  password: 'Employee@123',
  role: 'EMPLOYEE',
  departmentId: '',
  designation: '',
  managerId: '',
  status: 'ACTIVE'
};

const roles = ['EMPLOYEE', 'RECRUITER', 'MANAGER', 'HR', 'ADMIN'];
const statuses = ['ACTIVE', 'INACTIVE', 'RESIGNED'];

function dateValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [assetPanel, setAssetPanel] = useState(null);
  const [assetPanelError, setAssetPanelError] = useState('');
  const [loadingAssets, setLoadingAssets] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadMeta = useCallback(async () => {
    const [response, companiesResponse] = await Promise.all([
      api.get('/employees/form-meta'),
      api.get('/access/companies').catch(() => ({ data: { data: [] } }))
    ]);
    setDepartments(response.data.data.departments || []);
    setManagers(response.data.data.managers || []);
    setCompanies(companiesResponse.data.data || []);
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/employees', {
        params: {
          search: debouncedSearch || undefined,
          status: status || undefined
        }
      });
      setEmployees(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    Promise.all([loadMeta(), loadEmployees()]).catch((requestError) => {
      setError(requestError.response?.data?.message || 'Unable to load employee information.');
    });
  }, [loadMeta, loadEmployees]);

  const [searchParams, setSearchParams] = useSearchParams();
  const editParam = searchParams.get('edit');
  useEffect(() => {
    if (!editParam || loading) return;
    const target = employees.find((employee) => String(employee.id) === editParam);
    if (target) openEdit(target);
    else setError('That employee is not in your employee list.');
    setSearchParams({}, { replace: true });
  }, [editParam, employees, loading]);

  const allowedRoles = useMemo(
    () => roles.filter((role) => user?.role === 'SUPER_ADMIN' || role !== 'ADMIN'),
    [user]
  );

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMessage('');
    setError('');
    setCreateResult(null);
    setShowOnboarding(false);
    setShowForm(true);
  }

  function openOnboarding() {
    closeForm();
    setMessage('');
    setError('');
    setCreateResult(null);
    setShowOnboarding(true);
  }

  async function handleOnboardingCreated(result) {
    setShowOnboarding(false);
    setCreateResult(result);
    try {
      await loadEmployees();
    } catch {
      setError('Employee created, but the list could not be refreshed.');
    }
  }

  function openEdit(employee) {
    setEditing(employee);
    setForm({
      employeeId: employee.employee_id || '',
      username: employee.username || '',
      fullName: employee.full_name || '',
      email: employee.email || '',
      recoveryEmail: employee.recovery_email || '',
      phone: employee.phone || '',
      dateOfBirth: dateValue(employee.date_of_birth),
      joiningDate: dateValue(employee.joining_date),
      password: '',
      role: employee.role || 'EMPLOYEE',
      departmentId: employee.department_id || '',
      designation: employee.designation || '',
      managerId: employee.manager_id || '',
      status: employee.status || 'ACTIVE'
    });
    setShowForm(true);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function openEmployeeAssets(employee) {
    setAssetPanelError('');
    setLoadingAssets(true);
    setAssetPanel({ employee, assets: [] });
    try {
      const res = await api.get(`/assets/employee/${employee.id}`);
      setAssetPanel(res.data.data);
    } catch (err) {
      setAssetPanelError(
        err.response?.data?.message || 'Unable to load employee assets.'
      );
    } finally {
      setLoadingAssets(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const payload = {
        ...form,
        departmentId: Number(form.departmentId),
        managerId: form.managerId ? Number(form.managerId) : null,
        joiningDate: form.joiningDate || null,
        dateOfBirth: form.dateOfBirth || null
      };
      const response = editing
        ? await api.put(`/employees/${editing.id}`, payload)
        : await api.post('/employees', payload);
      setMessage(response.data.message);
      closeForm();
      await Promise.all([loadMeta(), loadEmployees()]);
    } catch (requestError) {
      const blockers = requestError.response?.data?.details?.blockers;
      const blockerText = Array.isArray(blockers) && blockers.length
        ? ` Missing: ${blockers.map((blocker) => blocker.label).join(', ')}.`
        : '';
      setError((requestError.response?.data?.message || 'Employee could not be saved.') + blockerText);
    } finally {
      setSaving(false);
    }
  }

  async function remove(employee) {
    if (!window.confirm(`Delete ${employee.full_name}? This cannot be undone.`)) return;
    try {
      setError('');
      const response = await api.delete(`/employees/${employee.id}`);
      setMessage(response.data.message);
      await loadEmployees();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Employee could not be deleted.');
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">People & Access</p>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage employee accounts, departments, designations and reporting lines.</p>
        </div>
        <div className="row-actions">
          <button className="btn btn-secondary" type="button" onClick={openOnboarding}>
            <MailCheck size={18} /> Onboard New Joiner
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={18} /> Add Employee
          </button>
        </div>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      <OnboardingResultMessage
        message={createResult?.message}
        tone={createResult?.tone}
        caseId={createResult?.caseId}
        canOpenCase={REVIEWER_ROLES.includes(user?.role)}
        style={{ marginBottom: 16 }}
      />

      {showOnboarding && (
        <AddEmployeeWizard
          onboardingOnly
          companies={companies}
          departments={departments}
          roleOptions={allowedRoles.map((role) => ({ value: role, label: role.replaceAll('_', ' ') }))}
          onCancel={() => setShowOnboarding(false)}
          onCreated={handleOnboardingCreated}
        />
      )}

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <div className="section-heading">
            <div>
              <h2>{editing ? 'Edit Employee' : 'Add Employee'}</h2>
              <p className="page-subtitle">Department is selected from the list. Designation remains a normal text field.</p>
            </div>
            <button className="icon-btn" type="button" onClick={closeForm} aria-label="Close form"><X size={20} /></button>
          </div>

          <div className="form-section-title">Identity & login</div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Employee ID *</span><input className="input" name="employeeId" value={form.employeeId} onChange={updateField} disabled={Boolean(editing)} required={!form.username} /></label>
            <label className="form-group"><span>Username</span><input className="input" name="username" value={form.username} onChange={updateField} /></label>
            <label className="form-group"><span>Full Name *</span><input className="input" name="fullName" value={form.fullName} onChange={updateField} required /></label>
            <label className="form-group"><span>Official Email</span><input className="input" type="email" name="email" value={form.email} onChange={updateField} /></label>
            <label className="form-group"><span>Recovery Email</span><input className="input" type="email" name="recoveryEmail" value={form.recoveryEmail} onChange={updateField} /></label>
            <label className="form-group"><span>Phone</span><input className="input" name="phone" value={form.phone} onChange={updateField} /></label>
            {!editing && <label className="form-group"><span>Temporary Password *</span><input className="input" type="password" name="password" value={form.password} onChange={updateField} minLength={8} required /></label>}
          </div>

          <div className="form-section-title">Employment</div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Department *</span><select className="input" name="departmentId" value={form.departmentId} onChange={updateField} required><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label className="form-group"><span>Designation *</span><input className="input" name="designation" value={form.designation} onChange={updateField} placeholder="Example: Full-Stack Developer" required /></label>
            <label className="form-group"><span>Role *</span><select className="input" name="role" value={form.role} onChange={updateField}>{allowedRoles.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="form-group"><span>Reporting Manager</span><select className="input" name="managerId" value={form.managerId} onChange={updateField}><option value="">No reporting manager</option>{managers.filter((manager) => !editing || manager.id !== editing.id).map((manager) => <option key={manager.id} value={manager.id}>{manager.full_name} {manager.employee_id ? `(${manager.employee_id})` : ''}</option>)}</select></label>
            <label className="form-group"><span>Joining Date</span><input className="input" type="date" name="joiningDate" value={form.joiningDate} onChange={updateField} /></label>
            <label className="form-group"><span>Date of Birth</span><input className="input" type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={updateField} /></label>
            {editing && <label className="form-group"><span>Employment Status</span><select className="input" name="status" value={form.status} onChange={updateField}>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>}
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={closeForm}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Employee' : 'Create Employee'}</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="search-box"><Search size={18} /><input value={search} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Search employee, ID, designation or department" /></div>
          <select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select>
          <button className="btn btn-secondary" type="button" onClick={loadEmployees} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Department</th><th>Designation</th><th>Role</th><th>Manager</th><th>Employer</th><th>Status</th><th>Onboarding</th><th>Actions</th></tr></thead>
            <tbody>
              {!loading && !employees.length && <tr><td colSpan="9"><div className="empty-state">No employees found.</div></td></tr>}
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td><strong>{employee.full_name}</strong>{employee.is_demo ? <> <DemoBadge /></> : null}<div className="cell-muted">{employee.employee_id || employee.username || 'No login ID'} · {employee.email || 'No email'}</div></td>
                  <td>{employee.department || '—'}</td>
                  <td>{employee.designation || '—'}</td>
                  <td><span className="badge badge-neutral">{employee.role}</span></td>
                  <td>{employee.manager_name || '—'}</td>
                  <td>{employee.company_name || '—'}</td>
                  <td><span className={`badge badge-${String(employee.status).toLowerCase()}`}>{employee.status}</span></td>
                  <td>{String(employee.onboarding_status || 'NOT_STARTED').replaceAll('_', ' ')}</td>
                  <td><div className="row-actions"><button className="icon-btn" type="button" onClick={() => openEmployeeAssets(employee)} title="Assets"><Package size={17} /></button><button className="icon-btn" type="button" onClick={() => openEdit(employee)} title="Edit"><Pencil size={17} /></button><button className="icon-btn danger" type="button" onClick={() => remove(employee)} title="Delete"><Trash2 size={17} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {assetPanel ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-heading">
            <div>
              <h2 style={{ margin: 0 }}>Assets · {assetPanel.employee.full_name}</h2>
              <p className="page-subtitle" style={{ marginTop: 4 }}>
                {assetPanel.employee.employee_id} · {assetPanel.employee.designation || '—'} · {assetPanel.employee.department_name || '—'}
              </p>
            </div>
            <div className="row-actions">
              <Link className="btn btn-secondary" to={`/admin/assets?tab=employees&employee=${assetPanel.employee.id}`}>
                Full asset record
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAssetPanel(null);
                  setAssetPanelError('');
                }}
              >
                <X size={15} /> Close
              </button>
            </div>
          </div>

          {assetPanelError ? <div className="message message-error">{assetPanelError}</div> : null}
          {loadingAssets ? (
            <p className="page-subtitle">Loading assigned assets…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Asset tag</th><th>Asset name</th><th>Type</th><th>Assigned date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(assetPanel.assets || []).length ? (
                    assetPanel.assets.map((row) => (
                      <tr key={row.assignment_id}>
                        <td>{row.asset_tag}</td>
                        <td>{row.asset_name || '—'}</td>
                        <td>{row.category}</td>
                        <td>{row.assigned_at ? String(row.assigned_at).slice(0, 10) : '—'}</td>
                        <td>{row.assignment_status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No active assets assigned to this employee.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
