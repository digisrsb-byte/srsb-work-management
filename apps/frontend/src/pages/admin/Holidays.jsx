import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyForm = {
  holidayName: '',
  holidayDate: '',
  holidayType: 'COMPANY',
  departmentId: '',
  description: ''
};

const holidayTypes = ['NATIONAL','COMPANY','OPTIONAL','REGIONAL','WEEKEND'];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
}

export default function Holidays() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN','ADMIN'].includes(user?.role);
  const [holidays, setHolidays] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadHolidays = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/holidays');
      setHolidays(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load holidays.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const response = await api.get('/employees/form-meta');
      setDepartments(response.data.data.departments || []);
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    loadHolidays();
    if (canManage) loadDepartments();
  }, [loadHolidays, loadDepartments, canManage]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage('');
    setError('');
  }

  function openEdit(holiday) {
    setEditing(holiday);
    setForm({
      holidayName: holiday.holiday_name || '',
      holidayDate: holiday.holiday_date ? String(holiday.holiday_date).slice(0, 10) : '',
      holidayType: holiday.holiday_type || 'COMPANY',
      departmentId: holiday.department_id || '',
      description: holiday.description || ''
    });
    setShowForm(true);
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const response = editing
        ? await api.put(`/holidays/${editing.id}`, form)
        : await api.post('/holidays', form);
      setMessage(response.data.message);
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      await loadHolidays();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Holiday could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(holiday) {
    if (!window.confirm(`Delete ${holiday.holiday_name}?`)) return;
    try {
      const response = await api.delete(`/holidays/${holiday.id}`);
      setMessage(response.data.message);
      await loadHolidays();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Holiday could not be deleted.');
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">Company Calendar</p><h1 className="page-title">Holiday Calendar</h1><p className="page-subtitle">Holiday dates are automatically marked as HOLIDAY instead of ABSENT in attendance.</p></div>
        {canManage && <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={18} /> Add Holiday</button>}
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showForm && canManage && (
        <form className="card form-card" onSubmit={submit}>
          <div className="section-heading"><div><h2>{editing ? 'Edit Holiday' : 'Add Holiday'}</h2><p className="page-subtitle">Leave Department empty to apply the holiday to everyone.</p></div><button className="icon-btn" type="button" onClick={() => setShowForm(false)}><X size={20} /></button></div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Holiday Name *</span><input className="input" value={form.holidayName} onChange={(event) => setForm((current) => ({ ...current, holidayName: event.target.value }))} required /></label>
            <label className="form-group"><span>Date *</span><input className="input" type="date" value={form.holidayDate} onChange={(event) => setForm((current) => ({ ...current, holidayDate: event.target.value }))} required /></label>
            <label className="form-group"><span>Holiday Type</span><select className="input" value={form.holidayType} onChange={(event) => setForm((current) => ({ ...current, holidayType: event.target.value }))}>{holidayTypes.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="form-group"><span>Department</span><select className="input" value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}><option value="">All employees</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label className="form-group form-span-2"><span>Description</span><textarea className="input" rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Holiday'}</button></div>
        </form>
      )}

      <div className="holiday-grid">
        {!loading && !holidays.length && <div className="card empty-state"><CalendarDays size={34} /><strong>No holidays have been added.</strong></div>}
        {holidays.map((holiday) => (
          <article className="holiday-card" key={holiday.id}>
            <div className="holiday-date-box"><strong>{new Date(holiday.holiday_date).toLocaleDateString('en-IN', { day: '2-digit' })}</strong><span>{new Date(holiday.holiday_date).toLocaleDateString('en-IN', { month: 'short' })}</span></div>
            <div className="holiday-content"><div className="holiday-card-top"><div><h3>{holiday.holiday_name}</h3><p>{formatDate(holiday.holiday_date)}</p></div><span className="badge badge-neutral">{holiday.holiday_type.replaceAll('_', ' ')}</span></div><p>{holiday.description || 'No description'}</p><div className="cell-muted">Applicable to: {holiday.department_name || 'All employees'}</div></div>
            {canManage && <div className="row-actions"><button className="icon-btn" type="button" onClick={() => openEdit(holiday)}><Pencil size={16} /></button><button className="icon-btn danger" type="button" onClick={() => remove(holiday)}><Trash2 size={16} /></button></div>}
          </article>
        ))}
      </div>
    </div>
  );
}
