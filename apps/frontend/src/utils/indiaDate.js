/** India Standard Time (UTC+05:30) helpers for portal date fields. */

export function indiaDateValue(date = new Date()) {
  return new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export function indiaDateTimeLocal(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const wall = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (wall) return `${wall[1]}T${wall[2]}:${wall[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() + 330 * 60 * 1000).toISOString().slice(0, 16);
}
