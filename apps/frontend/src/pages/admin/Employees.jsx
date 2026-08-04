import {
  useEffect,
  useState
} from 'react';
import { Plus, Pencil, X, KeyRound, Trash2 } from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const initialForm = {
  employeeId: '',
  username: '',
  fullName: '',
  email: '',
  recoveryEmail: '',
  phone: '',
  dateOfBirth: '',
  password: 'Employee@123',
  role: 'EMPLOYEE',
  designation: '',
  departmentId: '',
  status: 'ACTIVE'
};
export default function Employees() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [message, setMessage] = useState('');
  const [passwordEmployee, setPasswordEmployee] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await api.get('/employees');
    setEmployees(response.data.data);
  }

  useEffect(() => {
    load().catch(() => {
      setError('Unable to load employees.');
    });
  }, []);

  function resetForm() {
    setForm(initialForm);
    setEditingEmployee(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setMessage('');
    setError('');
    setEditingEmployee(null);
    setForm(initialForm);
    setShowForm(true);
  }

  function openEditForm(employee) {
    setMessage('');
    setError('');

    setEditingEmployee(employee);

    setForm({
      employeeId: employee.employee_id || '',
      username: employee.username || '',
      fullName: employee.full_name || '',
      email: employee.email || '',
      recoveryEmail: employee.recovery_email || '',
      phone: employee.phone || '',
dateOfBirth: employee.date_of_birth
  ? String(employee.date_of_birth).slice(0, 10)
  : '',
      password: '',
      role: employee.role || 'EMPLOYEE',
      designation: employee.designation || '',
      departmentId: employee.department_id || '',
      status: employee.status || 'ACTIVE'
    });

    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  async function submit(event) {
    event.preventDefault();

    setError('');
    setMessage('');

    try {
      let response;

      if (editingEmployee) {
        response = await api.put(
          `/employees/${editingEmployee.id}`,
          {
            fullName: form.fullName,
            username: form.username,
            email: form.email,
            recoveryEmail: form.recoveryEmail,
            phone: form.phone,
dateOfBirth: form.dateOfBirth || null,
            role: form.role,
            designation: form.designation,
            departmentId: form.departmentId || null,
            status: form.status
          }
        );
      } else {
        response = await api.post('/employees', form);
      }

      setMessage(response.data.message);
      resetForm();
      await load();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (editingEmployee
            ? 'Employee could not be updated.'
            : 'Employee could not be created.')
      );
    }
  }


  async function resetEmployeePassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    try {
      const response = await api.patch(
        `/employees/${passwordEmployee.id}/reset-password`,
        { newPassword }
      );
      setMessage(response.data.message + ' Share it securely with the employee.');
      setPasswordEmployee(null);
      setNewPassword('');
      setConfirmPassword('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Password could not be reset.');
    }
  }

  async function deleteEmployee(employee) {
    const confirmed = window.confirm(
      `Delete ${employee.full_name} (${employee.employee_id})? This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const response = await api.delete(`/employees/${employee.id}`);
      setMessage(response.data.message);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Employee could not be deleted.');
    }
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Employees</h1>

          <p className="page-subtitle">
            Manage employee accounts, roles and employment status.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={openCreateForm}
        >
          <Plus size={17} />
          Add Employee
        </button>
      </div>

      {message && (
        <div
          className="message message-success"
          style={{ marginBottom: 16 }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          className="message message-error"
          style={{ marginBottom: 16 }}
        >
          {error}
        </div>
      )}


      {passwordEmployee && (
        <form className="card" onSubmit={resetEmployeePassword} style={{ marginBottom: 20 }}>
          <div className="section-heading">
            <div>
              <h2>Reset Password</h2>
              <p className="page-subtitle">
                {passwordEmployee.full_name} ({passwordEmployee.employee_id}). This becomes the final active password.
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => { setPasswordEmployee(null); setNewPassword(''); setConfirmPassword(''); }}>
              <X size={16}/> Close
            </button>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>New Password</label><input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength="8" required /></div>
            <div className="form-group"><label>Confirm Password</label><input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength="8" required /></div>
          </div>
          <button className="btn btn-primary" type="submit" style={{ marginTop: 18 }}><KeyRound size={16}/> Save Final Password</button>
          <p className="page-subtitle" style={{ marginTop: 10 }}>For security, existing passwords are never shown or stored as readable text.</p>
        </form>
      )}

      {showForm && (
        <form
          className="card"
          onSubmit={submit}
          style={{ marginBottom: 20 }}
        >
          <div className="section-heading">
            <h2>
              {editingEmployee
                ? 'Edit Employee'
                : 'New Employee'}
            </h2>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetForm}
            >
              <X size={16} />
              Close
            </button>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Employee ID</label>

              <input
                className="input"
                value={form.employeeId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    employeeId: event.target.value
                  })
                }
                disabled={Boolean(editingEmployee)}
              />
            </div>

            <div className="form-group">
              <label>Username</label>
              <input className="input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Optional login username" />
            </div>

            <div className="form-group">
              <label>Full Name</label>

              <input
                className="input"
                value={form.fullName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    fullName: event.target.value
                  })
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Official Email</label>

              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Recovery Email</label>
              <input className="input" type="email" value={form.recoveryEmail} onChange={(event) => setForm({ ...form, recoveryEmail: event.target.value })} placeholder="Required for Admin/Super Admin OTP" />
            </div>

            <div className="form-group">
              <label>Phone</label>

              <input
                className="input"
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone: event.target.value
                  })
                }
              />
            </div>
        <div className="form-group">
  <label>Date of Birth</label>

  <input
    className="input"
    type="date"
    value={form.dateOfBirth}
    onChange={(event) =>
      setForm({
        ...form,
        dateOfBirth: event.target.value
      })
    }
  />
</div>

            {!editingEmployee && (
              <div className="form-group">
                <label>Temporary Password</label>

                <input
                  className="input"
                  value={form.password}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      password: event.target.value
                    })
                  }
                  required
                  minLength="8"
                />
              </div>
            )}

            <div className="form-group">
              <label>Role</label>

              <select
                className="input"
                value={form.role}
                onChange={(event) =>
                  setForm({
                    ...form,
                    role: event.target.value
                  })
                }
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="RECRUITER">Recruiter</option>
                <option value="MANAGER">Manager</option>
                <option value="HR">HR</option>
                {isSuperAdmin && <option value="ADMIN">Admin</option>}
                {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
              </select>
            </div>

            <div className="form-group">
              <label>Designation</label>

              <input
                className="input"
                value={form.designation}
                onChange={(event) =>
                  setForm({
                    ...form,
                    designation: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Department ID</label>

              <input
                className="input"
                type="number"
                value={form.departmentId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    departmentId: event.target.value
                  })
                }
                placeholder="Enter department ID"
              />
            </div>

            {editingEmployee && (
              <div className="form-group">
                <label>Employment Status</label>

                <select
                  className="input"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value
                    })
                  }
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="RESIGNED">Resigned</option>
                  <option value="TERMINATED">Terminated</option>
                </select>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 18
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
            >
              {editingEmployee
                ? 'Save Changes'
                : 'Create Employee'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Status</th>
<th>Password Changed</th>
<th>Action</th>
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <strong>{employee.employee_id}</strong>
                  </td>

                  <td>
                    {employee.full_name}

                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)'
                      }}
                    >
                      {employee.email || 'No official email'}
                      {employee.recovery_email && <><br/><span>Recovery: {employee.recovery_email}</span></>}
                    </div>
                  </td>

                  <td>{employee.role}</td>

                  <td>
                    {employee.designation || '—'}
                  </td>

                  <td>
                    {employee.department || '—'}
                  </td>

                  <td>
                    <span
                      className={`badge badge-${String(
                        employee.status
                      ).toLowerCase()}`}
                    >
                      {employee.status}
                    </span>
                  </td>
                  <td>
  {employee.password_changed_at
    ? new Date(
        employee.password_changed_at
      ).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'Not changed yet'}
</td>

                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => openEditForm(employee)}>
                        <Pencil size={15} /> Edit
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => { setPasswordEmployee(employee); setNewPassword(''); setConfirmPassword(''); setMessage(''); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                        <KeyRound size={15} /> Reset Password
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => deleteEmployee(employee)}>
                        <Trash2 size={15} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!employees.length && (
                <tr>
                  <td colSpan="8">
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}