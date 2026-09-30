import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import PayslipCard from '../../components/PayslipCard.jsx';
import { PaginationBar, SortableTh, useSortedPagination } from '../../components/TableControls.jsx';
import {
  COMPANY_ADDRESS_DEFAULT,
  formatCurrencyINR as inr,
  generatePayslipPdf
} from '../../services/payslip.js';

const PAYSLIP_LIST_LIMIT = 300;
const EMPTY_FILTERS = { search: '', year: '', month: '', companyId: '', runId: '' };

const SORT_ACCESSORS = {
  emp_code: (r) => r.emp_code,
  full_name: (r) => r.full_name,
  department: (r) => r.department,
  period: (r) => Number(r.period_year) * 100 + Number(r.period_month),
  gross: (r) => Number(r.gross_earnings),
  net: (r) => Number(r.net_pay),
  status: (r) => r.payroll_status
};

export default function EmployeePayslipsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(() => {
    const companyId = searchParams.get('companyId') || '';
    return {
      search: '',
      companyId,
      runId: searchParams.get('runId') || '',
      year: searchParams.get('year') || (companyId ? '' : new Date().getFullYear()),
      month: searchParams.get('month') || ''
    };
  });
  const table = useSortedPagination(rows, {
    accessors: SORT_ACCESSORS,
    initialSortKey: 'period',
    initialDir: 'desc'
  });

  async function load(activeFilters = filters) {
    try {
      setError('');
      const params = {};
      if (activeFilters.search) params.search = activeFilters.search;
      if (activeFilters.companyId) params.companyId = activeFilters.companyId;
      if (activeFilters.runId) params.runId = activeFilters.runId;
      if (activeFilters.year) params.year = activeFilters.year;
      if (activeFilters.month) params.month = activeFilters.month;
      const res = await api.get('/payroll/payslips', { params });
      setRows(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load payslips.');
    }
  }

  useEffect(() => {
    load();
    api
      .get('/access/companies')
      .then((res) => setCompanies(res.data.data || []))
      .catch(() => setCompanies([]));
  }, [user?.role]);

  const companyName = companies.find((c) => String(c.id) === String(filters.companyId))?.name;

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    load(EMPTY_FILTERS);
  }

  async function openPayslip(id) {
    try {
      const res = await api.get(`/payroll/payslips/${id}`);
      setSelected(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to open payslip.');
    }
  }

  async function downloadPdf() {
    if (!selected) return;
    await api.get(`/payroll/payslips/${selected.id || selected.payslip_id}?download=1`).catch(() => {});
    await generatePayslipPdf(selected, { companyAddressDefault: COMPANY_ADDRESS_DEFAULT });
  }

  const hasFilters = Boolean(filters.search || filters.year || filters.month || filters.companyId || filters.runId);

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">{companyName ? `${companyName} — Payslips` : 'Employee Payslips'}</h1>
          <p className="page-subtitle">
            {filters.runId
              ? `Payslips released in payroll run #${filters.runId}.`
              : 'View and download payslips for employees in your scope.'}
          </p>
        </div>
      </div>

      {error ? <div className="message-error">{error}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <form
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'center' }}
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            className="input"
            placeholder="Search employee"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <select
            className="input"
            aria-label="Company"
            value={filters.companyId}
            onChange={(e) => setFilters((f) => ({ ...f, companyId: e.target.value, runId: '' }))}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            placeholder="Year"
            value={filters.year}
            onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
          />
          <select
            className="input"
            value={filters.month}
            onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
          >
            <option value="">All months</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit">
            Search
          </button>
          <button className="btn btn-secondary" type="button" onClick={clearFilters} disabled={!hasFilters}>
            Clear filters
          </button>
        </form>

        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
          Showing {table.pageRows.length} of {rows.length} payslips
          {rows.length >= PAYSLIP_LIST_LIMIT ? ' — list limit reached, narrow the filters to see older payslips.' : ''}
        </div>

        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="Employee ID" sortKey="emp_code" table={table} />
                <SortableTh label="Name" sortKey="full_name" table={table} />
                <SortableTh label="Department" sortKey="department" table={table} />
                <SortableTh label="Month" sortKey="period" table={table} />
                <SortableTh label="Gross" sortKey="gross" table={table} />
                <SortableTh label="Net Pay" sortKey="net" table={table} />
                <SortableTh label="Status" sortKey="status" table={table} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.pageRows.map((row) => (
                <tr
                  key={row.payslip_id}
                  style={selected && (selected.id || selected.payslip_id) === row.payslip_id ? { background: 'var(--primary-soft)' } : undefined}
                >
                  <td>{row.emp_code}</td>
                  <td>{row.full_name}</td>
                  <td>{row.department || '—'}</td>
                  <td>
                    {row.period_month}/{row.period_year}
                  </td>
                  <td>{inr(row.gross_earnings)}</td>
                  <td>{inr(row.net_pay)}</td>
                  <td>{row.payroll_status}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => openPayslip(row.payslip_id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={8}>No payslips found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationBar table={table} />
      </div>

      <PayslipCard
        payslip={selected}
        variant="admin"
        onDownload={downloadPdf}
        companyAddressDefault={COMPANY_ADDRESS_DEFAULT}
      />
    </div>
  );
}
