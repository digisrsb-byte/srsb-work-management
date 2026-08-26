import {
  useCallback,
  useEffect,
  useState
} from 'react';
import {
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  X
} from 'lucide-react';
import api from '../../services/api.js';
import AttendanceCalendar from '../../components/AttendanceCalendar.jsx';
import {
  indiaDateValue,
  wallClockTime
} from '../../utils/indiaTime.js';

const formatTime = wallClockTime;

const hours = (minutes) => {
  const value = Math.max(
    Number(minutes || 0),
    0
  );

  return `${Math.floor(value / 60)}h ${
    value % 60
  }m`;
};

const breakTypes = [
  ['LUNCH', 'Lunch Break'],
  ['TEA', 'Tea Break'],
  ['PERSONAL', 'Personal Break'],
  ['OTHER', 'Other Break']
];

export default function MyAttendance() {
  const [month, setMonth] = useState(
    indiaDateValue().slice(0, 7)
  );
  const [calendar, setCalendar] =
    useState(null);
  const [todaySummary, setTodaySummary] =
    useState(null);
  const [selected, setSelected] =
    useState(null);
  const [processing, setProcessing] =
    useState(false);
  const [
    showBreakSelector,
    setShowBreakSelector
  ] = useState(false);
  const [breakType, setBreakType] =
    useState('LUNCH');
  const [message, setMessage] =
    useState('');
  const [error, setError] =
    useState('');

  const load = useCallback(async () => {
    try {
      setError('');

      const [
        calendarResponse,
        todayResponse
      ] = await Promise.all([
        api.get('/attendance/calendar', {
          params: { month }
        }),
        api.get('/attendance/today-summary')
      ]);

      setCalendar(
        calendarResponse.data.data
      );

      setTodaySummary(
        todayResponse.data.data
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Attendance could not be loaded.'
      );
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function punch(endpoint) {
    try {
      setProcessing(true);
      setError('');

      const response = await api.post(
        `/attendance/${endpoint}`
      );

      setMessage(response.data.message);
      setShowBreakSelector(false);

      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Attendance action failed.'
      );
    } finally {
      setProcessing(false);
    }
  }

  async function startBreak() {
    try {
      setProcessing(true);
      setError('');

      const response = await api.post(
        '/attendance/break/start',
        { breakType }
      );

      setMessage(response.data.message);
      setShowBreakSelector(false);

      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Break could not be started.'
      );
    } finally {
      setProcessing(false);
    }
  }

  async function endBreak() {
    try {
      setProcessing(true);
      setError('');

      const response = await api.post(
        '/attendance/break/end'
      );

      setMessage(response.data.message);

      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Break could not be ended.'
      );
    } finally {
      setProcessing(false);
    }
  }

  const today =
    todaySummary?.attendance;

  const activeBreak =
    todaySummary?.activeBreak;

  const breaks =
    todaySummary?.breaks || [];

  const hasIn = Boolean(
    today?.punch_in
  );

  const hasOut = Boolean(
    today?.punch_out
  );

  const summary =
    calendar?.summary || {};

  const monthlyWorkMinutes = Number(
    summary.totalWorkMinutes || 0
  );

  const todayStatus = activeBreak
    ? `On ${activeBreak.breakTypeLabel}`
    : hasIn && !hasOut
      ? 'Working'
      : String(
          today?.status || 'Not Marked'
        ).replaceAll('_', ' ');

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">
            Employee Self Service
          </p>
          <h1 className="page-title">
            My Attendance
          </h1>
          <p className="page-subtitle">
            Punch in, manage breaks and review
            effective working hours.
          </p>
        </div>

        <div className="row-actions">
          <button
            className="btn btn-primary"
            disabled={
              processing || hasIn
            }
            onClick={() =>
              punch('punch-in')
            }
          >
            <LogIn size={17} />
            {hasIn
              ? 'Punched In'
              : 'Punch In'}
          </button>

          {hasIn &&
            !hasOut &&
            !activeBreak && (
              <button
                className="btn btn-secondary"
                disabled={processing}
                onClick={() =>
                  setShowBreakSelector(
                    (current) => !current
                  )
                }
              >
                <Coffee size={17} />
                Start Break
              </button>
            )}

          {activeBreak && (
            <button
              className="btn btn-secondary"
              disabled={processing}
              onClick={endBreak}
            >
              <Coffee size={17} />
              End{' '}
              {activeBreak.breakTypeLabel}
            </button>
          )}

          <button
            className="btn btn-secondary"
            disabled={
              processing ||
              !hasIn ||
              hasOut ||
              Boolean(activeBreak)
            }
            onClick={() =>
              punch('punch-out')
            }
          >
            <LogOut size={17} />
            {hasOut
              ? 'Punched Out'
              : 'Punch Out'}
          </button>
        </div>
      </div>

      {message && (
        <div className="message message-success">
          {message}
        </div>
      )}

      {error && (
        <div className="message message-error">
          {error}
        </div>
      )}

      {showBreakSelector &&
        hasIn &&
        !hasOut &&
        !activeBreak && (
          <div className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  Start Break
                </p>

                <h2>
                  Select Break Type
                </h2>

                <p className="page-subtitle">
                  Lunch includes up to 30 minutes
                  per day. Extra Lunch and all
                  Tea, Personal and Other breaks
                  are deducted.
                </p>
              </div>
            </div>

            <label className="form-group">
              <span>Break Type</span>

              <select
                className="input"
                value={breakType}
                onChange={(event) =>
                  setBreakType(
                    event.target.value
                  )
                }
              >
                {breakTypes.map(
                  ([value, text]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {text}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="row-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={processing}
                onClick={startBreak}
              >
                <Coffee size={17} />
                Start Break
              </button>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={() =>
                  setShowBreakSelector(
                    false
                  )
                }
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      <div className="summary-grid summary-grid-4">
        <div className="summary-card">
          <Clock3 size={20} />
          <span>Today</span>
          <strong>{todayStatus}</strong>

          {today?.punch_in && (
            <small>
              Punch In:{' '}
              {formatTime(
                today.punch_in
              )}
            </small>
          )}

          {today?.punch_out && (
            <small>
              Punch Out:{' '}
              {formatTime(
                today.punch_out
              )}
            </small>
          )}
        </div>

        <div className="summary-card">
          <span>
            Effective Work
          </span>
          <strong>
            {hours(
              today?.effectiveWorkMinutes ||
                0
            )}
          </strong>
          <small>
            After deductible breaks
          </small>
        </div>

        <div className="summary-card">
          <span>Total Break</span>
          <strong>
            {hours(
              todaySummary
                ?.totalBreakMinutes || 0
            )}
          </strong>
          <small>
            Included Lunch:{' '}
            {hours(
              todaySummary
                ?.includedBreakMinutes || 0
            )}
          </small>
        </div>

        <div className="summary-card">
          <span>
            Deducted Break
          </span>
          <strong>
            {hours(
              todaySummary
                ?.deductedBreakMinutes || 0
            )}
          </strong>
          <small>
            Extra Lunch +
            Tea/Personal/Other
          </small>
        </div>

        <div className="summary-card success">
          <span>Present</span>
          <strong>
            {summary.PRESENT || 0}
          </strong>
        </div>

        <div className="summary-card">
          <span>
            No Punch / Not Marked
          </span>
          <strong>
            {summary.NOT_MARKED || 0}
          </strong>
        </div>

        <div className="summary-card">
          <span>Work Time</span>
          <strong>
            {hours(monthlyWorkMinutes)}
          </strong>
          <small>
            Calculated from this calendar month
          </small>
        </div>
      </div>

      <div className="card table-wrap">
        <div className="section-heading">
          <div>
            <h2>
              Today's Break History
            </h2>
            <p className="page-subtitle">
              Lunch includes up to 30 minutes
              per day.
            </p>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Break Type</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Included</th>
              <th>Deducted</th>
            </tr>
          </thead>

          <tbody>
            {breaks.length ? (
              breaks.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>
                      {item.breakTypeLabel}
                    </strong>

                    {item.isActive && (
                      <small>
                        Currently on break
                      </small>
                    )}
                  </td>

                  <td>
                    {formatTime(
                      item.startedAt
                    )}
                  </td>

                  <td>
                    {item.endedAt
                      ? formatTime(
                          item.endedAt
                        )
                      : 'Active'}
                  </td>

                  <td>
                    {hours(
                      item.durationMinutes
                    )}
                  </td>

                  <td>
                    {hours(
                      item.includedMinutes
                    )}
                  </td>

                  <td>
                    {hours(
                      item.deductedMinutes
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">
                  No breaks recorded today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {calendar ? (
        <AttendanceCalendar
          data={calendar}
          month={month}
          setMonth={setMonth}
          selectedDate={
            selected?.date
          }
          onSelectDate={(
            date,
            item
          ) =>
            setSelected(
              item || {
                date,
                status: 'FUTURE'
              }
            )
          }
        />
      ) : (
        <div className="card">
          Loading attendance calendar...
        </div>
      )}

      {selected && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="section-heading">
              <h2>
                {selected.date}
              </h2>

              <button
                className="icon-btn"
                onClick={() =>
                  setSelected(null)
                }
              >
                <X size={20} />
              </button>
            </div>

            <p>
              <b>Status:</b>{' '}
              {String(
                selected.status || ''
              ).replaceAll('_', ' ')}
            </p>

            {selected.workedOnHoliday && (
              <p>
                <b>
                  Holiday Work:
                </b>{' '}
                Worked on Holiday (
                {selected.holidayLabel ||
                  'Weekly Holiday'}
                )
              </p>
            )}

            <p>
              <b>Punch In:</b>{' '}
              {formatTime(
                selected.punchIn
              )}
            </p>

            <p>
              <b>Punch Out:</b>{' '}
              {formatTime(
                selected.punchOut
              )}
            </p>

            <p>
              <b>Worked:</b>{' '}
              {hours(
                selected.totalWorkMinutes
              )}
            </p>

            <p>
              <b>Total Break:</b>{' '}
              {hours(
                selected.totalBreakMinutes
              )}
            </p>

            <p>
              <b>Included Break:</b>{' '}
              {hours(
                selected
                  .includedBreakMinutes
              )}
            </p>

            <p>
              <b>Deducted Break:</b>{' '}
              {hours(
                selected
                  .deductedBreakMinutes
              )}
            </p>

            <p>
              <b>Remarks:</b>{' '}
              {selected.remarks || '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
