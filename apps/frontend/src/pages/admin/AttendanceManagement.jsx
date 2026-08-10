import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Pencil, RefreshCw, Users, X } from 'lucide-react';
import api from '../../services/api.js';
import MonthlyCalendar, { shiftMonth } from '../../components/MonthlyCalendar.jsx';
import { indiaDateValue } from '../../utils/indiaDate.js';

const editableStatuses = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
  'WEEK_OFF',
  'MISSING_PUNCH'
];

const statusLabels = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half Day',
  LEAVE: 'Approved Leave',
  HOLIDAY: 'Holiday',
  WEEK_OFF: 'Weekly Holiday',
  MISSING_PUNCH: 'Missing Punch',
  WORKED_ON_HOLIDAY: 'Worked on Holiday',
  NOT_MARKED: 'Not Punched / Not Marked',
  FUTURE: 'Future'
};

function label(value) {
  return statusLabels[value] || String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function wallClockTime(value) {
  if (!value) return '—';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[4]);
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, '0')}:${match[5]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

const time = wallClockTime;

function hours(minutes) {
  const value = Math.max(Number(minutes || 0), 0);
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function inputDateTime(date, value, fallback) {
  if (value) {
    const wallClock = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
    if (wallClock) return `${wallClock[1]}T${wallClock[2]}:${wallClock[3]}`;
  }
  return fallback ? `${date}T${fallback}` : '';
}

export default function AttendanceManagement() {
  const today = useMemo(() => indiaDateValue(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/attendance/day-overview', {
        params: { date: selectedDate }
      });
      setData(response.data.data || null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Attendance for the selected date could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);


  function moveMonth(amount) {
    const nextMonth = shiftMonth(month, amount);
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
    setMessage('');
    setError('');
  }

  function chooseDate(date) {
    setSelectedDate(date);
    setMonth(date.slice(0, 7));
    setMessage('');
    setError('');
  }

  function openEdit(employee) {
    if (data?.isFutureDate) return;
    const status = ['FUTURE', 'NOT_MARKED', 'WORKED_ON_HOLIDAY'].includes(employee.status)
      ? 'PRESENT'
      : employee.status;
    setEditing({
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      date: selectedDate,
      status: editableStatuses.includes(status) ? status : 'PRESENT',
      punchIn: inputDateTime(selectedDate, employee.punchIn, '09:30'),
      punchOut: inputDateTime(selectedDate, employee.punchOut, ''),
      remarks: employee.remarks || ''
    });
  }

  async function save(event) {
    event.preventDefault();
    try {
      setError('');
      const response = await api.put('/attendance/admin-adjust', editing);
      setMessage(response.data.message || 'Attendance updated successfully.');
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Attendance could not be updated.'
      );
    }
  }

  const summary = data?.summary || {};
  const employees = data?.employees || [];

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Attendance Management</p>
          <h1 className="page-title">Daily Attendance Calendar</h1>
          <p className="page-subtitle">
            Select today, yesterday, tomorrow or any date to see every employee,
            their attendance status and total working hours.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={load}>
          <RefreshCw size={17} /> Refresh
        </button>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      <div className="attendance-admin-layout">
        <div className="card attendance-admin-calendar">
          <MonthlyCalendar
            month={month}
            items={[]}
            selectedDate={selectedDate}
            onPrevious={() => moveMonth(-1)}
            onNext={() => moveMonth(1)}
            onToday={() => chooseDate(today)}
            onSelectDate={(date) => chooseDate(date)}
            renderCell={({ date }) => {
              const weekday = new Date(`${date}T00:00:00`).getDay();
              return (
                <div className="attendance-admin-date-cell">
                  {date === today && <span className="today-chip">Today</span>}
                  {weekday === 6 && <span className="holiday-chip">Saturday</span>}
                  {date === selectedDate && <strong>Selected</strong>}
                </div>
              );
            }}
          />
        </div>

        <div className="attendance-selected-date-panel">
          <div className="card attendance-date-heading">
            <div>
              <p className="eyebrow">Selected Date</p>
              <h2>{selectedDate}</h2>
              <p>
                {data?.weekday ? label(data.weekday) : ''}
                {data?.isFutureDate ? ' · Future date' : ''}
              </p>
            </div>
            <CalendarDays size={30} />
          </div>

          <div className="attendance-day-summary-grid">
            <div className="card"><span>Total Employees</span><strong>{summary.totalEmployees || 0}</strong><Users size={19} /></div>
            <div className="card summary-present"><span>Present</span><strong>{summary.present || 0}</strong></div>
            <div className="card summary-absent"><span>Absent</span><strong>{summary.absent || 0}</strong></div>
            <div className="card summary-leave"><span>On Leave</span><strong>{summary.leave || 0}</strong></div>
            <div className="card summary-holiday"><span>Holiday</span><strong>{summary.holiday || 0}</strong></div>
            <div className="card"><span>Not Marked</span><strong>{summary.notMarked || 0}</strong></div>
            <div className="card"><span>Future</span><strong>{summary.future || 0}</strong></div>
            <div className="card"><span>Total Work Time</span><strong>{hours(summary.totalWorkMinutes)}</strong><Clock3 size={19} /></div>
          </div>
        </div>
      </div>

      <div className="card table-wrap attendance-day-table-card">
        <div className="section-heading">
          <div>
            <h2>Employees — {selectedDate}</h2>
            <p className="page-subtitle">
              Past dates show Present or Absent. Today shows Present or Not Marked.
              Future dates never show Absent.
            </p>
          </div>
        </div>

        <table className="data-table attendance-day-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Status</th>
              <th>Punch In</th>
              <th>Punch Out</th>
              <th>Working Hours</th>
              <th>Remarks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8">Loading attendance…</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan="8">No active employees were found.</td></tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.employeeId}>
                  <td>
                    <strong>{employee.employeeName}</strong>
                    <small>{employee.employeeCode || '—'} · {employee.designation || '—'}</small>
                  </td>
                  <td>{employee.department || '—'}</td>
                  <td>
                    <span className={`attendance-status-pill status-${String(employee.status).toLowerCase()}`}>
                      {label(employee.status)}
                    </span>
                    {employee.holidayName && <small>{employee.holidayName}</small>}
                  </td>
                  <td>{time(employee.punchIn)}</td>
                  <td>{time(employee.punchOut)}</td>
                  <td>{hours(employee.totalWorkMinutes)}</td>
                  <td>{employee.remarks || employee.leaveType || '—'}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-small"
                      type="button"
                      disabled={Boolean(data?.isFutureDate)}
                      onClick={() => openEdit(employee)}
                    >
                      <Pencil size={15} /> Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay">
          <form className="modal-card" onSubmit={save}>
            <div className="section-heading">
              <div>
                <h2>Edit Attendance</h2>
                <p className="page-subtitle">{editing.employeeName} · {editing.date}</p>
              </div>
              <button className="icon-btn" type="button" onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </div>

            <label className="form-group">
              <span>Status</span>
              <select
                className="input"
                value={editing.status}
                onChange={(event) => setEditing((current) => ({ ...current, status: event.target.value }))}
              >
                {editableStatuses.map((status) => (
                  <option key={status} value={status}>{label(status)}</option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span>Punch In</span>
              <input
                className="input"
                type="datetime-local"
                value={editing.punchIn}
                onChange={(event) => setEditing((current) => ({ ...current, punchIn: event.target.value }))}
              />
            </label>

            <label className="form-group">
              <span>Punch Out</span>
              <input
                className="input"
                type="datetime-local"
                value={editing.punchOut}
                onChange={(event) => setEditing((current) => ({ ...current, punchOut: event.target.value }))}
              />
            </label>

            <label className="form-group">
              <span>Remarks</span>
              <textarea
                className="input"
                rows="3"
                value={editing.remarks}
                onChange={(event) => setEditing((current) => ({ ...current, remarks: event.target.value }))}
              />
            </label>

            <button className="btn btn-primary">Save Attendance</button>
          </form>
        </div>
      )}
    </div>
  );
}
