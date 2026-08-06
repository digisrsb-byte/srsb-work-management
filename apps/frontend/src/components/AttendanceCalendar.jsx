import MonthlyCalendar, { shiftMonth } from './MonthlyCalendar.jsx';

const labels = {
  PRESENT: 'Present', ABSENT: 'Absent', HOLIDAY: 'Holiday', LEAVE: 'Approved Leave', HALF_DAY: 'Half Day',
  WEEK_OFF: 'Weekend', MISSING_PUNCH: 'Missing Punch', NOT_MARKED: 'Not Marked', FUTURE: 'Future'
};
const statusClass = (status) => `attendance-${String(status || 'future').toLowerCase()}`;
const time = (value) => value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const hours = (minutes) => `${Math.floor(Number(minutes || 0) / 60)}h ${Number(minutes || 0) % 60}m`;

export default function AttendanceCalendar({ data, month, setMonth, selectedDate, onSelectDate }) {
  return <MonthlyCalendar
    month={month}
    items={data?.calendar || []}
    selectedDate={selectedDate}
    onPrevious={() => setMonth(shiftMonth(month, -1))}
    onNext={() => setMonth(shiftMonth(month, 1))}
    onToday={() => setMonth(new Date().toISOString().slice(0, 7))}
    onSelectDate={(date, item) => onSelectDate?.(date, item)}
    renderCell={({ item }) => item ? <div className={`attendance-calendar-status ${statusClass(item.status)}`}><strong>{labels[item.status] || item.status}</strong>{item.punchIn && <span>{time(item.punchIn)} – {time(item.punchOut)}</span>}{item.totalWorkMinutes > 0 && <span>{hours(item.totalWorkMinutes)}</span>}</div> : null}
    legend={<>{[['PRESENT','Present'],['ABSENT','Absent'],['HOLIDAY','Holiday'],['LEAVE','Leave'],['HALF_DAY','Half Day'],['WEEK_OFF','Weekend / Future']].map(([status,label]) => <span key={status}><i className={`legend-dot ${statusClass(status)}`}/>{label}</span>)}</>}
  />;
}
