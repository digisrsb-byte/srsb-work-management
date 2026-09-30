import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_OFF_CORRECTION_MESSAGE,
  addDays,
  isValidDateKey,
  monthRange,
  parseWorkingDays,
  resolveDay,
  summarizeDays
} from '../src/services/attendanceDayRules.js';

// Fictional calendar: 2030-01-07 is a Monday; 2030-01-12/13 are Saturday/Sunday.
const MON_FRI = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const TODAY = '2030-01-16';
const day = (dateKey, extra = {}) => resolveDay({ dateKey, today: TODAY, workingDays: MON_FRI, ...extra });

describe('attendance day rules', () => {
  it('parses the company work week and falls back to Monday-Friday', () => {
    assert.deepEqual(parseWorkingDays('MON,TUE,WED,THU,FRI'), MON_FRI);
    assert.deepEqual(parseWorkingDays(' mon, sat ,xyz'), ['MON', 'SAT']);
    assert.deepEqual(parseWorkingDays(''), MON_FRI);
    assert.deepEqual(parseWorkingDays(null), MON_FRI);
  });

  it('validates date keys and month ranges', () => {
    assert.equal(isValidDateKey('2030-02-28'), true);
    assert.equal(isValidDateKey('2030-02-30'), false);
    assert.equal(isValidDateKey('28/02/2030'), false);
    assert.deepEqual(monthRange('2032-02'), { start: '2032-02-01', end: '2032-02-29', days: 29 });
    assert.equal(addDays('2030-12-31', 1), '2031-01-01');
  });

  it('treats Saturday and Sunday without records as weekly off, never absent', () => {
    assert.equal(day('2030-01-12').status, 'WEEKLY_OFF');
    assert.equal(day('2030-01-13').status, 'WEEKLY_OFF');
    assert.equal(day('2030-01-12').correctable, false);
  });

  it('marks past scheduled days without a record as Not Marked and correctable', () => {
    const result = day('2030-01-14');
    assert.equal(result.status, 'NOT_MARKED');
    assert.equal(result.correctable, true);
  });

  it('never marks future dates absent, even with an ABSENT row', () => {
    assert.equal(day('2030-01-17').status, 'UPCOMING');
    assert.equal(day('2030-01-17', { record: { status: 'ABSENT' } }).status, 'UPCOMING');
    assert.equal(day('2030-01-17').correctable, false);
    assert.equal(day('2030-01-19').status, 'WEEKLY_OFF');
  });

  it('shows today as not punched in, then in progress after punch-in', () => {
    assert.equal(day(TODAY).status, 'NOT_PUNCHED_IN');
    assert.equal(day(TODAY, { record: { status: 'PRESENT', punch_in: '2030-01-16 09:05:00' } }).status, 'IN_PROGRESS');
  });

  it('keeps stored statuses for working days', () => {
    for (const status of ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'MISSING_PUNCH']) {
      assert.equal(day('2030-01-14', { record: { status, punch_in: null } }).status, status);
    }
  });

  it('flags a past open punch without changing its stored status', () => {
    const result = day('2030-01-14', { record: { status: 'PRESENT', punch_in: '2030-01-14 09:00:00' } });
    assert.equal(result.status, 'PRESENT');
    assert.equal(result.punchOutMissing, true);
  });

  it('does not count a short shift on a weekly off as absent', () => {
    const result = day('2030-01-12', {
      record: { status: 'ABSENT', punch_in: '2030-01-12 10:00:00', punch_out: '2030-01-12 11:00:00', total_work_minutes: 60 }
    });
    assert.equal(result.status, 'WEEKLY_OFF');
    assert.equal(result.workMinutes, 60);
  });

  it('applies national and company holidays; optional holidays stay working days', () => {
    const publicHoliday = day('2030-01-14', { holidays: [{ holiday_name: 'Fictional Day', holiday_type: 'NATIONAL' }] });
    assert.equal(publicHoliday.status, 'HOLIDAY');
    assert.equal(publicHoliday.correctable, false);
    assert.equal(day('2030-01-14', { holidays: [{ holiday_name: 'Co Day', holiday_type: 'COMPANY' }] }).status, 'HOLIDAY');
    const optional = day('2030-01-14', { holidays: [{ holiday_name: 'Opt Day', holiday_type: 'OPTIONAL' }] });
    assert.equal(optional.status, 'NOT_MARKED');
    assert.equal(optional.holidays[0].dayOff, false);
    assert.equal(day('2030-01-17', { holidays: [{ holiday_name: 'Future', holiday_type: 'PUBLIC' }] }).status, 'HOLIDAY');
  });

  it('shows approved leave on unrecorded working days, including future ones', () => {
    const leaves = [{ start_date: '2030-01-10', end_date: '2030-01-18', leave_type: 'CASUAL', duration_type: 'FULL_DAY' }];
    assert.equal(day('2030-01-10', { leaves }).status, 'LEAVE');
    assert.equal(day('2030-01-17', { leaves }).status, 'LEAVE');
    assert.equal(day('2030-01-12', { leaves }).status, 'WEEKLY_OFF');
    assert.equal(day('2030-01-15', { leaves, record: { status: 'PRESENT', punch_in: 'x', punch_out: 'y' } }).status, 'PRESENT');
  });

  it('shows nothing before the joining date', () => {
    const result = day('2030-01-08', { joiningDate: '2030-01-09' });
    assert.equal(result.status, 'BEFORE_JOINING');
    assert.equal(result.correctable, false);
  });

  it('summarizes counts and work time without counting days off as absent', () => {
    const days = [
      day('2030-01-10', { record: { status: 'PRESENT', punch_in: 'a', punch_out: 'b', total_work_minutes: 540 } }),
      day('2030-01-11', { record: { status: 'ABSENT', total_work_minutes: 0 } }),
      day('2030-01-12', { record: { status: 'ABSENT', punch_in: 'a', punch_out: 'b', total_work_minutes: 90 } }),
      day('2030-01-13'),
      day('2030-01-14'),
      day('2030-01-15', { holidays: [{ holiday_name: 'Fictional', holiday_type: 'PUBLIC' }] }),
      day(TODAY, { record: { status: 'PRESENT', punch_in: 'a', total_work_minutes: 30 } }),
      day('2030-01-17')
    ];
    const { counts, workMinutes, scheduledWorkingDays } = summarizeDays(days);
    assert.equal(counts.PRESENT, 2);
    assert.equal(counts.ABSENT, 1);
    assert.equal(counts.WEEKLY_OFF, 2);
    assert.equal(counts.HOLIDAY, 1);
    assert.equal(counts.NOT_MARKED, 1);
    assert.equal(workMinutes, 540 + 90 + 30);
    assert.equal(scheduledWorkingDays, 5);
  });

  it('uses the exact day-off correction message', () => {
    assert.equal(DAY_OFF_CORRECTION_MESSAGE, 'That day is a weekly off/holiday. No correction needed.');
  });
});
