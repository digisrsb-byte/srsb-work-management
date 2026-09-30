import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, LockOpen, ShieldCheck } from 'lucide-react';
import api from '../../services/api.js';
import { Modal } from './assets/assetUi.jsx';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function previousMonthValue() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDay(value) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const BLOCKER_LINKS = {
  PENDING_CORRECTIONS: { to: '/admin/attendance-corrections', label: 'Review corrections' }
};

/**
 * Month-end attendance finalization for payroll. Finalizing locks the month's attendance
 * (overrides and corrections are refused by the API) and unblocks payroll approval.
 */
export default function AttendanceFinalizationCard({ role }) {
  const [searchParams] = useSearchParams();
  const presetPeriod = /^\d{4}-\d{2}$/.test(searchParams.get('finalize') || '') ? searchParams.get('finalize') : null;
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [period, setPeriod] = useState(presetPeriod || previousMonthValue());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const canFinalize = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(role);
  const canReopen = ['SUPER_ADMIN', 'ADMIN'].includes(role);
  const [year, month] = period.split('-').map(Number);
  const label = `${MONTHS[month - 1]} ${year}`;

  useEffect(() => {
    api
      .get('/access/companies')
      .then((res) => {
        const list = res.data.data || [];
        setCompanies(list);
        if (list[0]) setCompanyId(String(list[0].id));
      })
      .catch(() => setError('Unable to load companies.'));
  }, []);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/attendance/periods', { params: { companyId, year, month } });
      setSummary(res.data.data);
    } catch (err) {
      setSummary(null);
      setError(err.response?.data?.message || 'Unable to load the attendance summary.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMessage('');
    load();
  }, [companyId, period]);

  async function finalize() {
    setBusy(true);
    setActionError('');
    try {
      const res = await api.post('/attendance/periods/finalize', { companyId: Number(companyId), year, month });
      setSummary(res.data.data);
      setMessage(res.data.message);
      setConfirmOpen(false);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Unable to finalize attendance.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen(event) {
    event.preventDefault();
    if (!reopenReason.trim()) {
      setActionError('Enter a reason for reopening.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const res = await api.post('/attendance/periods/reopen', {
        companyId: Number(companyId),
        year,
        month,
        reason: reopenReason.trim()
      });
      setSummary(res.data.data);
      setMessage(res.data.message);
      setReopenOpen(false);
      setReopenReason('');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Unable to reopen attendance.');
    } finally {
      setBusy(false);
    }
  }

  const finalized = summary?.status === 'FINALIZED';
  const run = summary?.payrollRun;
  const stats = summary
    ? [
        ['Employees', summary.employees],
        ['Present days', summary.present],
        ['Half days', summary.halfDay],
        ['Absent days', summary.absent],
        ['Leave days', summary.leave],
        ['Missing punch', summary.missingPunch],
        ['Open punches', summary.openPunches],
        ['Pending corrections', summary.pendingCorrections]
      ]
    : [];

  return (
    <section className="card" style={{ marginBottom: 20 }} aria-labelledby="att-final-title">
      <div className="section-heading" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h2 id="att-final-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {finalized ? <Lock size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
            Attendance finalization for payroll
          </h2>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
            Review the month, resolve open items, then finalize. Payroll can only be approved on finalized attendance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {companies.length > 1 ? (
            <select
              className="input"
              style={{ width: 'auto' }}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              aria-label="Company"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : null}
          <input
            className="input"
            type="month"
            style={{ width: 'auto' }}
            value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
            aria-label="Attendance month"
          />
          {summary ? (
            <span className={`badge badge-${summary.status.toLowerCase()}`}>
              {finalized ? 'Finalized' : summary.status === 'REOPENED' ? 'Reopened' : 'Open'}
            </span>
          ) : null}
        </div>
      </div>

      {error ? <div className="message message-error" role="alert">{error}</div> : null}
      {message ? <div className="message message-success" role="status" style={{ marginBottom: 12 }}>{message}</div> : null}

      {loading && !summary ? (
        <div className="wf-kpis" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="wf-kpi"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 8, width: '40%' }} /></div>
          ))}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="wf-kpis">
            {stats.map(([name, value]) => (
              <div key={name} className="wf-kpi">
                <span>{name}</span>
                <strong
                  style={
                    ['Open punches', 'Pending corrections'].includes(name) && value > 0
                      ? { color: '#b91c1c' }
                      : undefined
                  }
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <p className="helper-text" style={{ margin: '8px 0 0' }}>
            {summary.employeesWithRecords} of {summary.employees} employees have attendance recorded for {label}. Days
            without a record are paid in payroll; only absences and missing punches are loss of pay.
          </p>

          {finalized ? (
            <div className="message message-success" style={{ marginTop: 14, display: 'grid', gap: 6 }}>
              <strong>
                Attendance for {label} is finalized and locked
                {summary.lock?.finalizedByName ? ` by ${summary.lock.finalizedByName}` : ''} on{' '}
                {formatDateTime(summary.lock?.finalizedAt)}.
              </strong>
              <span>Overrides and correction requests for this month are refused until it is reopened.</span>
              <span>
                <strong>Next step:</strong>{' '}
                {run ? (
                  <Link to={`/admin/payroll?tab=runs&run=${run.id}`}>
                    Open payroll run ({run.status.toLowerCase()}) and recalculate
                  </Link>
                ) : (
                  <Link to="/admin/payroll?tab=runs">Create the payroll run for {label}</Link>
                )}
              </span>
            </div>
          ) : (
            <>
              {summary.status === 'REOPENED' && summary.lock?.reopenReason ? (
                <div className="message message-warning" style={{ marginTop: 14 }}>
                  Reopened by {summary.lock.reopenedByName || 'an admin'} on {formatDateTime(summary.lock.reopenedAt)}:{' '}
                  {summary.lock.reopenReason}
                </div>
              ) : null}
              {summary.blockers.length ? (
                <div className="message message-warning" style={{ marginTop: 14 }}>
                  <strong>Resolve before finalizing:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {summary.blockers.map((b) => (
                      <li key={b.code}>
                        {b.message}{' '}
                        {BLOCKER_LINKS[b.code] ? <Link to={BLOCKER_LINKS[b.code].to}>{BLOCKER_LINKS[b.code].label}</Link> : null}
                        {b.code === 'OPEN_PUNCHES' && summary.openPunchDays?.length ? (
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                            {summary.openPunchDays.map((d) => (
                              <li key={`${d.employeeId}-${d.date}`}>
                                {d.fullName} ({d.empCode}) — {formatDay(d.date)}
                                {d.punchIn ? `, punched in ${d.punchIn}, no punch-out` : ', no punch-out'}{' '}
                                <Link
                                  to={`/admin/attendance-correction-workflow?${new URLSearchParams({
                                    employeeId: d.employeeId,
                                    date: d.date,
                                    ...(d.punchIn ? { punchIn: d.punchIn } : {})
                                  })}`}
                                  aria-label={`Fix missing punch-out for ${d.empCode} on ${formatDay(d.date)}`}
                                >
                                  Fix
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {!finalized && canFinalize ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!summary.canFinalize}
                title={summary.canFinalize ? undefined : 'Resolve the items above first'}
                onClick={() => {
                  setActionError('');
                  setConfirmOpen(true);
                }}
              >
                <Lock size={16} /> Finalize attendance for {label}
              </button>
            ) : null}
            {finalized && canReopen ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setActionError('');
                  setReopenOpen(true);
                }}
              >
                <LockOpen size={16} /> Reopen attendance
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {confirmOpen && summary ? (
        <Modal title={`Finalize attendance for ${label}?`} onClose={() => !busy && setConfirmOpen(false)} width={520}>
          <p style={{ marginTop: 0, lineHeight: 1.5 }}>
            This locks attendance for <strong>{summary.employees}</strong> employee(s) in{' '}
            <strong>{companies.find((c) => String(c.id) === companyId)?.name || 'this company'}</strong>. Manual overrides
            and correction requests for {label} will be refused until an Admin reopens it.
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.6 }}>
            <li>{summary.present} present · {summary.halfDay} half day · {summary.absent} absent · {summary.leave} leave</li>
            <li>{summary.missingPunch} missing punch day(s) will be treated as loss of pay</li>
          </ul>
          {actionError ? <div className="message message-error" role="alert" style={{ marginBottom: 12 }}>{actionError}</div> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={finalize} disabled={busy}>
              {busy ? 'Finalizing…' : 'Finalize attendance'}
            </button>
          </div>
        </Modal>
      ) : null}

      {reopenOpen ? (
        <Modal title={`Reopen attendance for ${label}`} onClose={() => !busy && setReopenOpen(false)} width={520}>
          <form onSubmit={reopen}>
            <p style={{ marginTop: 0 }}>
              Reopening allows attendance edits again. Payroll approval stays blocked until it is finalized again.
            </p>
            <label htmlFor="att-reopen-reason" style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              Reason <span style={{ color: '#b91c1c' }}>*</span>
            </label>
            <textarea
              id="att-reopen-reason"
              className="input"
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              autoFocus
            />
            {actionError ? <div className="message message-error" role="alert" style={{ marginTop: 10 }}>{actionError}</div> : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setReopenOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Reopening…' : 'Reopen attendance'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
