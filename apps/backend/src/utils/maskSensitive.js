// Display-only masking for sensitive identifiers. Stored values are never
// modified; callers must drop the raw value from any response they build.

function compact(value) {
  if (value == null) return '';
  return String(value).replace(/[\s-]/g, '');
}

// "XXXXXX1234" — fixed-width prefix so the real length is not revealed.
export function maskAccountNumber(value) {
  const digits = compact(value);
  if (!/^\d{5,}$/.test(digits)) return null;
  return `XXXXXX${digits.slice(-4)}`;
}

// Same display as maskAccountNumber, for records that keep only the last four digits.
export function maskLastFour(lastFour) {
  const digits = compact(lastFour);
  if (!/^\d{4}$/.test(digits)) return null;
  return `XXXXXX${digits}`;
}

// "XXXX XXXX 5678" — only a well-formed 12-digit Aadhaar is masked and shown.
export function maskAadhaar(value) {
  const digits = compact(value);
  if (!/^\d{12}$/.test(digits)) return null;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

// "XXXXXX234F" — only a well-formed PAN (AAAAA9999A) is masked and shown.
export function maskPan(value) {
  const pan = compact(value).toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return null;
  return `XXXXXX${pan.slice(-4)}`;
}
