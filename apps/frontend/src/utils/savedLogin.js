const SAVED_LOGINS_KEY = 'srsb_saved_logins';
const COMPANY_CODE_KEY = 'srsb_company_code';

function readAll() {
  try {
    const raw = localStorage.getItem(SAVED_LOGINS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(value) {
  localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify(value));
}

export function getLastSavedCompanyCode() {
  const all = readAll();
  if (all.__last?.companyCode) {
    return String(all.__last.companyCode).toUpperCase();
  }
  return localStorage.getItem(COMPANY_CODE_KEY) || '';
}

export function getSavedLogin(companyCode) {
  const code = String(companyCode || '')
    .trim()
    .toUpperCase();
  const all = readAll();
  if (code && all[code]) {
    return {
      companyCode: code,
      loginId: all[code].loginId || '',
      password: all[code].password || '',
      remember: true
    };
  }
  if (all.__last) {
    return {
      companyCode: String(all.__last.companyCode || '').toUpperCase(),
      loginId: all.__last.loginId || '',
      password: all.__last.password || '',
      remember: true
    };
  }
  return null;
}

export function saveLoginCredentials({
  companyCode,
  loginId,
  password,
  remember = true
}) {
  const code = String(companyCode || '')
    .trim()
    .toUpperCase();
  if (!code) return;

  if (!remember) {
    clearSavedLogin(code);
    localStorage.setItem(COMPANY_CODE_KEY, code);
    return;
  }

  const all = readAll();
  const entry = {
    loginId: String(loginId || '').trim(),
    password: String(password || ''),
    savedAt: Date.now()
  };
  all[code] = entry;
  all.__last = {
    companyCode: code,
    ...entry
  };
  writeAll(all);
  localStorage.setItem(COMPANY_CODE_KEY, code);
}

export function clearSavedLogin(companyCode) {
  const code = String(companyCode || '')
    .trim()
    .toUpperCase();
  const all = readAll();
  if (code && all[code]) {
    delete all[code];
  }
  if (
    all.__last &&
    String(all.__last.companyCode || '').toUpperCase() === code
  ) {
    delete all.__last;
  }
  writeAll(all);
}
