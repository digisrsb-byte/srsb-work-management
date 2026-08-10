import MonthlyCalendar, { shiftMonth } from './MonthlyCalendar.jsx';
import { indiaMonthValue, wallClockTime } from '../utils/indiaTime.js';


const labels = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HOLIDAY: 'Holiday',
  LEAVE: 'Approved Leave',
  HALF_DAY: 'Half Day',
  WEEK_OFF: 'Weekly Holiday',
  MISSING_PUNCH: 'Missing Punch',
  NOT_MARKED: 'No Punch / Not Marked',
  FUTURE: 'Future'
};

const statusClass = (status) =>
  `attendance-${String(status || 'future').toLowerCase()}`;

const time = wallClockTime;

const hours = (minutes) => { const value = Math.max(Number(minutes || 0), 0); return `${Math.floor(value / 60)}h ${value % 60}m`; };

export default function AttendanceCalendar({
  data,
  month,
  setMonth,
  selectedDate,
  onSelectDate
}) {
  return (
    <MonthlyCalendar
      month={month}
      items={data?.calendar || []}
      selectedDate={selectedDate}
      onPrevious={() => setMonth(shiftMonth(month, -1))}
      onNext={() => setMonth(shiftMonth(month, 1))}
      onToday={() =>
        setMonth(indiaMonthValue())
      }
      onSelectDate={(date, item) =>
        onSelectDate?.(date, item)
      }
      renderCell={({ item }) =>
        item ? (
          <div
            className={`attendance-calendar-status ${statusClass(
              item.status
            )}`}
          >
            <strong>
              {labels[item.status] || item.status}
            </strong>

            {item.workedOnHoliday && (
              <span className="worked-holiday-badge">
                Worked on Holiday
              </span>
            )}

            {!item.workedOnHoliday &&
              item.status === 'HOLIDAY' &&
              item.holidayLabel && (
                <span>{item.holidayLabel}</span>
              )}

            {item.punchIn && (
              <span>Punch In: {time(item.punchIn)}</span>
            )}

            {item.punchOut && (
              <span>Punch Out: {time(item.punchOut)}</span>
            )}

            {item.totalWorkMinutes > 0 && (
              <span>{hours(item.totalWorkMinutes)}</span>
            )}
          </div>
        ) : null
      }
      legend={
        <>
          {[
            ['PRESENT', 'Present'],
            ['HOLIDAY', 'Holiday / Saturday'],
            ['LEAVE', 'Leave'],
            ['HALF_DAY', 'Half Day'],
            ['NOT_MARKED', 'No Punch / Not Marked']
          ].map(([status, label]) => (
            <span key={status}>
              <i
                className={`legend-dot ${statusClass(status)}`}
              />
              {label}
            </span>
          ))}
        </>
      }
    />
  );
}
