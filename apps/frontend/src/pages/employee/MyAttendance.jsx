import { useCallback, useEffect, useState } from 'react';
import { Clock3, LogIn, LogOut, X } from 'lucide-react';
import api from '../../services/api.js';
import AttendanceCalendar from '../../components/AttendanceCalendar.jsx';

function indiaDateValue() { return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10); }

function wallClockTime(value) {
  if (!value) return '—';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[4]);
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, '0')}:${match[5]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
const formatTime = wallClockTime;
const hours = (minutes) => { const value = Math.max(Number(minutes || 0), 0); return `${Math.floor(value / 60)}h ${value % 60}m`; };

export default function MyAttendance() {
  const [month, setMonth] = useState(indiaDateValue().slice(0, 7));
  const [calendar, setCalendar] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const [calendarResponse, dashboardResponse] = await Promise.all([api.get('/attendance/calendar', { params: { month } }), api.get('/dashboard/employee')]); setCalendar(calendarResponse.data.data); setDashboard(dashboardResponse.data.data); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Attendance could not be loaded.'); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  async function punch(endpoint) {
    try { setProcessing(true); setError(''); const response = await api.post(`/attendance/${endpoint}`); setMessage(response.data.message); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Attendance action failed.'); }
    finally { setProcessing(false); }
  }

  const today = dashboard?.attendance;
  const todayDate = indiaDateValue();
  const todayCalendar = calendar?.calendar?.find(
    (item) => item.date === todayDate
  );
  const hasIn = Boolean(today?.punch_in);
  const hasOut = Boolean(today?.punch_out);
  const summary = calendar?.summary || {};
  const monthlyWorkMinutes = Number(summary.totalWorkMinutes || 0);
  const todayStatus =
    todayCalendar?.status?.replaceAll('_', ' ') ||
    today?.status ||
    'Not Marked';

  return <div className="module-page"><div className="page-heading-row"><div><p className="eyebrow">Employee Self Service</p><h1 className="page-title">My Attendance</h1><p className="page-subtitle">Punch in/out and review your complete monthly attendance in one calendar.</p></div><div className="row-actions"><button className="btn btn-primary" disabled={processing || hasIn} onClick={() => punch('punch-in')}><LogIn size={17}/>{hasIn ? 'Punched In' : 'Punch In'}</button><button className="btn btn-secondary" disabled={processing || !hasIn || hasOut} onClick={() => punch('punch-out')}><LogOut size={17}/>{hasOut ? 'Punched Out' : 'Punch Out'}</button></div></div>
    {message && <div className="message message-success">{message}</div>}{error && <div className="message message-error">{error}</div>}
    <div className="summary-grid summary-grid-4"><div className="summary-card"><Clock3 size={20}/><span>Today</span><strong>{todayStatus}</strong>{todayCalendar?.punchIn && <small>Punch In: {formatTime(todayCalendar.punchIn)}</small>}{todayCalendar?.punchOut && <small>Punch Out: {formatTime(todayCalendar.punchOut)}</small>}{todayCalendar?.workedOnHoliday && <small>Worked on Holiday</small>}</div><div className="summary-card success"><span>Present</span><strong>{summary.PRESENT || 0}</strong></div><div className="summary-card"><span>No Punch / Not Marked</span><strong>{summary.NOT_MARKED || 0}</strong></div><div className="summary-card"><span>Work Time</span><strong>{hours(monthlyWorkMinutes)}</strong><small>Calculated from this calendar month</small></div></div>
    {calendar ? <AttendanceCalendar data={calendar} month={month} setMonth={setMonth} selectedDate={selected?.date} onSelectDate={(date, item) => setSelected(item || { date, status: 'FUTURE' })}/> : <div className="card">Loading attendance calendar...</div>}
    {selected && <div className="modal-overlay"><div className="modal-card"><div className="section-heading"><h2>{selected.date}</h2><button className="icon-btn" onClick={() => setSelected(null)}><X size={20}/></button></div><p><b>Status:</b> {String(selected.status || '').replaceAll('_',' ')}</p>{selected.workedOnHoliday && <p><b>Holiday Work:</b> Worked on Holiday ({selected.holidayLabel || 'Weekly Holiday'})</p>}<p><b>Punch In:</b> {formatTime(selected.punchIn)}</p><p><b>Punch Out:</b> {formatTime(selected.punchOut)}</p><p><b>Worked:</b> {hours(selected.totalWorkMinutes)}</p><p><b>Remarks:</b> {selected.remarks || '—'}</p></div></div>}
  </div>;
}
