/**
 * Smoke tests for Phases 5-15 APIs.
 * Usage: node scripts/smoke-phases-5-15.mjs
 */
const base = process.env.API_URL || 'http://localhost:5000/api';

async function req(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const login = await req('POST', '/auth/login', null, {
  loginId: 'admin@srsbworkforcesolutions.com',
  password: 'Admin@123'
});
assert(login.status === 200, 'login failed');
const token = login.data.data.token;

const companies = await req('GET', '/access/companies', token);
assert(companies.status === 200 && companies.data.data?.length, 'companies failed');

for (const path of [
  '/reports/headcount',
  '/reports/payroll',
  '/payroll/runs',
  '/assets',
  '/access-requests'
]) {
  const res = await req('GET', path, token);
  assert(res.status === 200, `${path} failed: ${res.status}`);
  console.log('OK', path);
}

console.log('Smoke tests passed.');
