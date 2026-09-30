import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleAlert, CircleDashed, ListChecks, RefreshCw } from 'lucide-react';
import api from '../services/api.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const money = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

function previousMonthValue() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const STAGE_ICON = { done: CheckCircle2, action: CircleAlert, pending: CircleDashed };
const STAGE_TEXT = { done: 'Complete', action: 'Needs action', pending: 'Not started' };

/**
 * HR workflow tracker for one payroll month: lifecycle stages (clickable) and the
 * pending tasks blocking payroll, both read from GET /dashboard/workflow.
 */
export default function WorkflowOverview() {
  const [period, setPeriod] = useState(previousMonthValue);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(value = period) {
    const [year, month] = value.split('-').map(Number);
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dashboard/workflow', { params: { year, month } });
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load the payroll workflow.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(period);
  }, [period]);

  const [year, month] = period.split('-').map(Number);
  const heading = `${MONTHS[month - 1]} ${year}`;
  const nextStage = data?.stages.find((s) => s.status !== 'done');

  return (
    <div className="grid" style={{ gap: 16, marginBottom: 22 }}>
      <section className="card" aria-labelledby="wf-title">
        <div className="section-heading" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2 id="wf-title" style={{ margin: 0 }}>Payroll workflow — {heading}</h2>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              Onboarding to payslip delivery. Select a stage to open it.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label htmlFor="wf-period" className="helper-text">Payroll month</label>
            <input
              id="wf-period"
              className="input"
              type="month"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              style={{ width: 'auto' }}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => load()}
              aria-label="Refresh workflow"
              title="Refresh"
              disabled={loading}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="message message-error" role="alert">
            {error}{' '}
            <button type="button" className="link-button" onClick={() => load()}>Try again</button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="wf-stages" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="wf-stage">
                <div className="skeleton" style={{ width: '70%' }} />
                <div className="skeleton" style={{ width: '90%', marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : null}

        {data ? (
          <>
            <div className="wf-kpis" style={{ marginBottom: 14 }}>
              <div className="wf-kpi"><span>Active employees</span><strong>{data.kpis.activeEmployees}</strong></div>
              <div className="wf-kpi"><span>Onboarding open</span><strong>{data.kpis.openOnboarding}</strong></div>
              <div className="wf-kpi"><span>Awaiting verification</span><strong>{data.kpis.pendingVerification}</strong></div>
              <div className="wf-kpi">
                <span>Attendance finalized</span>
                <strong>{data.kpis.attendanceFinalized}/{data.kpis.companies}</strong>
              </div>
              <div className="wf-kpi"><span>Net payroll</span><strong>{money(data.kpis.netPayroll)}</strong></div>
              <div className="wf-kpi">
                <span>Payslip emails</span>
                <strong>
                  {data.kpis.emailsSent} sent
                  {data.kpis.emailsFailed ? <small style={{ color: '#b91c1c' }}> · {data.kpis.emailsFailed} failed</small> : null}
                </strong>
              </div>
            </div>

            <ol className="wf-stages" aria-label={`Payroll workflow stages for ${heading}`}>
              {data.stages.map((stage, index) => {
                const Icon = STAGE_ICON[stage.status] || CircleDashed;
                return (
                  <li key={stage.key} style={{ display: 'contents' }}>
                    <Link
                      to={stage.to}
                      className={`wf-stage ${stage.status}`}
                      aria-label={`${index + 1}. ${stage.label}: ${STAGE_TEXT[stage.status]}. ${stage.detail}`}
                    >
                      <span className="wf-stage-head">
                        <span className="wf-stage-num" aria-hidden="true">
                          {stage.status === 'done' ? <Icon size={14} /> : index + 1}
                        </span>
                        {stage.label}
                      </span>
                      <span className="wf-stage-detail">{stage.detail}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>

            {nextStage ? (
              <p className="message message-info" style={{ margin: '14px 0 0' }}>
                <strong>Next step:</strong> {nextStage.label} — {nextStage.detail}.{' '}
                <Link to={nextStage.to}>Open</Link>
              </p>
            ) : (
              <p className="message message-success" style={{ margin: '14px 0 0' }}>
                Payroll for {heading} is released and every payslip email was delivered.
              </p>
            )}
          </>
        ) : null}
      </section>

      {data ? (
        <section className="card" aria-labelledby="wf-tasks-title">
          <div className="section-heading">
            <div>
              <h2 id="wf-tasks-title" style={{ margin: 0 }}>Pending HR tasks</h2>
              <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
                Items that block or affect payroll for {heading}.
              </p>
            </div>
            <ListChecks size={20} aria-hidden="true" />
          </div>
          {data.tasks.length ? (
            <ul className="wf-tasks">
              {data.tasks.map((task) => (
                <li key={task.key}>
                  <Link to={task.to} className={`wf-task ${task.severity}`}>
                    <span>{task.label}</span>
                    <span className="wf-task-count" aria-label={`${task.count} items`}>{task.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>No pending tasks</strong>
              Nothing is waiting on HR for this payroll month.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
