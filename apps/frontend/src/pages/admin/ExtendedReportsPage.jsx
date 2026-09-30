import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarCheck,
  FileDown,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Users,
  Wallet
} from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  MONTH_NAMES,
  displayValue,
  exportReportCsv,
  exportReportPdf,
  exportReportXlsx,
  formatDate,
  formatDateTime,
  formatTime,
  formatValue,
  humanizeCode,
  isNumericColumn,
  parseDateValue,
  screenColumns
} from '../../services/reportExport.js';
import {
  EMPLOYEE_STATUSES,
  OPS_TABS,
  TAB_FILTERS,
  UNAPPLIED_FILTERS,
  buildOpsReport,
  buildOpsRequest,
  filtersChanged
} from './reports/reportDefinitions.js';

const TAB_ICONS = {
  summary: LayoutDashboard,
  headcount: Users,
  attendance: CalendarCheck,
  payroll: Wallet,
  clients: Building2
};

const STATUS_TONES = {
  ACTIVE: 'success',
  PRESENT: 'success',
  APPROVED: 'success',
  LOCKED: 'success',
  PAID: 'success',
  PENDING: 'warning',
  HALF_DAY: 'warning',
  MISSING_PUNCH: 'warning',
  SUBMITTED: 'info',
  PROSPECT: 'info',
  LEAVE: 'info',
  INACTIVE: 'danger',
  ABSENT: 'danger',
  RESIGNED: 'danger',
  TERMINATED: 'danger'
};

const FILTER_LABELS = { companyId: 'Company', status: 'Employee status' };

function localIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function initialFilters() {
  const now = new Date();
  return {
    asOfDate: localIsoDate(now),
    startDate: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: localIsoDate(now),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    companyId: '',
    status: ''
  };
}

function Field({ label, htmlFor, children }) {
  return (
    <div className="rpt-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function renderCell(column, row) {
  const value = displayValue(column, row, 'ui');
  if (column.type === 'list') {
    return value.length ? (
      <ul className="rpt-list">
        {value.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    ) : (
      '—'
    );
  }
  if (column.badge && value !== '—') {
    const raw = row[column.key];
    return <span className={`badge rpt-tone-${STATUS_TONES[raw] || 'muted'}`}>{value}</span>;
  }
  if (column.type === 'datetime') {
    const date = parseDateValue(row[column.key]);
    return date ? (
      <span className="rpt-dt">
        {formatDate(date)}
        <small>{formatTime(date)}</small>
      </span>
    ) : (
      '—'
    );
  }
  if (column.link && row[column.link]) {
    return (
      <Link className="rpt-link" to={row[column.link]}>
        {value}
      </Link>
    );
  }
  return value;
}

function cellClass(column) {
  if (isNumericColumn(column)) return 'num';
  if (['date', 'time', 'datetime'].includes(column.type)) return 'nowrap';
  return undefined;
}

function ReportTable({ section }) {
  const columns = screenColumns(section);
  const compact = columns.length <= 4;
  const { rows, totals, groupKey } = section;

  return (
    <div className="table-wrap">
      <table className={`rpt-table${compact ? ' rpt-table-compact' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={isNumericColumn(c) ? 'num' : undefined} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => {
              const groupStart = groupKey && i > 0 && rows[i - 1][groupKey] !== row[groupKey];
              const classes = [
                groupStart ? 'rpt-group-start' : '',
                section.flagRow?.(row) ? 'rpt-row-flag' : ''
              ].filter(Boolean).join(' ');
              return (
                <tr key={row.id ?? row.key ?? row.department ?? i} className={classes || undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={cellClass(c)}>
                      {groupKey === c.key && i > 0 && !groupStart ? '' : renderCell(c, row)}
                    </td>
                  ))}
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty-state">
                {section.emptyText || 'No records for the selected filters.'}
              </td>
            </tr>
          )}
        </tbody>
        {totals && rows.length ? (
          <tfoot>
            <tr>
              {columns.map((c, i) => (
                <td key={c.key} className={cellClass(c)}>
                  {i === 0
                    ? totals.label || 'Total'
                    : totals.values?.[c.key] !== undefined
                      ? formatValue(c, totals.values[c.key], 'ui')
                      : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function MetricCards({ items }) {
  if (!items?.length) return null;
  return (
    <div className="rpt-metrics">
      {items.map((item) => {
        const content = (
          <>
            <div className="rpt-metric-label">{item.label}</div>
            <div className="rpt-metric-value">
              {formatValue({ type: item.type || 'number', decimals: item.decimals }, item.value ?? 0, 'ui')}
            </div>
          </>
        );
        return item.path ? (
          <Link key={item.label} to={item.path} className="rpt-metric" title="View records">
            {content}
          </Link>
        ) : (
          <div key={item.label} className="rpt-metric">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="card rpt-skeleton" aria-busy="true" aria-label="Loading report">
      <div className="skeleton" style={{ width: '32%' }} />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" style={{ width: '78%' }} />
      <div className="skeleton" style={{ width: '64%' }} />
    </div>
  );
}

export default function ExtendedReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('summary');
  const [filters, setFilters] = useState(initialFilters);
  const [companies, setCompanies] = useState([]);
  const [loaded, setLoaded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState('');
  const requestRef = useRef(0);

  const canExport = user?.role !== 'MANAGER';
  const shows = TAB_FILTERS[tab];

  useEffect(() => {
    api
      .get('/access/companies')
      .then((res) => setCompanies(res.data.data || []))
      .catch(() => setCompanies([]));
  }, []);

  async function load(targetTab = tab) {
    const requestId = ++requestRef.current;
    const snapshot = { ...filters };
    const { url, params } = buildOpsRequest(targetTab, snapshot);
    setLoadError('');
    setLoading(true);
    try {
      const res = await api.get(url, { params });
      if (requestId !== requestRef.current) return;
      setLoaded({ tab: targetTab, data: res.data.data, filters: snapshot });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setLoaded(null);
      setLoadError(err.response?.data?.message || 'Unable to load report.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    setMessage('');
    setExportError('');
    load(tab);
    // Reports load when the tab changes; filter edits apply on Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const current = loaded && loaded.tab === tab ? loaded : null;
  const report = useMemo(
    () => (current ? buildOpsReport(current.tab, current.data, current.filters, companies) : null),
    [current, companies]
  );
  const stale = current ? filtersChanged(tab, filters, current.filters) : false;

  const notes = [];
  const unapplied = (UNAPPLIED_FILTERS[tab] || []).filter(
    (key) => filters[key] && (key !== 'status' || shows.includes('status'))
  );
  if (unapplied.length) {
    notes.push(
      `${unapplied.map((key) => FILTER_LABELS[key]).join(' and ')} ${
        unapplied.length > 1 ? 'selections are' : 'selection is'
      } not applied by the current ${OPS_TABS.find((t) => t.id === tab).label.toLowerCase()} report. It shows all records in your access.`
    );
  }
  if (tab === 'payroll' && filters.status) {
    notes.push(
      `The employee status selected on another tab (${humanizeCode(filters.status)}) is also sent to the payroll report, which uses it as a payroll run status filter. Clear it on the Summary or Headcount tab to list all runs.`
    );
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function exportReport(format) {
    if (!current || !report) return;
    setMessage('');
    setExportError('');
    setExporting(format);
    try {
      await api.post('/reports/export', { reportType: tab, format, filters: current.filters });
    } catch (err) {
      setExportError(err.response?.data?.message || 'Export not allowed.');
      setExporting('');
      return;
    }
    try {
      if (!(current.data?.rows || []).length) {
        setExportError('No rows available to export for the current filters.');
        return;
      }
      let filename;
      if (format === 'PDF') filename = await exportReportPdf(report);
      else if (format === 'XLSX') filename = exportReportXlsx(report);
      else filename = exportReportCsv(report);
      setMessage(`${filename} downloaded. The export was recorded in the audit log.`);
    } catch (err) {
      console.error(err);
      setExportError('Unable to create the export file. Please try again.');
    } finally {
      setExporting('');
    }
  }

  const exportDisabled = !report || loading || Boolean(exporting);

  return (
    <div className="rpt-page">
      <div className="section-heading">
        <div>
          <h1 className="page-title">Operational Reports</h1>
          <p className="page-subtitle">View and export workforce, attendance, payroll, and client reports.</p>
        </div>
      </div>

      <div className="rpt-tabs" role="tablist" aria-label="Report type">
        {OPS_TABS.map((t) => {
          const Icon = TAB_ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`rpt-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={16} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <section className="card rpt-panel" aria-label="Report filters and actions">
        <div className="rpt-filters">
          {shows.includes('dateRange') ? (
            <>
              <Field label="Start date" htmlFor="rpt-start">
                <input
                  id="rpt-start"
                  className="input"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => updateFilter('startDate', e.target.value)}
                />
              </Field>
              <Field label="End date" htmlFor="rpt-end">
                <input
                  id="rpt-end"
                  className="input"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => updateFilter('endDate', e.target.value)}
                />
              </Field>
            </>
          ) : null}
          {shows.includes('asOfDate') ? (
            <Field label="As of date" htmlFor="rpt-asof">
              <input
                id="rpt-asof"
                className="input"
                type="date"
                value={filters.asOfDate}
                onChange={(e) => updateFilter('asOfDate', e.target.value)}
              />
            </Field>
          ) : null}
          {shows.includes('payrollPeriod') ? (
            <>
              <Field label="Payroll year" htmlFor="rpt-year">
                <input
                  id="rpt-year"
                  className="input"
                  type="number"
                  value={filters.year}
                  onChange={(e) => updateFilter('year', e.target.value)}
                />
              </Field>
              <Field label="Payroll month" htmlFor="rpt-month">
                <select
                  id="rpt-month"
                  className="input"
                  value={filters.month}
                  onChange={(e) => updateFilter('month', e.target.value)}
                >
                  <option value="">All months</option>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          <Field label="Company scope" htmlFor="rpt-company">
            <select
              id="rpt-company"
              className="input"
              value={filters.companyId}
              onChange={(e) => updateFilter('companyId', e.target.value)}
            >
              <option value="">All companies in scope</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {shows.includes('status') ? (
            <Field label="Employee status" htmlFor="rpt-status">
              <select
                id="rpt-status"
                className="input"
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
              >
                <option value="">All employee statuses</option>
                {EMPLOYEE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {humanizeCode(status)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <div className="rpt-actions">
          <button className="btn btn-primary" type="button" onClick={() => load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'rpt-spin' : undefined} aria-hidden="true" />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {canExport ? (
            <div className="rpt-export" role="group" aria-label="Export report">
              <span className="rpt-export-label">Export</span>
              <button className="btn btn-secondary" type="button" onClick={() => exportReport('PDF')} disabled={exportDisabled}>
                <FileText size={16} aria-hidden="true" />
                {exporting === 'PDF' ? 'Preparing…' : 'Export PDF'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => exportReport('XLSX')} disabled={exportDisabled}>
                <FileSpreadsheet size={16} aria-hidden="true" />
                {exporting === 'XLSX' ? 'Preparing…' : 'Export Excel (.xlsx)'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => exportReport('CSV')} disabled={exportDisabled}>
                <FileDown size={16} aria-hidden="true" />
                {exporting === 'CSV' ? 'Preparing…' : 'Export CSV'}
              </button>
            </div>
          ) : (
            <span className="helper-text">Export requires reports export permission.</span>
          )}
        </div>

        {current || stale ? (
          <div className="rpt-meta">
            {current ? (
              <>
                <span>
                  <strong>Data freshness:</strong> {formatDateTime(current.data?.generatedAt)}
                </span>
                <span>
                  <strong>{tab === 'headcount' || tab === 'payroll' ? 'Applied period:' : 'Applied range:'}</strong>{' '}
                  {report.periodLabel}
                </span>
              </>
            ) : null}
            {stale ? <span className="rpt-stale">Filters changed. Select Refresh to update the report.</span> : null}
          </div>
        ) : null}
      </section>

      {message || exportError || notes.length ? (
        <div className="rpt-notes">
          {message ? <div className="message message-success">{message}</div> : null}
          {exportError ? <div className="message message-error">{exportError}</div> : null}
          {notes.map((note) => (
            <div key={note} className="message message-warning">
              {note}
            </div>
          ))}
        </div>
      ) : null}

      {loadError ? (
        <div className="card rpt-error">
          <div className="message message-error">{loadError}</div>
          <button className="btn btn-secondary" type="button" onClick={() => load()} disabled={loading}>
            Try again
          </button>
        </div>
      ) : null}

      {!loadError && !current && loading ? <LoadingState /> : null}

      {!loadError && report ? (
        <div className={loading ? 'rpt-loading' : undefined} aria-busy={loading}>
          <MetricCards items={report.summary} />
          {report.sections.map((section) => (
            <section key={section.id} className="card rpt-section">
              <div className="rpt-section-head">
                <h2>{section.title}</h2>
                <span>
                  {section.countLabel ??
                    `${section.rows.length} ${section.rows.length === 1 ? 'record' : 'records'}`}
                </span>
              </div>
              <ReportTable section={section} />
              {section.note ? (
                <div className="rpt-section-note">
                  {section.note}
                  {tab === 'payroll' ? (
                    <>
                      {' '}
                      <Link className="rpt-link" to="/admin/payroll">
                        Open Payroll
                      </Link>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
