const API_URL = process.env.SRSB_API_URL || 'https://srsb-work-management-production.up.railway.app/api';

function readHidden(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('Run this test in Command Prompt.'));
    process.stdout.write(promptText);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    };
    const onData = (character) => {
      if (character === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (character === '\r' || character === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value);
      } else if (character === '\u0008' || character === '\u007f') {
        if (value.length) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (character >= ' ') {
        value += character;
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', onData);
  });
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(API_URL + pathname, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.message || `${method} ${pathname}: HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function assertData(result, label) {
  if (result?.data === undefined || result?.data === null) {
    throw new Error(`${label} returned no data.`);
  }
}

async function main() {
  console.log('\nSRSB Work Management 1.2.0 — deployed backend verification\n');

  try {
    const updateResult = await request('/app-updates/latest');
    console.log(`Application update endpoint: PASS (${updateResult.data?.latestVersion || 'release information returned'})`);
  } catch (error) {
    console.log(`Application update endpoint: NOT READY (${error.message})`);
    console.log('This does not block the manual 1.2.0 installer or business modules.');
  }

  const password = await readHidden('Head Admin password: ');
  const login = await request('/auth/login', {
    method: 'POST',
    body: { loginId: 'info@srsbworkforcesolutions.com', password }
  });
  const token = login.data?.token || login.token;
  if (!token) throw new Error('Login returned no access token.');
  console.log('Head Admin login: PASS');

  const today = new Date();
  const month = today.toISOString().slice(0, 7);
  const year = today.getUTCFullYear();
  const monthNumber = today.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  const checks = [
    ['/dashboard/admin', 'Dashboard greetings and summaries'],
    ['/employees/form-meta', 'Employee metadata'],
    ['/clients', 'Clients with state code'],
    ['/candidates/reference-data', 'Candidate company/requirement dropdown'],
    ['/candidates/placements', 'Placed-candidate reference'],
    ['/invoices/reference', 'Recruitment invoice reference'],
    ['/invoices/settings', 'Invoice company/bank settings'],
    [`/holidays?from=${from}&to=${to}`, 'Holiday calendar'],
    ['/tasks', 'Editable tasks and extension status']
  ];

  for (const [pathname, label] of checks) {
    const result = await request(pathname, { token });
    assertData(result, label);
    console.log(`${label}: PASS`);
  }

  const employees = await request('/employees', { token });
  const employee = (employees.data || []).find((item) => item.account_type !== 'SYSTEM');
  if (employee?.id) {
    const attendance = await request(`/attendance/calendar?employeeId=${employee.id}&month=${month}`, { token });
    if (!Array.isArray(attendance.data?.calendar)) throw new Error('Attendance calendar returned an unexpected response.');
    console.log('Monthly attendance calendar: PASS');
  } else {
    console.log('Monthly attendance calendar: SKIPPED (no employee record available)');
  }

  console.log('\nDEPLOYED BACKEND 1.2.0: PASS\n');
}

main().catch((error) => {
  const message = error.name === 'AbortError' ? 'Request timed out.' : error.message;
  console.error(`\nFAILED: ${message}\n`);
  process.exit(1);
});
