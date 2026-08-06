import { ChevronLeft, ChevronRight } from 'lucide-react';

const weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function isoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric'
  });
}

export function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthlyCalendar({
  month,
  items = [],
  selectedDate,
  onSelectDate,
  onPrevious,
  onNext,
  onToday,
  renderCell,
  legend
}) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthIndex = monthNumber - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const byDate = new Map(items.map((item) => [String(item.date || item.holiday_date).slice(0, 10), item]));
  const cells = [];
  for (let blank = 0; blank < firstWeekday; blank += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) {
    const date = isoDate(year, monthIndex, day);
    cells.push({ date, day, item: byDate.get(date) || null });
  }
  while (cells.length % 7) cells.push(null);

  return (
    <div className="calendar-shell">
      <div className="calendar-toolbar">
        <button className="icon-btn" type="button" onClick={onPrevious} aria-label="Previous month"><ChevronLeft size={20} /></button>
        <div className="calendar-month-title">{monthLabel(month)}</div>
        <button className="icon-btn" type="button" onClick={onNext} aria-label="Next month"><ChevronRight size={20} /></button>
        <button className="btn btn-secondary calendar-today" type="button" onClick={onToday}>Today</button>
      </div>
      <div className="calendar-weekdays">
        {weekDays.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell) return <div className="calendar-cell calendar-cell-empty" key={`blank-${index}`} />;
          const content = renderCell ? renderCell(cell) : null;
          return (
            <button
              key={cell.date}
              type="button"
              className={`calendar-cell ${selectedDate === cell.date ? 'selected' : ''}`}
              onClick={() => onSelectDate?.(cell.date, cell.item)}
            >
              <span className="calendar-day-number">{cell.day}</span>
              {content}
            </button>
          );
        })}
      </div>
      {legend && <div className="calendar-legend">{legend}</div>}
    </div>
  );
}
