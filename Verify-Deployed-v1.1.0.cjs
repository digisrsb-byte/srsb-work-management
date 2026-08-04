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
  const response = await fetch(API_URL + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.message || `${method} ${pathname}: HTTP ${response.status}`);
  return data;
}

async function main() {
  console.log('\nSRSB Work Management 1.1.0 — deployed backend verification\n');

  try {
    const updateResponse = await fetch(API_URL + '/app-updates/latest', {
      headers: { Accept: 'application/json' }
    });
    const updateData = await updateResponse.json().catch(() => ({}));
    if (updateResponse.ok && updateData.success) {
      console.log(`Application update endpoint: PASS (latest ${updateData.data?.latestVersion || 'release found'})`);
    } else {
      console.log(`Application update endpoint: NOT READY (${updateData.message || `HTTP ${updateResponse.status}`})`);
      console.log('This is expected until the first GitHub Release exists and, for a private repository, GITHUB_RELEASE_TOKEN is set in Railway.');
    }
  } catch (error) {
    console.log(`Application update endpoint: NOT READY (${error.message})`);
  }
  const password = await readHidden('Head Admin password: ');
  const login = await request('/auth/login', {
    method: 'POST',
    body: { loginId: 'info@srsbworkforcesolutions.com', password }
  });
  const token = login.data?.token || login.token;
  if (!token) throw new Error('Login returned no access token.');
  console.log('Login: PASS');

  const checks = [
    ['/employees/form-meta', 'Employee Department/Manager metadata'],
    ['/clients', 'Expanded Clients'],
    ['/clients/reference', 'Client dropdown reference'],
    ['/candidates', 'Candidates and placement history'],
    ['/invoices', 'Invoices'],
    ['/attendance-corrections', 'Attendance corrections'],
    ['/holidays', 'Holiday calendar']
  ];

  for (const [pathname, label] of checks) {
    const result = await request(pathname, { token });
    if (!Array.isArray(result.data) && typeof result.data !== 'object') {
      throw new Error(`${label} returned an unexpected response.`);
    }
    console.log(`${label}: PASS`);
  }

  console.log('\nDEPLOYED BACKEND 1.1.0: PASS\n');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
