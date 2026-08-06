import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import api from '../../services/api.js';
import AttendanceCalendar from '../../components/AttendanceCalendar.jsx';

const statuses = ['PRESENT','ABSENT','HOLIDAY','LEAVE','HALF_DAY','WEEK_OFF','MISSING_PUNCH'];
const label = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const inputDateTime = (date, value) => value ? new Date(value).toISOString().slice(0, 16) : `${date}T09:30`;
const formatTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '—';

export default function AttendanceManagement() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/employees').then((response) => { const list = response.data.data || []; setEmployees(list); if (list.length) setEmployeeId(String(list[0].id)); }).catch((requestError) => setError(requestError.response?.data?.message || 'Employees could not be loaded.'));
  }, []);

  const load = useCallback(async () => {
    if (!employeeId) return;
    try { setLoading(true); const response = await api.get('/attendance/calendar', { params: { employeeId, month } }); setData(response.data.data); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Attendance calendar could not be loaded.'); }
    finally { setLoading(false); }
  }, [employeeId, month]);
  useEffect(() => { load(); }, [load]);

  function openDay(date, item) {
    const record = item || { date, status: 'NOT_MARKED', punchIn: null, punchOut: null, remarks: '' };
    setSelected(record);
    setEdit({ employeeId, date, status: record.status === 'FUTURE' || record.status === 'NOT_MARKED' ? 'PRESENT' : record.status, punchIn: inputDateTime(date, record.punchIn), punchOut: record.punchOut ? inputDateTime(date, record.punchOut) : '', remarks: record.remarks || '' });
  }

  async function save(event) {
    event.preventDefault();
    try { const response = await api.put('/attendance/admin-adjust', edit); setMessage(response.data.message); setSelected(null); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Attendance could not be updated.'); }
  }

  const summary = data?.summary || {};
  return <div className="module-page"><div className="page-heading-row"><div><p className="eyebrow">Attendance Management</p><h1 className="page-title">Employee Attendance Calendar</h1><p className="page-subtitle">Present is green, holiday/Saturday blue, leave yellow, half day orange and no-punch days grey. No-punch days are not marked absent automatically.</p></div><button className="btn btn-secondary" onClick={load}><RefreshCw size={17}/> Refresh</button></div>
    {message && <div className="message message-success">{message}</div>}{error && <div className="message message-error">{error}</div>}
    <div className="card attendance-calendar-filter"><label className="form-group"><span>Employee</span><select className="input" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_id || employee.role})</option>)}</select></label><div className="attendance-summary-inline"><span>Present <b>{summary.PRESENT || 0}</b></span><span>No Punch <b>{summary.NOT_MARKED || 0}</b></span><span>Leave <b>{summary.LEAVE || 0}</b></span><span>Holiday <b>{summary.HOLIDAY || 0}</b></span><span>Half Day <b>{summary.HALF_DAY || 0}</b></span>{summary.ABSENT > 0 && <span>Manually Absent <b>{summary.ABSENT}</b></span>}</div></div>
    {loading ? <div className="card">Loading attendance calendar...</div> : data && <AttendanceCalendar data={data} month={month} setMonth={setMonth} selectedDate={selected?.date} onSelectDate={openDay}/>} 
    {selected && <div className="modal-overlay"><form className="modal-card" onSubmit={save}><div className="section-heading"><div><h2>Attendance — {selected.date}</h2><p className="page-subtitle">Current punch: {formatTime(selected.punchIn)} to {formatTime(selected.punchOut)}{selected.workedOnHoliday ? ` · Worked on Holiday (${selected.holidayLabel || 'Weekly Holiday'})` : ''}</p></div><button className="icon-btn" type="button" onClick={() => setSelected(null)}><X size={20}/></button></div><label className="form-group"><span>Status</span><select className="input" value={edit.status} onChange={(event) => setEdit((current) => ({ ...current, status: event.target.value }))}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label className="form-group"><span>Punch In</span><input className="input" type="datetime-local" value={edit.punchIn} onChange={(event) => setEdit((current) => ({ ...current, punchIn: event.target.value }))}/></label><label className="form-group"><span>Punch Out</span><input className="input" type="datetime-local" value={edit.punchOut} onChange={(event) => setEdit((current) => ({ ...current, punchOut: event.target.value }))}/></label><label className="form-group"><span>Remarks</span><textarea className="input" rows="3" value={edit.remarks} onChange={(event) => setEdit((current) => ({ ...current, remarks: event.target.value }))}/></label><button className="btn btn-primary">Save Attendance</button></form></div>}
  </div>;
}
