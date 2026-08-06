import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, List, Pencil, Plus, Trash2, X } from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import MonthlyCalendar, { shiftMonth } from '../../components/MonthlyCalendar.jsx';

const emptyForm = {
  holidayName: '', holidayDate: '', holidayType: 'COMPANY', departmentId: '', description: '',
  showGreeting: true, greetingMessage: '', greetingStartDate: '', greetingEndDate: ''
};
const holidayTypes = ['NATIONAL','COMPANY','OPTIONAL','REGIONAL','WEEKEND'];
const label = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export default function Holidays() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN','ADMIN'].includes(user?.role);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [view, setView] = useState('CALENDAR');
  const [holidays, setHolidays] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selected, setSelected] = useState(null);
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
      const [year, monthNo] = month.split('-').map(Number);
      const from = `${month}-01`;
      const to = `${month}-${String(new Date(year, monthNo, 0).getDate()).padStart(2, '0')}`;
      const response = await api.get('/holidays', { params: { from, to } });
      setHolidays(response.data.data || []);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load holidays.'); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);
  useEffect(() => {
    if (!canManage) return;
    api.get('/employees/form-meta').then((response) => setDepartments(response.data.data.departments || [])).catch(() => setDepartments([]));
  }, [canManage]);

  const items = useMemo(() => holidays.map((holiday) => ({ ...holiday, date: String(holiday.holiday_date).slice(0, 10) })), [holidays]);

  function openCreate(date = '') {
    setEditing(null);
    setForm({ ...emptyForm, holidayDate: date, greetingStartDate: date, greetingEndDate: date });
    setShowForm(true); setSelected(null); setError(''); setMessage('');
  }
  function openEdit(holiday) {
    const date = String(holiday.holiday_date).slice(0, 10);
    setEditing(holiday);
    setForm({
      holidayName: holiday.holiday_name || '', holidayDate: date, holidayType: holiday.holiday_type || 'COMPANY',
      departmentId: holiday.department_id || '', description: holiday.description || '', showGreeting: Boolean(holiday.show_greeting),
      greetingMessage: holiday.greeting_message || '', greetingStartDate: holiday.greeting_start_date ? String(holiday.greeting_start_date).slice(0, 10) : date,
      greetingEndDate: holiday.greeting_end_date ? String(holiday.greeting_end_date).slice(0, 10) : date
    });
    setShowForm(true); setSelected(null);
  }
  function setField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }
  async function save(event) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      const response = editing ? await api.put(`/holidays/${editing.id}`, form) : await api.post('/holidays', form);
      setMessage(response.data.message); setShowForm(false); setEditing(null); await loadHolidays();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Holiday could not be saved.'); }
    finally { setSaving(false); }
  }
  async function remove(holiday) {
    if (!window.confirm(`Delete ${holiday.holiday_name}?`)) return;
    try { const response = await api.delete(`/holidays/${holiday.id}`); setMessage(response.data.message); setSelected(null); await loadHolidays(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Holiday could not be deleted.'); }
  }

  return <div className="module-page">
    <div className="page-heading-row"><div><p className="eyebrow">Company Calendar</p><h1 className="page-title">Holiday Calendar</h1><p className="page-subtitle">Plan holidays, change dates and publish festival greetings to employee dashboards.</p></div>{canManage && <button className="btn btn-primary" type="button" onClick={() => openCreate()}><Plus size={18}/> Add Holiday</button>}</div>
    {message && <div className="message message-success">{message}</div>}{error && <div className="message message-error">{error}</div>}
    <div className="view-toggle"><button className={`btn ${view === 'CALENDAR' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('CALENDAR')}><CalendarDays size={17}/> Calendar</button><button className={`btn ${view === 'LIST' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('LIST')}><List size={17}/> List</button></div>

    {loading ? <div className="card">Loading holiday calendar...</div> : view === 'CALENDAR' ? <MonthlyCalendar
      month={month} items={items} selectedDate={selected ? String(selected.holiday_date).slice(0, 10) : ''}
      onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))}
      onToday={() => setMonth(new Date().toISOString().slice(0, 7))}
      onSelectDate={(date, item) => item ? setSelected(item) : canManage ? openCreate(date) : null}
      renderCell={({ item }) => item ? <div className={`calendar-event holiday-${String(item.holiday_type).toLowerCase()}`}><strong>{item.holiday_name}</strong><span>{label(item.holiday_type)}</span></div> : null}
      legend={<><span><i className="legend-dot holiday-national"/>National</span><span><i className="legend-dot holiday-company"/>Company</span><span><i className="legend-dot holiday-regional"/>Regional</span><span><i className="legend-dot holiday-optional"/>Optional</span></>}
    /> : <div className="card table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Holiday</th><th>Type</th><th>Applicable To</th><th>Greeting</th><th>Actions</th></tr></thead><tbody>{holidays.length === 0 ? <tr><td colSpan="6">No holidays in this month.</td></tr> : holidays.map((holiday) => <tr key={holiday.id}><td>{formatDate(holiday.holiday_date)}</td><td><strong>{holiday.holiday_name}</strong><small>{holiday.description || '—'}</small></td><td>{label(holiday.holiday_type)}</td><td>{holiday.department_name || 'All employees'}</td><td>{holiday.show_greeting ? holiday.greeting_message : 'Disabled'}</td><td>{canManage && <div className="row-actions"><button className="icon-btn" onClick={() => openEdit(holiday)}><Pencil size={16}/></button><button className="icon-btn danger" onClick={() => remove(holiday)}><Trash2 size={16}/></button></div>}</td></tr>)}</tbody></table></div>}

    {selected && <div className="modal-overlay"><div className="modal-card"><div className="section-heading"><h2>{selected.holiday_name}</h2><button className="icon-btn" onClick={() => setSelected(null)}><X size={20}/></button></div><div className="holiday-detail"><p><b>Date:</b> {formatDate(selected.holiday_date)}</p><p><b>Type:</b> {label(selected.holiday_type)}</p><p><b>Applicable:</b> {selected.department_name || 'All employees'}</p><p><b>Description:</b> {selected.description || '—'}</p><p><b>Dashboard Greeting:</b> {selected.show_greeting ? selected.greeting_message : 'Disabled'}</p></div>{canManage && <div className="form-actions"><button className="btn btn-primary" onClick={() => openEdit(selected)}><Pencil size={16}/> Edit / Change Date</button><button className="btn btn-secondary" onClick={() => remove(selected)}><Trash2 size={16}/> Delete</button></div>}</div></div>}

    {showForm && <div className="modal-overlay"><form className="modal-card modal-wide" onSubmit={save}><div className="section-heading"><div><h2>{editing ? 'Edit Holiday' : 'Add Holiday'}</h2><p className="page-subtitle">Editing the date will move the holiday and refresh attendance automatically.</p></div><button className="icon-btn" type="button" onClick={() => setShowForm(false)}><X size={20}/></button></div><div className="form-grid form-grid-3"><label className="form-group"><span>Holiday Name *</span><input className="input" name="holidayName" value={form.holidayName} onChange={setField} required /></label><label className="form-group"><span>Holiday Date *</span><input className="input" type="date" name="holidayDate" value={form.holidayDate} onChange={(event) => { setField(event); const date = event.target.value; setForm((current) => ({ ...current, holidayDate: date, greetingStartDate: current.greetingStartDate || date, greetingEndDate: current.greetingEndDate || date })); }} required /></label><label className="form-group"><span>Type</span><select className="input" name="holidayType" value={form.holidayType} onChange={setField}>{holidayTypes.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label className="form-group"><span>Applicable Department</span><select className="input" name="departmentId" value={form.departmentId} onChange={setField}><option value="">All employees</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="form-group form-span-2"><span>Description</span><input className="input" name="description" value={form.description} onChange={setField} /></label><label className="form-group checkbox-field"><input type="checkbox" name="showGreeting" checked={form.showGreeting} onChange={setField}/><span>Show greeting on dashboard</span></label><label className="form-group form-span-2"><span>Greeting Message</span><textarea className="input" rows="3" name="greetingMessage" value={form.greetingMessage} onChange={setField} placeholder={`Wishing you a Happy ${form.holidayName || 'Holiday'}!`} /></label><label className="form-group"><span>Greeting Start</span><input className="input" type="date" name="greetingStartDate" value={form.greetingStartDate} onChange={setField} /></label><label className="form-group"><span>Greeting End</span><input className="input" type="date" name="greetingEndDate" value={form.greetingEndDate} onChange={setField} /></label></div><div className="form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Holiday'}</button><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button></div></form></div>}
  </div>;
}
