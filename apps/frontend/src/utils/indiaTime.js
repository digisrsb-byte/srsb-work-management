export const INDIA_OFFSET_MINUTES = 330;

export function indiaDateValue() {
  return new Date(Date.now() + INDIA_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function indiaMonthValue() {
  return indiaDateValue().slice(0, 7);
}

export function wallClockTime(value, fallback = '—') {
  if (!value) return fallback;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return raw;
  const hour = Number(match[4]);
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, '0')}:${match[5]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function wallClockDateTime(value, fallback = '—') {
  if (!value) return fallback;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return raw;
  const [, year, month, day, hourText, minute, second = '00'] = match;
  const hour = Number(hourText);
  const displayHour = hour % 12 || 12;
  return `${Number(day)}/${Number(month)}/${year}, ${displayHour}:${minute}:${second} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function displayDate(value, fallback = '—') {
  if (!value) return fallback;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}
