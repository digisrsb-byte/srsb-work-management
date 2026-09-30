import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FileSearch, FlaskConical, UserCheck, UserPlus } from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatCard from '../components/StatCard.jsx';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
  apiError,
  formatDate
} from './admin/assets/assetUi.jsx';
import {
  BANK_STATUS,
  CASE_STATUS,
  CaseStatusBadge,
  DemoBadge,
  InvitationBadge,
  ONBOARDING_MANAGER_ROLES,
  ProgressBar
} from './onboarding/onboardingUi.jsx';

const STATUS_FILTERS = ['ALL', 'PENDING', 'IN_PROGRESS', 'READY', 'ACTIVATED'];
const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'READY'];

function correctionCount(item) {
  return Number(item.needs_correction) + Number(item.rejected);
}

function DocumentProgress({ item }) {
  const done = Number(item.required_done);
  const total = Number(item.required_total);
  const notes = [];
  if (Number(item.awaiting_review)) notes.push(`${item.awaiting_review} awaiting review`);
  if (Number(item.needs_correction)) notes.push(`${item.needs_correction} correction required`);
  if (Number(item.rejected)) notes.push(`${item.rejected} rejected`);
  if (Number(item.not_uploaded)) notes.push(`${item.not_uploaded} not submitted`);
  if (!item.is_demo && item.status !== 'ACTIVATED' && item.bank_status && item.bank_status !== 'VERIFIED') {
    notes.push(`Bank details: ${BANK_STATUS[item.bank_status]?.label.toLowerCase() || item.bank_status}`);
  }

  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        {done} of {total} required complete
      </div>
      <ProgressBar done={done} total={total} />
      {notes.length ? (
        <div className="helper-text" style={{ marginTop: 6 }}>{notes.join(' · ')}</div>
      ) : null}
    </div>
  );
}

function actionFor(item) {
  if (item.status === 'READY') return { label: 'Review & activate', primary: true };
  if (Number(item.awaiting_review) > 0) return { label: 'Review documents', primary: true };
  if (item.bank_status === 'PENDING_VERIFICATION') return { label: 'Review bank details', primary: true };
  if (item.status === 'ACTIVATED') return { label: 'View', primary: false };
  return { label: 'View checklist', primary: false };
}

function DemoTools({ status, busy, onSeed, onClear }) {
  if (!status?.enabled) return null;
  const hasDemo = status.demoCases > 0 || status.demoCandidates > 0;

  return (
    <div className="card demo-panel">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <FlaskConical size={22} style={{ color: '#92400e', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <strong>Demo mode is on</strong> <DemoBadge />
          <p className="helper-text" style={{ margin: '4px 0 0' }}>
            Creates fictional employees with placeholder documents only, labelled DEMO. Demo employees never get a
            live login and are excluded from payroll, attendance and reports. Demo mode is ignored in production.
          </p>
          {hasDemo ? (
            <p className="helper-text" style={{ margin: '4px 0 0' }}>
              {status.demoCases} demo case{status.demoCases === 1 ? '' : 's'} and {status.demoCandidates} demo
              candidate{status.demoCandidates === 1 ? '' : 's'} exist.
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="button" onClick={onSeed} disabled={busy || status.demoCases > 0}>
            {busy === 'seed' ? 'Creating…' : 'Create demo cases'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClear} disabled={busy || !hasDemo}>
            {busy === 'clear' ? 'Removing…' : 'Remove demo data'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingQueue() {
  const { user } = useAuth();
  const canManage = ONBOARDING_MANAGER_ROLES.includes(user?.role);

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [demoStatus, setDemoStatus] = useState(null);
  const [demoBusy, setDemoBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/onboarding');
      setCases(response.data.data || []);
    } catch (err) {
      setError(apiError(err, 'Unable to load onboarding cases.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDemoStatus = useCallback(async () => {
    if (!canManage) return;
    try {
      const response = await api.get('/onboarding/demo/status');
      setDemoStatus(response.data.data);
    } catch {
      setDemoStatus(null);
    }
  }, [canManage]);

  useEffect(() => {
    load();
    loadDemoStatus();
  }, [load, loadDemoStatus]);

  async function seedDemo() {
    setDemoBusy('seed');
    setNotice('');
    setNoticeError('');
    try {
      const response = await api.post('/onboarding/demo/seed', {});
      setNotice(response.data.message);
      await Promise.all([load(), loadDemoStatus()]);
    } catch (err) {
      setNoticeError(apiError(err, 'Demo cases could not be created.'));
    } finally {
      setDemoBusy('');
    }
  }

  async function clearDemo() {
    if (!window.confirm('Remove all DEMO onboarding cases, DEMO candidates and their placeholder files? Real records are not affected.')) {
      return;
    }
    setDemoBusy('clear');
    setNotice('');
    setNoticeError('');
    try {
      const response = await api.delete('/onboarding/demo');
      setNotice(response.data.message);
      await Promise.all([load(), loadDemoStatus()]);
    } catch (err) {
      setNoticeError(apiError(err, 'Demo data could not be removed.'));
    } finally {
      setDemoBusy('');
    }
  }

  const companies = useMemo(() => {
    const byId = new Map();
    cases.forEach((c) => byId.set(String(c.company_id), c.company_name));
    return [...byId.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [cases]);

  const stats = useMemo(() => {
    const open = cases.filter((c) => OPEN_STATUSES.includes(c.status));
    return {
      newJoiners: open.length,
      pendingDocs: open.reduce((sum, c) => sum + Number(c.awaiting_review), 0),
      pendingCases: open.filter((c) => Number(c.awaiting_review) > 0).length,
      correctionDocs: open.reduce((sum, c) => sum + correctionCount(c), 0),
      rejectedDocs: open.reduce((sum, c) => sum + Number(c.rejected), 0),
      ready: cases.filter((c) => c.status === 'READY').length,
      activated: cases.filter((c) => c.status === 'ACTIVATED').length
    };
  }, [cases]);

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    return cases.filter((c) => {
      const matchesText =
        !text ||
        [c.full_name, c.emp_code, c.company_name, c.department_name, c.designation]
          .some((value) => value?.toLowerCase().includes(text));
      const matchesCompany = companyFilter === 'ALL' || String(c.company_id) === companyFilter;
      return matchesText && matchesCompany && (statusFilter === 'ALL' || c.status === statusFilter);
    });
  }, [cases, search, statusFilter, companyFilter]);

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="section-heading" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Onboarding Review Queue</h1>
          <p className="page-subtitle">
            New joiners upload their documents in the Employee Portal. Review each submission here and activate the
            employee once every required document is verified.
          </p>
        </div>
      </div>

      {canManage ? (
        <DemoTools status={demoStatus} busy={demoBusy} onSeed={seedDemo} onClear={clearDemo} />
      ) : null}

      {notice ? (
        <div className="message message-success" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice}</span>
          <button type="button" className="link-button" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      ) : null}
      {noticeError ? <ErrorState message={noticeError} /> : null}

      {!loading && !error ? (
        <div className="grid stats-grid">
          <StatCard
            label="New joiners"
            value={stats.newJoiners}
            icon={UserPlus}
            hint={`${stats.activated} activated so far`}
          />
          <StatCard
            label="Documents pending review"
            value={stats.pendingDocs}
            icon={FileSearch}
            hint={`Across ${stats.pendingCases} joiner${stats.pendingCases === 1 ? '' : 's'}`}
          />
          <StatCard
            label="Corrections required"
            value={stats.correctionDocs}
            icon={AlertTriangle}
            hint={stats.rejectedDocs ? `Includes ${stats.rejectedDocs} rejected` : 'Waiting on the employee'}
          />
          <StatCard label="Ready to activate" value={stats.ready} icon={UserCheck} hint="All required documents verified" />
        </div>
      ) : null}

      <div className="card">
        {!loading && !error && cases.length > 0 ? (
          <div className="toolbar">
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder="Search name, employee ID, company or department"
              aria-label="Search onboarding cases"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {companies.length > 1 ? (
              <select
                className="input"
                style={{ maxWidth: 220 }}
                aria-label="Filter by company"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="ALL">All companies</option>
                {companies.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            ) : null}
            <div className="filter-chips" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((value) => {
                const count = value === 'ALL' ? cases.length : cases.filter((c) => c.status === value).length;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`filter-chip${statusFilter === value ? ' filter-chip-active' : ''}`}
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                  >
                    {value === 'ALL' ? 'All' : CASE_STATUS[value].label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {loading ? (
          <TableSkeleton columns={6} rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : cases.length === 0 ? (
          <EmptyState title="No new joiners to onboard">
            When a candidate is marked as Joined in Recruitment, an employee record and onboarding checklist are
            created automatically. The joiner then signs in to the Employee Portal to upload their documents, and
            each submission appears here for review.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState title="No cases match these filters">
            Try a different search, company or status.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Company &amp; department</th>
                  <th>Joining date</th>
                  <th>Document progress</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const action = actionFor(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>{item.full_name}</strong>
                          {item.is_demo ? <DemoBadge /> : null}
                        </div>
                        <div className="helper-text">
                          {[item.emp_code, item.designation].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td>
                        <div>{item.company_name}</div>
                        <div className="helper-text">{item.department_name || 'No department yet'}</div>
                      </td>
                      <td>{formatDate(item.joining_date)}</td>
                      <td><DocumentProgress item={item} /></td>
                      <td>
                        <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                          <CaseStatusBadge status={item.status} />
                          {item.invitation_state && item.invitation_state !== 'NOT_REQUIRED' ? (
                            <InvitationBadge state={item.invitation_state} />
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <Link
                          className={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`}
                          to={`/admin/onboarding/${item.id}`}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {action.label}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
