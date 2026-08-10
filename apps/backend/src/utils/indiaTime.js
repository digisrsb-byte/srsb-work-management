export const INDIA_OFFSET_MINUTES = 330;
export const INDIA_NOW_SQL = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)';
export const INDIA_DATE_SQL = 'DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE))';
export const FULL_DAY_MINUTES = 480;
export const HALF_DAY_MINUTES = 240;

export function indiaDateNow() {
  return new Date(Date.now() + INDIA_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function normalizeWallClockDateTime(value, label = 'Date/time') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1]} ${match[2]}:${match[3]}:${match[4] || '00'}`;
}

export function wallClockMinutes(start, end) {
  if (!start || !end) return 0;
  const parse = (value) => {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return Number.NaN;
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    );
  };
  const startMs = parse(start);
  const endMs = parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.NaN;
  return Math.round((endMs - startMs) / 60000);
}

export function deriveAttendanceStatus({ punchIn, punchOut, attendanceDate, forcedStatus = null }) {
  if (forcedStatus) return forcedStatus;
  if (!punchIn && !punchOut) return 'ABSENT';
  if (!punchIn || !punchOut) {
    return attendanceDate === indiaDateNow() && punchIn ? 'PRESENT' : 'MISSING_PUNCH';
  }

  const minutes = Math.max(wallClockMinutes(punchIn, punchOut), 0);
  return minutes >= FULL_DAY_MINUTES ? 'PRESENT' : 'HALF_DAY';
}
