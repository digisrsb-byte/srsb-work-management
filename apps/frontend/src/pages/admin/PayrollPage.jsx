import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Eye,
  FileDown,
  LayoutDashboard,
  ListChecks,
  Mail,
  RefreshCw,
  SlidersHorizontal,
  UserCog
} from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  buildPayslipFigures,
  formatCurrencyINR as inr,
  generatePayslipPdf,
  payslipFileName
} from '../../services/payslip.js';
import PayslipCard, {
  EarningsDeductionsTable,
  EmployerContributions,
  NetPayBanner
} from '../../components/PayslipCard.jsx';
import { Modal } from './assets/assetUi.jsx';
import PayrollStatusStepper, { PAYROLL_STATUS_COLORS } from '../../components/PayrollStatusStepper.jsx';
import { PaginationBar, SortableTh, useSortedPagination } from '../../components/TableControls.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'salary-setup', label: 'Employee Salary Setup', icon: UserCog },
  { key: 'configuration', label: 'Salary Configuration', icon: SlidersHorizontal },
  { key: 'runs', label: 'Payroll Runs', icon: ListChecks }
];

const STATUS_ORDER = ['DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED', 'PAID'];
const STATUS_FILTERS = ['ALL', ...STATUS_ORDER];

const RUN_SORT_ACCESSORS = {
  period: (r) => Number(r.period_year) * 100 + Number(r.period_month),
  company: (r) => r.company_name,
  status: (r) => STATUS_ORDER.indexOf(r.status)
};

const DAY_BASIS_LABELS = {
  FIXED_30_DAYS: 'Fixed 30 days',
  CALENDAR_DAYS: 'Calendar days',
  WORKING_DAYS: 'Working days'
};

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.45)',
  zIndex: 1300,
  display: 'grid',
  placeItems: 'center',
  padding: 16
};

const pad2 = (n) => String(n).padStart(2, '0');
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const isOn = (v) => Boolean(Number(v));

function Chip({ label, value }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Breakdown({ calc }) {
  if (!calc) return null;
  const figures = buildPayslipFigures(calc);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chip label="Annual CTC" value={inr(calc.annualCtc)} />
        <Chip label="Monthly CTC" value={inr(calc.monthlyCtc)} />
        <Chip label="Gross (with attendance)" value={inr(calc.grossSalary)} />
        <Chip label="Paid / LOP days" value={`${calc.paidDays ?? '—'} / ${calc.lopDays ?? '—'}`} />
      </div>
      <EarningsDeductionsTable figures={figures} />
      <NetPayBanner netPay={figures.netPay} />
      <EmployerContributions figures={figures} />
    </div>
  );
}

function StatusBadge({ status }) {
  const bg = PAYROLL_STATUS_COLORS[status] || '#64748b';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        background: `${bg}22`,
        color: bg,
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {status}
    </span>
  );
}

function KpiCard({ label, value }) {
  return (
    <div
      className="card"
      style={{
        padding: '14px 16px',
        minWidth: 140,
        flex: '1 1 140px'
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-muted)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ConfigField({ label, help, children }) {
  return (
    <label style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      {children}
      {help ? <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{help}</span> : null}
    </label>
  );
}

function ConfigGroup({ id, title, summary, open, onToggle, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, background: 'var(--surface)' }}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'transparent',
          border: 0,
          textAlign: 'left'
        }}
      >
        <span>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{summary}</span>
        </span>
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }} />
      </button>
      {open ? (
        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>{children}</div>
      ) : null}
    </div>
  );
}

function ToggleBlock({ title, checked, onChange, children, collapseWhenOff = false, offText }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-muted)', marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 10 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {title}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 999,
            background: checked ? '#dcfce7' : '#e2e8f0',
            color: checked ? '#166534' : '#475569'
          }}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
      </label>
      {!checked && offText ? (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>{offText}</p>
      ) : null}
      {checked || !collapseWhenOff ? (
        <fieldset
          disabled={!checked}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0, opacity: checked ? 1 : 0.5 }}
        >
          {children}
        </fieldset>
      ) : null}
    </div>
  );
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [salaryForm, setSalaryForm] = useState({
    ctc: '',
    location: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    status: 'ACTIVE',
    enableBonus: false,
    enableAttendanceBonus: false,
    enableGratuity: false
  });
  const [preview, setPreview] = useState(null);
  const [configCompanyId, setConfigCompanyId] = useState('');
  const [config, setConfig] = useState(null);
  const [runForm, setRunForm] = useState({
    companyId: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    workingDays: 26
  });
  const [selectedRun, setSelectedRun] = useState(null);
  const [configPreviewCtc, setConfigPreviewCtc] = useState('600000');
  const [configPreview, setConfigPreview] = useState(null);
  const [configEffectiveFrom, setConfigEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dashboard, setDashboard] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState('');
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [openConfigGroups, setOpenConfigGroups] = useState(['earnings']);
  const [runStatusFilter, setRunStatusFilter] = useState('ALL');
  const [salaryFix, setSalaryFix] = useState(null);
  const [companyModalTarget, setCompanyModalTarget] = useState(null);
  const [companyForm, setCompanyForm] = useState({ code: '', name: '' });
  const [companyFormError, setCompanyFormError] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [payslipPreview, setPayslipPreview] = useState(null);
  const [payslipBusy, setPayslipBusy] = useState(null);
  const [deliveries, setDeliveries] = useState(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [releaseResult, setReleaseResult] = useState(null);
  const [statutory, setStatutory] = useState({ pfApplicable: true, uanNumber: '' });
  const [salaryHistory, setSalaryHistory] = useState([]);
  const runDetailRef = useRef(null);
  const ctcInputRef = useRef(null);

  const role = user?.role;
  const canOperate = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(role);
  const canApprove = ['SUPER_ADMIN', 'ADMIN'].includes(role);
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const canViewEmployeePayslips = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(role);

  const tabParam = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.key === tabParam) ? tabParam : 'overview';
  function setActiveTab(key) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true }
    );
  }

  const filteredRuns = useMemo(
    () => (runStatusFilter === 'ALL' ? runs : runs.filter((r) => r.status === runStatusFilter)),
    [runs, runStatusFilter]
  );
  const runsTable = useSortedPagination(filteredRuns, {
    accessors: RUN_SORT_ACCESSORS,
    initialSortKey: 'period',
    initialDir: 'desc'
  });
  const draftRuns = runs.filter((r) => r.status === 'DRAFT');
  const submittedRuns = runs.filter((r) => r.status === 'SUBMITTED');

  async function loadDashboard(year, month) {
    try {
      const res = await api.get('/payroll/dashboard', {
        params: {
          year: year || runForm.periodYear,
          month: month || runForm.periodMonth
        }
      });
      setDashboard(res.data.data);
    } catch {
      setDashboard(null);
    }
  }

  async function load() {
    const [c, e, r] = await Promise.all([
      api.get('/access/companies'),
      api.get('/employees'),
      api.get('/payroll/runs')
    ]);
    setCompanies(c.data.data || []);
    setEmployees(e.data.data || []);
    setRuns(r.data.data || []);
    if (!runForm.companyId && c.data.data?.[0]) {
      setRunForm((f) => ({ ...f, companyId: c.data.data[0].id }));
      setConfigCompanyId(String(c.data.data[0].id));
    }
    await loadDashboard();
  }

  useEffect(() => {
    load().catch(() => setError('Unable to load payroll data.'));
    const runParam = Number(searchParams.get('run'));
    if (runParam) viewRun(runParam);
  }, []);

  useEffect(() => {
    if (!configCompanyId) return;
    api
      .get('/payroll/config', { params: { companyId: configCompanyId } })
      .then((res) => setConfig(res.data.data))
      .catch(() => {});
  }, [configCompanyId]);

  async function loadSalary(employeeId) {
    setSelectedEmployee(employeeId);
    setPreview(null);
    if (!employeeId) return;
    const res = await api.get(`/payroll/employee/${employeeId}/setup`);
    const setup = res.data.data;
    setSalaryHistory(setup.structures || []);
    setStatutory({
      pfApplicable: setup.statutory?.pfApplicable ?? true,
      uanNumber: setup.statutory?.uanNumber || ''
    });
    const active = setup.structures?.[0];
    if (active) {
      setSalaryForm({
        ctc: active.ctc,
        location: active.location || '',
        effectiveDate: String(active.effective_date).slice(0, 10),
        status: active.status,
        enableBonus: Boolean(Number(active.enable_bonus)),
        enableAttendanceBonus: Boolean(Number(active.enable_attendance_bonus)),
        enableGratuity: Boolean(Number(active.enable_gratuity))
      });
      if (active.calculation) setPreview(active.calculation);
    } else {
      setSalaryForm({
        ctc: '',
        location: '',
        effectiveDate: new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
        enableBonus: false,
        enableAttendanceBonus: false,
        enableGratuity: false
      });
    }
  }

  async function runPreview() {
    setError('');
    if (!selectedEmployee || !salaryForm.ctc) {
      setError('Select employee and enter Annual CTC.');
      return;
    }
    try {
      const emp = employees.find((e) => String(e.id) === String(selectedEmployee));
      const res = await api.post('/payroll/calculate-preview', {
        employeeId: Number(selectedEmployee),
        companyId: emp?.company_id,
        annualCtc: Number(salaryForm.ctc),
        periodYear: runForm.periodYear,
        periodMonth: runForm.periodMonth,
        enableBonus: salaryForm.enableBonus,
        enableAttendanceBonus: salaryForm.enableAttendanceBonus,
        enableGratuity: salaryForm.enableGratuity,
        pfApplicable: statutory.pfApplicable
      });
      setPreview(res.data.data);
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.message || 'Unable to calculate salary.');
    }
  }

  async function saveSalary(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const emp = employees.find((e) => String(e.id) === String(selectedEmployee));
      const res = await api.put(`/payroll/employee/${selectedEmployee}/setup`, {
        companyId: emp?.company_id,
        ctc: Number(salaryForm.ctc),
        location: salaryForm.location,
        effectiveDate: salaryForm.effectiveDate,
        status: salaryForm.status,
        enableBonus: salaryForm.enableBonus,
        enableAttendanceBonus: salaryForm.enableAttendanceBonus,
        enableGratuity: salaryForm.enableGratuity,
        pfApplicable: statutory.pfApplicable,
        uanNumber: statutory.pfApplicable ? statutory.uanNumber.trim() : undefined
      });
      setPreview(res.data.data.calculation || null);
      setMessage('Salary setup saved. Components calculated automatically from CTC.');
      const refreshed = await api.get(`/payroll/employee/${selectedEmployee}/setup`);
      setSalaryHistory(refreshed.data.data.structures || []);
      if (salaryFix && String(selectedEmployee) === salaryFix.employeeId) {
        await finishSalaryFix();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save salary setup.');
    }
  }

  function issueFix(issue) {
    const run = selectedRun?.run;
    switch (issue.code) {
      case 'MISSING_SALARY_STRUCTURE':
        return { label: 'Configure salary', open: () => startSalaryFix(issue) };
      case 'MISSING_UAN':
        return { label: 'Add UAN', open: () => startSalaryFix(issue) };
      case 'ATTENDANCE_NOT_FINALIZED':
        return {
          label: 'Finalize attendance',
          open: () => navigate(`/admin/attendance?finalize=${run.period_year}-${pad2(run.period_month)}`)
        };
      case 'PENDING_ATTENDANCE_CORRECTION':
        return { label: 'Review request', open: () => navigate('/admin/attendance-corrections') };
      case 'MISSING_EMAIL':
        return { label: 'Add email', open: () => navigate(`/admin/employees?edit=${issue.employeeId}`) };
      default: {
        const item = (selectedRun?.items || []).find((i) => String(i.employee_id) === String(issue.employeeId));
        return { label: 'View details', open: () => item && setDetailItem(item) };
      }
    }
  }

  async function startSalaryFix(issue) {
    const emp = employees.find((e) => String(e.id) === String(issue.employeeId));
    if (!emp || !selectedRun) {
      setError(`Employee ${issue.empCode || ''} is not available in your employee list.`);
      return;
    }
    const run = selectedRun.run;
    const periodStart = `${run.period_year}-${pad2(run.period_month)}-01`;
    setSalaryFix({
      runId: run.id,
      periodYear: run.period_year,
      periodMonth: run.period_month,
      periodStart,
      employeeId: String(emp.id),
      fullName: issue.fullName || emp.full_name,
      empCode: issue.empCode || emp.employee_id
    });
    setRunForm((f) => ({ ...f, periodYear: run.period_year, periodMonth: run.period_month }));
    setActiveTab('salary-setup');
    try {
      await loadSalary(String(emp.id));
    } catch {
      setError('Unable to load salary.');
      return;
    }
    setSalaryForm((f) => (f.effectiveDate > periodStart ? { ...f, effectiveDate: periodStart } : f));
    setTimeout(() => {
      ctcInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ctcInputRef.current?.focus();
    }, 50);
  }

  async function finishSalaryFix() {
    const fix = salaryFix;
    const period = `${pad2(fix.periodMonth)}/${fix.periodYear}`;
    try {
      const runRes = await api.get(`/payroll/runs/${fix.runId}`);
      const status = runRes.data.data?.run?.status;
      if (!canOperate || !['DRAFT', 'SUBMITTED'].includes(status)) {
        setMessage(
          `Salary saved for ${fix.fullName}. Payroll ${period} is ${status}, so it was not recalculated — it must be reopened first.`
        );
        setSalaryFix(null);
        return;
      }
      await api.post(`/payroll/runs/${fix.runId}/calculate`);
      await openRun(fix.runId);
      await load();
      setSalaryFix(null);
      setActiveTab('runs');
      setMessage(`Salary saved for ${fix.fullName} and payroll ${period} recalculated.`);
    } catch (err) {
      setError(err.response?.data?.message || `Salary saved, but payroll ${period} could not be recalculated.`);
    }
  }

  async function saveConfig(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.put('/payroll/config', {
        companyId: Number(configCompanyId),
        basicPercent: Number(config.basic_percent),
        daPercentOfBasic: Number(config.da_percent_of_basic),
        hraPercentOfBasic: Number(config.hra_percent_of_basic),
        pfWageCeiling: Number(config.pf_wage_ceiling),
        employeePfPercent: Number(config.employee_pf_percent),
        employerPfPercent: Number(config.employer_pf_percent),
        enableBonus: Boolean(Number(config.enable_bonus)),
        bonusType: config.bonus_type,
        bonusPercentOfBasic: Number(config.bonus_percent_of_basic),
        enableAttendanceBonus: Boolean(Number(config.enable_attendance_bonus)),
        attendanceBonusAmount: Number(config.attendance_bonus_amount),
        attendanceMinPercent: Number(config.attendance_min_percent),
        enableGratuity: Boolean(Number(config.enable_gratuity)),
        gratuityPercentOfBasic: Number(config.gratuity_percent_of_basic),
        payrollDayBasis: config.payroll_day_basis,
        enablePt: Boolean(Number(config.enable_pt)),
        ptAmount: Number(config.pt_amount),
        ptThreshold: Number(config.pt_threshold),
        enableEsi: Boolean(Number(config.enable_esi)),
        employeeEsiPercent: Number(config.employee_esi_percent ?? 0.75),
        employerEsiPercent: Number(config.employer_esi_percent ?? 3.25),
        esiWageCeiling: Number(config.esi_wage_ceiling ?? 21000),
        companyAddress: config.company_address,
        effectiveFrom: configEffectiveFrom
      });
      setConfig(res.data.data);
      setMessage('Salary configuration saved. New payroll calculations will use these percentages.');
      await runConfigPreview();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save configuration.');
    }
  }

  async function runConfigPreview() {
    if (!configCompanyId || !configPreviewCtc || !config) return;
    try {
      const res = await api.post('/payroll/calculate-preview', {
        companyId: Number(configCompanyId),
        annualCtc: Number(configPreviewCtc),
        enableBonus: Boolean(Number(config.enable_bonus)),
        enableAttendanceBonus: Boolean(Number(config.enable_attendance_bonus)),
        enableGratuity: Boolean(Number(config.enable_gratuity)),
        configOverrides: {
          basicPercent: Number(config.basic_percent),
          daPercentOfBasic: Number(config.da_percent_of_basic),
          hraPercentOfBasic: Number(config.hra_percent_of_basic),
          pfWageCeiling: Number(config.pf_wage_ceiling),
          employeePfPercent: Number(config.employee_pf_percent),
          employerPfPercent: Number(config.employer_pf_percent),
          bonusPercentOfBasic: Number(config.bonus_percent_of_basic),
          attendanceBonusAmount: Number(config.attendance_bonus_amount),
          attendanceMinPercent: Number(config.attendance_min_percent),
          gratuityPercentOfBasic: Number(config.gratuity_percent_of_basic),
          enableEsi: Boolean(Number(config.enable_esi)),
          employeeEsiPercent: Number(config.employee_esi_percent ?? 0.75),
          employerEsiPercent: Number(config.employer_esi_percent ?? 3.25),
          esiWageCeiling: Number(config.esi_wage_ceiling ?? 21000)
        }
      });
      setConfigPreview(res.data.data);
    } catch (err) {
      setConfigPreview(null);
      setError(err.response?.data?.message || 'Unable to preview configuration.');
    }
  }

  async function createRun(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/payroll/runs', runForm);
      setMessage('Payroll period created.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create payroll run.');
    }
  }

  async function openRun(id) {
    const res = await api.get(`/payroll/runs/${id}`);
    setSelectedRun(res.data.data);
    setDetailItem(null);
    if (res.data.data?.run?.status === 'PAID') {
      await loadDeliveries(id);
    } else {
      setDeliveries(null);
    }
    if (String(res.data.data?.run?.id) !== String(releaseResult?.runId)) setReleaseResult(null);
  }

  async function loadDeliveries(runId) {
    try {
      const res = await api.get(`/payroll/runs/${runId}/email-deliveries`);
      setDeliveries({ runId, ...res.data.data });
      return res.data.data;
    } catch {
      setDeliveries(null);
      return null;
    }
  }

  const deliveryPollRun = deliveries?.inProgress ? deliveries.runId : null;
  useEffect(() => {
    if (!deliveryPollRun) return undefined;
    const timer = window.setInterval(async () => {
      const data = await loadDeliveries(deliveryPollRun);
      if (data && !data.inProgress) {
        const res = await api.get(`/payroll/runs/${deliveryPollRun}`).catch(() => null);
        if (res) setSelectedRun(res.data.data);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [deliveryPollRun]);

  async function fetchRunPayslip(item, download) {
    const res = await api.get(`/payroll/runs/${selectedRun.run.id}/employees/${item.employee_id}/payslip`, {
      params: download ? { download: 1 } : undefined
    });
    return res.data.data;
  }

  async function viewPayslip(item) {
    setPayslipBusy(`view-${item.employee_id}`);
    setError('');
    try {
      setPayslipPreview(await fetchRunPayslip(item, false));
    } catch (err) {
      setError(err.response?.data?.message || `Unable to load the payslip for ${item.emp_code}.`);
    } finally {
      setPayslipBusy(null);
    }
  }

  async function downloadPayslip(item) {
    setPayslipBusy(`pdf-${item.employee_id}`);
    setError('');
    try {
      await generatePayslipPdf(await fetchRunPayslip(item, true));
    } catch (err) {
      setError(err.response?.data?.message || `Unable to download the payslip for ${item.emp_code}.`);
    } finally {
      setPayslipBusy(null);
    }
  }

  async function retryFailedEmails() {
    setDeliveryBusy(true);
    setError('');
    try {
      const res = await api.post(`/payroll/runs/${selectedRun.run.id}/email-deliveries/retry`);
      setMessage(res.data.message);
      setDeliveries({ runId: selectedRun.run.id, ...res.data.data });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to retry payslip emails.');
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function resendEmail(delivery) {
    setDeliveryBusy(true);
    setError('');
    try {
      const res = await api.post(
        `/payroll/runs/${selectedRun.run.id}/email-deliveries/${delivery.id}/resend`
      );
      setMessage(`${res.data.message} (${delivery.emp_code})`);
      await loadDeliveries(selectedRun.run.id);
    } catch (err) {
      setError(err.response?.data?.message || `Unable to resend the payslip email to ${delivery.emp_code}.`);
    } finally {
      setDeliveryBusy(false);
    }
  }

  function viewRun(id) {
    setActiveTab('runs');
    openRun(id)
      .then(() => runDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      .catch((err) => setError(err.response?.data?.message || 'Unable to open payroll run.'));
  }

  async function runAction(path, { skipConfirm, reason } = {}) {
    const needsConfirm = ['approve', 'lock', 'release'].includes(path);
    if (needsConfirm && !skipConfirm) {
      setConfirmAction(path);
      return undefined;
    }
    if (path.includes('reopen') && reason === undefined) {
      setReopenReason('');
      setReopenError('');
      setReopenOpen(true);
      return undefined;
    }
    setConfirmAction(null);
    setError('');
    setMessage('');
    try {
      const body = path.includes('reopen') ? { reason } : undefined;
      if (path.includes('reopen') && !body.reason) return 'A reason is required.';
      const res = await api.post(`/payroll/runs/${selectedRun.run.id}/${path}`, body);
      const labels = {
        calculate: 'Attendance imported and payroll calculated.',
        submit: 'Payroll submitted for review.',
        approve: 'Payroll approved.',
        lock: 'Payroll locked. Payslips are ready — preview them below, then Submit & Release.',
        reopen: 'Payroll reopened.'
      };
      if (path === 'release') {
        setReleaseResult({ runId: selectedRun.run.id, ...res.data.data });
        setMessage(res.data.message);
      } else {
        setMessage(labels[path] || `Payroll ${path} completed.`);
      }
      await openRun(selectedRun.run.id);
      await load();
      return null;
    } catch (err) {
      const msg = err.response?.data?.message || `Unable to ${path} payroll.`;
      setError(msg);
      return msg;
    }
  }

  function closeReopen() {
    setReopenOpen(false);
    setReopenReason('');
    setReopenError('');
  }

  async function submitReopen(event) {
    event.preventDefault();
    const reason = reopenReason.trim();
    if (!reason) {
      setReopenError('Please enter a reason for reopening this payroll run.');
      return;
    }
    setReopenSubmitting(true);
    const failure = await runAction('reopen', { reason });
    setReopenSubmitting(false);
    if (failure) {
      setReopenError(failure);
    } else {
      closeReopen();
    }
  }

  function parseSnapshot(item) {
    if (!item?.component_snapshot) return null;
    if (typeof item.component_snapshot === 'object') return item.component_snapshot;
    try {
      return JSON.parse(item.component_snapshot);
    } catch {
      return null;
    }
  }

  function openCompanyModal(target) {
    setCompanyForm({ code: '', name: '' });
    setCompanyFormError('');
    setCompanyModalTarget(target);
  }

  async function createCompanyInline(event) {
    event.preventDefault();
    if (!companyForm.code.trim() || !companyForm.name.trim()) {
      setCompanyFormError('Company code and name are required.');
      return;
    }
    setCompanySaving(true);
    setCompanyFormError('');
    try {
      const res = await api.post('/access/companies', companyForm);
      const newId = res.data.data?.id;
      const list = await api.get('/access/companies');
      setCompanies(list.data.data || []);
      if (newId) {
        if (companyModalTarget === 'config') setConfigCompanyId(String(newId));
        if (companyModalTarget === 'run') setRunForm((f) => ({ ...f, companyId: String(newId) }));
      }
      setMessage(`Company "${companyForm.name.trim()}" created.`);
      setCompanyModalTarget(null);
    } catch (err) {
      setCompanyFormError(err.response?.data?.message || 'Unable to create company.');
    } finally {
      setCompanySaving(false);
    }
  }

  function renderCompanyAssist(target) {
    if (isSuperAdmin) {
      return (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 10px', fontSize: 13 }}
          onClick={() => openCompanyModal(target)}
        >
          + New Company
        </button>
      );
    }
    if (!companies.length) {
      return (
        <span style={{ fontSize: 12, color: '#b45309', maxWidth: 320 }}>
          No company assigned to your account yet. Ask a Super Admin to create the company and assign you to it
          under Access &amp; Scope.
        </span>
      );
    }
    return null;
  }

  function renderCompanyModal() {
    if (!companyModalTarget) return null;
    return (
      <div style={OVERLAY_STYLE}>
        <form
          className="card"
          style={{ maxWidth: 420, width: '100%', padding: 20 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-company-title"
          onSubmit={createCompanyInline}
        >
          <h3 id="new-company-title" style={{ marginTop: 0 }}>New company</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <ConfigField label="Company code" help="Short unique code, e.g. SRSB2. Saved in upper case.">
              <input
                className="input"
                value={companyForm.code}
                autoFocus
                onChange={(e) => setCompanyForm((f) => ({ ...f, code: e.target.value }))}
                disabled={companySaving}
              />
            </ConfigField>
            <ConfigField label="Company name">
              <input
                className="input"
                value={companyForm.name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                disabled={companySaving}
              />
            </ConfigField>
          </div>
          {companyFormError ? (
            <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 10 }}>{companyFormError}</div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCompanyModalTarget(null)}
              disabled={companySaving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={companySaving}>
              {companySaving ? 'Creating…' : 'Create company'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function toggleConfigGroup(id) {
    setOpenConfigGroups((open) => (open.includes(id) ? open.filter((g) => g !== id) : [...open, id]));
  }

  function runActionsFor(status) {
    const actions = [];
    if (status === 'DRAFT' && canOperate) {
      actions.push(
        { key: 'import', path: 'calculate', label: 'Import Attendance', title: 'Bring approved attendance into payroll' },
        { key: 'calculate', path: 'calculate', label: 'Calculate Payroll' },
        { key: 'submit', path: 'submit', label: 'Submit for Review', primary: true }
      );
    }
    if (status === 'SUBMITTED' && canOperate) {
      actions.push({ key: 'recalculate', path: 'calculate', label: 'Recalculate Payroll' });
    }
    if (status === 'SUBMITTED' && canApprove) {
      actions.push({ key: 'approve', path: 'approve', label: 'Approve Payroll', primary: true });
    }
    if (status === 'APPROVED' && canApprove) {
      actions.push({
        key: 'lock',
        path: 'lock',
        label: 'Generate Payslips & Lock',
        title: 'Freeze the calculation so payslips can be reviewed before release',
        primary: true
      });
    }
    if (status === 'LOCKED') {
      if (canApprove) {
        actions.push({
          key: 'release',
          path: 'release',
          label: 'Submit & Release Payslips',
          title: 'Mark payroll paid, publish payslips to employees and email them',
          primary: true
        });
      }
      if (isSuperAdmin) {
        actions.push({ key: 'reopen', path: 'reopen', label: 'Reopen Payroll' });
      }
    }
    return actions;
  }

  const runStatus = selectedRun?.run?.status;
  const runPeriod = selectedRun ? `${pad2(selectedRun.run.period_month)}/${selectedRun.run.period_year}` : '';
  const runTotals = selectedRun?.totals || {};
  const runEmployeeCount = runTotals.employees ?? (selectedRun?.items || []).length;
  const blockingIssues = Number(runTotals.blockingIssues || 0);

  function renderTabs() {
    const pendingCount = draftRuns.length + submittedRuns.length;
    return (
      <div
        role="tablist"
        aria-label="Payroll sections"
        style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', margin: '12px 0 16px', overflowX: 'auto' }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                border: 0,
                background: 'transparent',
                borderBottom: `3px solid ${active ? 'var(--primary)' : 'transparent'}`,
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: 700,
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={16} />
              {tab.label}
              {tab.key === 'runs' && pendingCount > 0 ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: '#fef3c7',
                    color: '#92400e'
                  }}
                >
                  {pendingCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  function renderRunList(list) {
    return (
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
        {list.map((r) => (
          <li
            key={r.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--surface-muted)'
            }}
          >
            <span>
              <strong>{pad2(r.period_month)}/{r.period_year}</strong> · {r.company_name}
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => viewRun(r.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function renderOverview() {
    return (
      <>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>Payroll Dashboard</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="number"
                style={{ width: 90 }}
                value={runForm.periodMonth}
                onChange={(e) => setRunForm((f) => ({ ...f, periodMonth: e.target.value }))}
                title="Month"
              />
              <input
                className="input"
                type="number"
                style={{ width: 110 }}
                value={runForm.periodYear}
                onChange={(e) => setRunForm((f) => ({ ...f, periodYear: e.target.value }))}
                title="Year"
              />
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => loadDashboard(runForm.periodYear, runForm.periodMonth)}
              >
                Refresh KPIs
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
            <KpiCard label="Total Employees" value={dashboard?.totalEmployees ?? '—'} />
            <KpiCard label="Gross Payroll" value={inr(dashboard?.grossPayroll)} />
            <KpiCard label="Net Payroll" value={inr(dashboard?.netPayroll)} />
            <KpiCard label="Pending Payroll" value={dashboard?.pendingPayroll ?? '—'} />
            <KpiCard label="Attendance Issues" value={dashboard?.attendanceIssues ?? '—'} />
            <KpiCard label="Approved Payroll" value={dashboard?.approvedPayroll ?? '—'} />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>What&apos;s next</h2>
          {!draftRuns.length && !submittedRuns.length ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                No payroll runs are waiting on calculation or approval.
              </p>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('runs')}>
                Go to Payroll Runs
              </button>
            </div>
          ) : (
            <div className="grid two-col">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status="DRAFT" />
                  <strong>
                    {draftRuns.length} run{draftRuns.length === 1 ? '' : 's'} in Draft
                  </strong>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  Import attendance, calculate and submit for review.
                </p>
                {draftRuns.length ? renderRunList(draftRuns) : null}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status="SUBMITTED" />
                  <strong>
                    {submittedRuns.length} run{submittedRuns.length === 1 ? '' : 's'} awaiting approval
                  </strong>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  Review totals and issues, then approve.
                </p>
                {submittedRuns.length ? renderRunList(submittedRuns) : null}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderSalarySetup() {
    const selectedPeriodStart = `${runForm.periodYear}-${pad2(runForm.periodMonth)}-01`;
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Employee salary (CTC engine)</h2>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          Enter Annual CTC — the system automatically calculates Basic, DA, HRA, Special Allowance, PF, and more.
        </p>
        {salaryFix ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              padding: '12px 14px',
              marginBottom: 14,
              borderRadius: 10,
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              fontSize: 14
            }}
          >
            <span>
              <strong>{salaryFix.fullName} ({salaryFix.empCode})</strong> has no salary structure for payroll{' '}
              {pad2(salaryFix.periodMonth)}/{salaryFix.periodYear}. Enter the Annual CTC and click{' '}
              <strong>Save CTC &amp; recalculate payroll</strong> — the payroll run will be recalculated automatically.
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px' }}
              onClick={() => {
                setSalaryFix(null);
                setActiveTab('runs');
              }}
            >
              Back to payroll run
            </button>
          </div>
        ) : null}
        <div className="grid two-col" style={{ alignItems: 'start' }}>
          <div>
            <ConfigField label="Employee">
              <select
                className="input"
                value={selectedEmployee}
                onChange={(e) => {
                  if (salaryFix && e.target.value !== salaryFix.employeeId) setSalaryFix(null);
                  loadSalary(e.target.value).catch(() => setError('Unable to load salary.'));
                }}
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_id})
                  </option>
                ))}
              </select>
            </ConfigField>

            {selectedEmployee ? (
              <form onSubmit={saveSalary} style={{ marginTop: 14 }}>
                <div className="form-grid">
                  <ConfigField label="Annual CTC">
                    <input
                      ref={ctcInputRef}
                      className="input"
                      type="number"
                      placeholder="e.g. 600000"
                      value={salaryForm.ctc}
                      onChange={(e) => setSalaryForm((f) => ({ ...f, ctc: e.target.value }))}
                      required
                    />
                  </ConfigField>
                  <ConfigField label="Payroll month (for preview / attendance)">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input
                        className="input"
                        type="number"
                        value={runForm.periodMonth}
                        onChange={(e) => setRunForm((f) => ({ ...f, periodMonth: e.target.value }))}
                        title="Month"
                      />
                      <input
                        className="input"
                        type="number"
                        value={runForm.periodYear}
                        onChange={(e) => setRunForm((f) => ({ ...f, periodYear: e.target.value }))}
                        title="Year"
                      />
                    </div>
                  </ConfigField>
                  <ConfigField label="Work location">
                    <input
                      className="input"
                      placeholder="Work location"
                      value={salaryForm.location}
                      onChange={(e) => setSalaryForm((f) => ({ ...f, location: e.target.value }))}
                    />
                  </ConfigField>
                  <ConfigField
                    label="Effective date"
                    help={
                      salaryForm.effectiveDate > selectedPeriodStart ? (
                        <span style={{ color: '#b45309' }}>
                          Payroll uses the salary effective on the 1st of the month, so this salary will not apply to{' '}
                          {pad2(runForm.periodMonth)}/{runForm.periodYear}. Use {selectedPeriodStart} or earlier.
                        </span>
                      ) : (
                        'Payroll for a month uses the salary effective on the 1st of that month.'
                      )
                    }
                  >
                    <input
                      className="input"
                      type="date"
                      value={salaryForm.effectiveDate}
                      onChange={(e) => setSalaryForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                      required
                    />
                  </ConfigField>
                </div>

                <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={salaryForm.enableBonus}
                      onChange={(e) => setSalaryForm((f) => ({ ...f, enableBonus: e.target.checked }))}
                    />{' '}
                    Enable Bonus
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={salaryForm.enableAttendanceBonus}
                      onChange={(e) =>
                        setSalaryForm((f) => ({ ...f, enableAttendanceBonus: e.target.checked }))
                      }
                    />{' '}
                    Enable Attendance Bonus
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={salaryForm.enableGratuity}
                      onChange={(e) => setSalaryForm((f) => ({ ...f, enableGratuity: e.target.checked }))}
                    />{' '}
                    Enable Gratuity
                  </label>
                </div>

                <fieldset
                  style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px 14px' }}
                >
                  <legend style={{ fontWeight: 800, fontSize: 13, padding: '0 6px' }}>PF &amp; Statutory</legend>
                  <div role="radiogroup" aria-label="PF applicable" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>PF applicable</span>
                    <label>
                      <input
                        type="radio"
                        name="pf-applicable"
                        checked={statutory.pfApplicable}
                        onChange={() => setStatutory((s) => ({ ...s, pfApplicable: true }))}
                      />{' '}
                      Yes
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="pf-applicable"
                        checked={!statutory.pfApplicable}
                        onChange={() => setStatutory((s) => ({ ...s, pfApplicable: false }))}
                      />{' '}
                      No
                    </label>
                  </div>
                  {statutory.pfApplicable ? (
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      <ConfigField
                        label="UAN (Universal Account Number)"
                        help={
                          statutory.uanNumber && !/^\d{12}$/.test(statutory.uanNumber.replace(/\s/g, ''))
                            ? <span style={{ color: '#b91c1c' }}>UAN must be exactly 12 digits.</span>
                            : 'Printed (masked) on the payslip. Leave blank if not yet allotted.'
                        }
                      >
                        <input
                          className="input"
                          inputMode="numeric"
                          maxLength={14}
                          placeholder="12-digit UAN"
                          value={statutory.uanNumber}
                          onChange={(e) => setStatutory((s) => ({ ...s, uanNumber: e.target.value }))}
                        />
                      </ConfigField>
                      <ConfigField label="PF wage basis" help="Basic + DA, capped at the PF wage ceiling in Salary Configuration.">
                        <input
                          className="input"
                          readOnly
                          value={preview?.pfBase != null ? inr(preview.pfBase) : 'Calculate preview to see'}
                        />
                      </ConfigField>
                    </div>
                  ) : (
                    <p className="helper-text" style={{ margin: '8px 0 0' }}>
                      No employee or employer PF is deducted. The employer PF share is paid as Special Allowance so the CTC is unchanged.
                    </p>
                  )}
                </fieldset>

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" type="button" onClick={runPreview}>
                    Calculate preview
                  </button>
                  <button className="btn btn-primary" type="submit">
                    {salaryFix ? 'Save CTC & recalculate payroll' : 'Save CTC & auto structure'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          <div>
            <h3 style={{ margin: '0 0 4px' }}>Salary breakdown</h3>
            {preview ? (
              <Breakdown calc={preview} />
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                {selectedEmployee
                  ? 'Enter Annual CTC and click Calculate preview to see the monthly breakdown.'
                  : 'Select an employee to view or set up their salary structure.'}
              </p>
            )}
          </div>
        </div>
        {selectedEmployee ? renderSalaryHistory() : null}
      </div>
    );
  }

  function renderSalaryHistory() {
    const today = new Date().toISOString().slice(0, 10);
    const active = salaryHistory.filter((s) => s.status === 'ACTIVE');
    const currentId = active.find((s) => String(s.effective_date).slice(0, 10) <= today)?.id;
    const tag = (s) => {
      const date = String(s.effective_date).slice(0, 10);
      if (s.status === 'ACTIVE' && date > today) return ['Scheduled', 'open'];
      if (s.id === currentId) return ['Current', 'active'];
      return ['Historical', 'muted'];
    };
    return (
      <section style={{ marginTop: 20 }} aria-labelledby="salary-history-title">
        <h3 id="salary-history-title" style={{ margin: '0 0 4px' }}>Salary history</h3>
        <p className="helper-text" style={{ margin: '0 0 8px' }}>
          Each salary change is kept. Payroll for a month uses the salary effective on the 1st of that month, so saving a
          new CTC never changes past payroll.
        </p>
        {salaryHistory.length ? (
          <div className="table-wrap">
            <table className="table-cards">
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th>Annual CTC</th>
                  <th>Monthly gross</th>
                  <th>PF</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salaryHistory.map((s) => {
                  const [label, variant] = tag(s);
                  return (
                    <tr key={s.id}>
                      <td data-label="Effective from">{String(s.effective_date).slice(0, 10)}</td>
                      <td data-label="Annual CTC">{inr(s.ctc)}</td>
                      <td data-label="Monthly gross">{inr(s.calculation?.grossSalary)}</td>
                      <td data-label="PF">{Number(s.pf_applicable ?? 1) ? 'Applicable' : 'Not applicable'}</td>
                      <td data-label="Status">
                        <span className={`badge badge-${variant}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No salary saved yet</strong>
            Enter the Annual CTC above and save to create the first salary structure.
          </div>
        )}
      </section>
    );
  }

  function renderConfiguration() {
    const header = (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Salary Configuration</h2>
            <p className="page-subtitle">
              Percentages drive the Salary Calculation Engine for all new payroll calculations.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 6, minWidth: 240 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Company</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 220 }}
                value={configCompanyId}
                onChange={(e) => setConfigCompanyId(e.target.value)}
                aria-label="Company"
              >
                {!companies.length ? <option value="">No companies</option> : null}
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {renderCompanyAssist('config')}
            </div>
          </div>
        </div>
      </div>
    );

    if (!config) {
      return (
        <>
          {header}
          {companies.length ? (
            <div className="card" style={{ marginTop: 16 }}>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading salary configuration…</p>
            </div>
          ) : null}
        </>
      );
    }
    const setField = (key) => (e) => setConfig((c) => ({ ...c, [key]: e.target.value }));
    const setToggle = (key) => (checked) => setConfig((c) => ({ ...c, [key]: checked ? 1 : 0 }));
    const onOff = (v) => (isOn(v) ? 'on' : 'off');

    return (
      <>
        {header}

        <div className="payroll-config-layout">
          <form onSubmit={saveConfig} style={{ minWidth: 0 }}>
            <ConfigGroup
              id="earnings"
              title="Earnings Structure"
              summary={`Basic ${config.basic_percent}% of CTC · DA ${config.da_percent_of_basic}% · HRA ${config.hra_percent_of_basic}% of Basic`}
              open={openConfigGroups.includes('earnings')}
              onToggle={toggleConfigGroup}
            >
              <div className="form-grid">
                <ConfigField
                  label="Basic (% of monthly CTC)"
                  help="Percentage of monthly CTC paid as Basic. Most other components are calculated from this."
                >
                  <input className="input" type="number" step="0.01" min="0" max="100" value={config.basic_percent}
                    onChange={setField('basic_percent')} />
                </ConfigField>
                <ConfigField
                  label="DA (% of Basic)"
                  help="Dearness Allowance as a percentage of Basic. Set 0 if the company does not pay DA."
                >
                  <input className="input" type="number" step="0.01" min="0" max="100" value={config.da_percent_of_basic}
                    onChange={setField('da_percent_of_basic')} />
                </ConfigField>
                <ConfigField
                  label="HRA (% of Basic)"
                  help="House Rent Allowance as a percentage of Basic, not of CTC."
                >
                  <input className="input" type="number" step="0.01" min="0" max="100" value={config.hra_percent_of_basic}
                    onChange={setField('hra_percent_of_basic')} />
                </ConfigField>
                <ConfigField
                  label="Special Allowance"
                  help="Calculated automatically as the balance after Basic, DA, HRA and employer contributions, so the total always matches CTC."
                >
                  <div className="input" style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                    Automatic balancing component
                  </div>
                </ConfigField>
              </div>
            </ConfigGroup>

            <ConfigGroup
              id="bonus"
              title="Bonus & Gratuity"
              summary={`Bonus ${onOff(config.enable_bonus)} · Attendance bonus ${onOff(config.enable_attendance_bonus)} · Gratuity ${onOff(config.enable_gratuity)}`}
              open={openConfigGroups.includes('bonus')}
              onToggle={toggleConfigGroup}
            >
              <ToggleBlock title="Enable Bonus" checked={isOn(config.enable_bonus)} onChange={setToggle('enable_bonus')}>
                <ConfigField
                  label="Bonus (% of Basic)"
                  help="Bonus paid as a percentage of Basic, added on top of the CTC-based earnings."
                >
                  <input className="input" type="number" step="0.01" value={config.bonus_percent_of_basic}
                    onChange={setField('bonus_percent_of_basic')} />
                </ConfigField>
              </ToggleBlock>
              <ToggleBlock
                title="Enable Attendance Bonus"
                checked={isOn(config.enable_attendance_bonus)}
                onChange={setToggle('enable_attendance_bonus')}
              >
                <div className="form-grid">
                  <ConfigField
                    label="Attendance bonus amount (₹)"
                    help="Flat amount added to the month's pay when the employee meets the minimum attendance."
                  >
                    <input className="input" type="number" value={config.attendance_bonus_amount}
                      onChange={setField('attendance_bonus_amount')} />
                  </ConfigField>
                  <ConfigField
                    label="Minimum attendance (%)"
                    help="Employee must attend at least this % of working days to earn the attendance bonus."
                  >
                    <input className="input" type="number" step="0.01" value={config.attendance_min_percent}
                      onChange={setField('attendance_min_percent')} />
                  </ConfigField>
                </div>
              </ToggleBlock>
              <ToggleBlock title="Enable Gratuity" checked={isOn(config.enable_gratuity)} onChange={setToggle('enable_gratuity')}>
                <ConfigField
                  label="Gratuity (% of Basic)"
                  help="Employer gratuity provision as a percentage of Basic. Counted inside CTC, not paid out monthly."
                >
                  <input className="input" type="number" step="0.01" value={config.gratuity_percent_of_basic}
                    onChange={setField('gratuity_percent_of_basic')} />
                </ConfigField>
              </ToggleBlock>
            </ConfigGroup>

            <ConfigGroup
              id="statutory"
              title="Statutory Deductions"
              summary={`PF ${config.employee_pf_percent}% / ${config.employer_pf_percent}% · ESI ${onOff(config.enable_esi)} · PT ${isOn(config.enable_pt) ? inr(config.pt_amount) : 'off'}`}
              open={openConfigGroups.includes('statutory')}
              onToggle={toggleConfigGroup}
            >
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-muted)', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Provident Fund (PF)</div>
                <div className="form-grid">
                  <ConfigField
                    label="Employee PF (%)"
                    help="Deducted from the employee's pay on the PF wage (Basic + DA, capped at the ceiling)."
                  >
                    <input className="input" type="number" step="0.01" value={config.employee_pf_percent}
                      onChange={setField('employee_pf_percent')} />
                  </ConfigField>
                  <ConfigField
                    label="Employer PF (%)"
                    help="Employer's share on the same PF wage. Counted inside CTC, not deducted from pay."
                  >
                    <input className="input" type="number" step="0.01" value={config.employer_pf_percent}
                      onChange={setField('employer_pf_percent')} />
                  </ConfigField>
                  <ConfigField
                    label="PF wage ceiling (₹)"
                    help="PF is calculated as if Basic + DA never exceeds this amount, even if actual pay is higher."
                  >
                    <input className="input" type="number" value={config.pf_wage_ceiling}
                      onChange={setField('pf_wage_ceiling')} />
                  </ConfigField>
                </div>
              </div>

              <ToggleBlock
                title="Enable ESI"
                checked={isOn(config.enable_esi)}
                onChange={setToggle('enable_esi')}
                collapseWhenOff
                offText="ESI is disabled. Employee ESI deduction will be ₹0."
              >
                <div className="form-grid">
                  <ConfigField
                    label="Employee ESI rate (%)"
                    help="Deducted from the employee's monthly gross when ESI applies."
                  >
                    <input className="input" type="number" step="0.01" min="0" value={config.employee_esi_percent ?? 0.75}
                      onChange={setField('employee_esi_percent')} />
                  </ConfigField>
                  <ConfigField
                    label="Employer ESI rate (%)"
                    help="Employer's contribution on the same gross. Not deducted from pay."
                  >
                    <input className="input" type="number" step="0.01" min="0" value={config.employer_esi_percent ?? 3.25}
                      onChange={setField('employer_esi_percent')} />
                  </ConfigField>
                  <ConfigField
                    label="ESI wage ceiling (₹)"
                    help="ESI is only deducted if monthly gross salary is at or below this amount."
                  >
                    <input className="input" type="number" min="0" value={config.esi_wage_ceiling ?? 21000}
                      onChange={setField('esi_wage_ceiling')} />
                  </ConfigField>
                </div>
              </ToggleBlock>

              <ToggleBlock title="Enable Professional Tax" checked={isOn(config.enable_pt)} onChange={setToggle('enable_pt')}>
                <div className="form-grid">
                  <ConfigField
                    label="PT amount (₹)"
                    help="Flat professional tax deducted each month when gross meets the threshold."
                  >
                    <input className="input" type="number" value={config.pt_amount}
                      onChange={setField('pt_amount')} />
                  </ConfigField>
                  <ConfigField
                    label="PT threshold (₹)"
                    help="Monthly gross at or above which professional tax is deducted."
                  >
                    <input className="input" type="number" value={config.pt_threshold}
                      onChange={setField('pt_threshold')} />
                  </ConfigField>
                </div>
              </ToggleBlock>
            </ConfigGroup>

            <ConfigGroup
              id="basis"
              title="Payroll Basis & Company Info"
              summary={`${DAY_BASIS_LABELS[config.payroll_day_basis] || config.payroll_day_basis} · effective ${configEffectiveFrom}`}
              open={openConfigGroups.includes('basis')}
              onToggle={toggleConfigGroup}
            >
              <div className="form-grid">
                <ConfigField
                  label="Payroll day basis"
                  help="How per-day pay is worked out for LOP: fixed 30 days, calendar days in the month, or working days."
                >
                  <select className="input" value={config.payroll_day_basis} onChange={setField('payroll_day_basis')}>
                    <option value="FIXED_30_DAYS">Fixed 30 days</option>
                    <option value="CALENDAR_DAYS">Calendar days</option>
                    <option value="WORKING_DAYS">Working days</option>
                  </select>
                </ConfigField>
                <ConfigField
                  label="Effective From"
                  help="Payroll calculated for dates on or after this uses these settings."
                >
                  <input className="input" type="date" value={configEffectiveFrom}
                    onChange={(e) => setConfigEffectiveFrom(e.target.value)} />
                </ConfigField>
              </div>
              <div style={{ marginTop: 14 }}>
                <ConfigField label="Company address (payslip)" help="Printed in the header of every payslip.">
                  <textarea className="input" rows={2} value={config.company_address || ''}
                    onChange={setField('company_address')} />
                </ConfigField>
              </div>
            </ConfigGroup>

            <button className="btn btn-primary" type="submit">
              Save Configuration
            </button>
          </form>

          <aside className="card payroll-config-preview">
            <h3 style={{ marginTop: 0 }}>Live calculation preview</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              Runs the backend engine with the values currently entered, before you save.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 150px' }}>
                <ConfigField label="Test Annual CTC">
                  <input className="input" type="number" value={configPreviewCtc}
                    onChange={(e) => setConfigPreviewCtc(e.target.value)} />
                </ConfigField>
              </div>
              <button className="btn btn-secondary" type="button" onClick={runConfigPreview}>
                Preview
              </button>
            </div>
            {configPreview ? (
              <Breakdown calc={configPreview} />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 0 }}>
                Click Preview to see how these settings split the test CTC.
              </p>
            )}
          </aside>
        </div>
      </>
    );
  }

  function renderRunDetail() {
    if (!selectedRun) {
      return <p style={{ color: 'var(--text-muted)' }}>Select a payroll period from history to calculate and approve.</p>;
    }
    const actions = runActionsFor(runStatus);
    return (
      <>
        <PayrollStatusStepper status={runStatus} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
          <SummaryItem label="Payroll Month" value={runPeriod} />
          <SummaryItem label="Company" value={selectedRun.run.company_name} />
          <SummaryItem label="Payroll Status" value={<StatusBadge status={runStatus} />} />
          <SummaryItem label="Employees in Run" value={runEmployeeCount} />
          <SummaryItem label="Total Gross" value={inr(runTotals.totalGross)} />
          <SummaryItem label="Total Deductions" value={inr(runTotals.totalDeductions)} />
          <SummaryItem label="Total Net Pay" value={inr(runTotals.totalNet)} />
          <SummaryItem label="Working Days (basis)" value={selectedRun.run.working_days} />
        </div>

        {(selectedRun.issues || []).length > 0 ? (
          <div
            className="card"
            style={{
              marginBottom: 12,
              padding: 12,
              background: '#fffbeb',
              border: '1px solid #fcd34d'
            }}
          >
            <h3 style={{ marginTop: 0 }}>Payroll Issues</h3>
            <p className="helper-text" style={{ margin: '0 0 8px' }}>Click an issue to open the place where it is fixed.</p>
            <ul className="issue-list">
              {(selectedRun.issues || []).map((issue, idx) => {
                const fix = issueFix(issue);
                return (
                  <li key={`${issue.code}-${issue.employeeId}-${idx}`}>
                    <button
                      type="button"
                      className={`issue-row ${issue.severity === 'BLOCKING' ? 'blocking' : 'warning'}`}
                      onClick={fix.open}
                      aria-label={`${issue.empCode}: ${issue.message.replace(/\.$/, '')}. ${fix.label}`}
                    >
                      <span>
                        <strong>
                          {issue.severity === 'BLOCKING' ? '⛔' : '⚠'} {issue.empCode}
                        </strong>{' '}
                        — {issue.message}
                      </span>
                      <span className="issue-row-action">{fix.label} →</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {renderEligibility()}
        {renderReleaseSummary()}

        {actions.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {actions.map((a) => (
              <button
                key={a.key}
                className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`}
                type="button"
                title={a.title}
                onClick={() => runAction(a.path)}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table-cards">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Paid days</th>
                <th>Gross</th>
                <th>PF (Emp)</th>
                <th>Net</th>
                <th>Eligibility</th>
                {runStatus === 'PAID' ? <th>Email</th> : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(selectedRun.items || []).length === 0 ? (
                <tr>
                  <td colSpan={8} data-label="">
                    <div className="empty-state">
                      <strong>No employees calculated yet</strong>
                      Click Import Attendance / Calculate Payroll to build this run.
                    </div>
                  </td>
                </tr>
              ) : (
                (selectedRun.items || []).map((item) => {
                  const eligible = item.eligibility === 'ELIGIBLE';
                  const monthName = MONTH_NAMES[Number(selectedRun.run.period_month) - 1];
                  return (
                    <tr key={item.id}>
                      <td data-label="Employee">
                        <span>
                          {item.full_name}
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {item.emp_code}
                            {item.pf_applicable === false ? ' · PF not applicable' : ''}
                          </div>
                        </span>
                      </td>
                      <td data-label="Paid days">{item.payable_days}</td>
                      <td data-label="Gross">{inr(item.gross_earnings)}</td>
                      <td data-label="PF (Emp)">{inr(item.pf_employee)}</td>
                      <td data-label="Net"><strong>{inr(item.net_pay)}</strong></td>
                      <td data-label="Eligibility">
                        <span
                          className={`badge badge-${eligible ? 'active' : 'blocked'}`}
                          title={eligible ? undefined : item.calculation_notes || 'Resolve the payroll issue for this employee'}
                        >
                          {eligible ? 'Eligible' : 'Blocked'}
                        </span>
                      </td>
                      {runStatus === 'PAID' ? (
                        <td data-label="Email">
                          {item.email_status ? (
                            <span
                              className={`badge badge-${item.email_status.toLowerCase()}`}
                              title={item.email_error || undefined}
                            >
                              {item.email_status.charAt(0) + item.email_status.slice(1).toLowerCase()}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      ) : null}
                      <td data-label="Actions">
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px' }}
                            onClick={() => setDetailItem(item)}
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => viewPayslip(item)}
                            disabled={!eligible || Boolean(payslipBusy)}
                            aria-label={`View Payslip for ${item.emp_code}`}
                            title="View Payslip"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => downloadPayslip(item)}
                            disabled={!eligible || Boolean(payslipBusy)}
                            aria-label={`Download Payslip for ${item.emp_code}`}
                            title={
                              eligible
                                ? `Download Payslip (${payslipFileName({
                                    emp_code: item.emp_code,
                                    period_month: selectedRun.run.period_month,
                                    period_year: selectedRun.run.period_year
                                  })})`
                                : `Payslip unavailable — ${monthName} payroll is not calculated for this employee`
                            }
                          >
                            {payslipBusy === `pdf-${item.employee_id}` ? (
                              <RefreshCw size={16} className="spin" />
                            ) : (
                              <FileDown size={16} />
                            )}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {renderDeliveryPanel()}
      </>
    );
  }

  function renderEligibility() {
    if (!(selectedRun.items || []).length) return null;
    const t = selectedRun.totals || {};
    const finalized = selectedRun.attendance?.finalized;
    return (
      <div className="wf-kpis" style={{ margin: '12px 0' }} aria-label="Payroll eligibility">
        <div className="wf-kpi">
          <span>Attendance</span>
          <strong style={{ color: finalized ? '#166534' : '#b45309', fontSize: 16 }}>
            {finalized ? 'Finalized' : 'Not finalized'}
          </strong>
        </div>
        <div className="wf-kpi"><span>Eligible</span><strong>{t.eligible ?? 0}</strong></div>
        <div className="wf-kpi">
          <span>Blocked</span>
          <strong style={t.blocked ? { color: '#b91c1c' } : undefined}>{t.blocked ?? 0}</strong>
        </div>
        <div className="wf-kpi">
          <span>No email</span>
          <strong style={t.missingEmail ? { color: '#b45309' } : undefined}>{t.missingEmail ?? 0}</strong>
        </div>
        {runStatus === 'PAID' ? (
          <div className="wf-kpi"><span>Payslips released</span><strong>{t.payslips ?? 0}</strong></div>
        ) : null}
      </div>
    );
  }

  function renderReleaseSummary() {
    if (runStatus !== 'PAID' || String(releaseResult?.runId) !== String(selectedRun.run.id)) return null;
    const d = releaseResult.delivery || {};
    return (
      <div className="message message-success" role="status" style={{ margin: '12px 0', display: 'grid', gap: 4 }}>
        <strong>Payroll {runPeriod} released.</strong>
        <span>
          {releaseResult.payslips} payslip(s) published to employees. {d.PENDING || 0} email(s) queued
          {d.SKIPPED ? `, ${d.SKIPPED} skipped (no email address)` : ''}. Delivery status updates below.
        </span>
        {canViewEmployeePayslips ? (
          <Link to={`/admin/employee-payslips?companyId=${selectedRun.run.company_id}&runId=${selectedRun.run.id}`}>
            Open released payslips
          </Link>
        ) : null}
      </div>
    );
  }

  function renderDeliveryPanel() {
    if (runStatus !== 'PAID' || !deliveries || String(deliveries.runId) !== String(selectedRun.run.id)) return null;
    const c = deliveries.counts || {};
    const failed = c.FAILED || 0;
    return (
      <section className="card" style={{ marginTop: 16, padding: 16 }} aria-labelledby="email-delivery-title">
        <div className="section-heading" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3 id="email-delivery-title" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Mail size={18} aria-hidden="true" /> Payslip email delivery
            </h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }} aria-live="polite">
              {c.SENT || 0} sent · {(c.PENDING || 0) + (c.SENDING || 0)} sending · {failed} failed · {c.SKIPPED || 0} skipped
              {deliveries.inProgress ? ' — updating…' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadDeliveries(selectedRun.run.id)}
              disabled={deliveryBusy}
            >
              <RefreshCw size={16} /> Refresh
            </button>
            {canApprove ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={retryFailedEmails}
                disabled={deliveryBusy || !failed}
                title={failed ? undefined : 'No failed emails'}
              >
                Retry failed ({failed})
              </button>
            ) : null}
          </div>
        </div>
        {deliveries.dryRun ? (
          <p className="message message-warning" style={{ marginTop: 0 }}>
            Email dry-run mode is on for this server: payslip PDFs are generated but no email is sent.
          </p>
        ) : null}
        {deliveries.total ? (
          <div className="table-wrap">
            <table className="table-cards">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Details</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deliveries.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Employee">
                      <span>
                        {d.full_name}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.emp_code}</div>
                      </span>
                    </td>
                    <td data-label="Email">{d.email || '—'}</td>
                    <td data-label="Status">
                      <span className={`badge badge-${d.status.toLowerCase()}`}>
                        {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td data-label="Attempts">{d.attempts}</td>
                    <td data-label="Details" style={{ fontSize: 12, maxWidth: 320 }}>
                      {d.status === 'SENT' && d.sent_at
                        ? `Sent ${String(d.sent_at).slice(0, 16).replace('T', ' ')}`
                        : d.last_error || '—'}
                    </td>
                    <td data-label="">
                      {canOperate && ['FAILED', 'SENT', 'SKIPPED'].includes(d.status) && d.email ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px' }}
                          onClick={() => resendEmail(d)}
                          disabled={deliveryBusy}
                          aria-label={`${d.status === 'SENT' ? 'Resend' : 'Retry'} payslip email for ${d.emp_code}`}
                        >
                          {d.status === 'SENT' ? 'Resend' : 'Retry'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No email deliveries</strong>
            This run was released before payslip emails were introduced.
          </div>
        )}
      </section>
    );
  }

  function renderPayslipPreview() {
    if (!payslipPreview) return null;
    return (
      <Modal
        title={`Payslip — ${payslipPreview.full_name} (${payslipPreview.emp_code})`}
        subtitle={payslipPreview.is_preview ? 'Preview — not yet released to the employee.' : undefined}
        onClose={() => setPayslipPreview(null)}
        width={960}
      >
        <PayslipCard
          payslip={payslipPreview}
          variant="admin"
          onDownload={() => generatePayslipPdf(payslipPreview)}
        />
      </Modal>
    );
  }

  function renderRuns() {
    return (
      <>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Payroll History</h2>
            <form onSubmit={createRun} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 180 }}
                value={runForm.companyId}
                onChange={(e) => setRunForm((f) => ({ ...f, companyId: e.target.value }))}
                required
              >
                <option value="">Company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                style={{ width: 100 }}
                value={runForm.periodYear}
                onChange={(e) => setRunForm((f) => ({ ...f, periodYear: e.target.value }))}
                title="Year"
              />
              <input
                className="input"
                type="number"
                style={{ width: 80 }}
                min={1}
                max={12}
                value={runForm.periodMonth}
                onChange={(e) => setRunForm((f) => ({ ...f, periodMonth: e.target.value }))}
                title="Month"
              />
              <button className="btn btn-primary" type="submit">Create period</button>
              {renderCompanyAssist('run')}
            </form>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 4px' }}>
            {STATUS_FILTERS.map((s) => {
              const active = runStatusFilter === s;
              const color = s === 'ALL' ? '#0f172a' : PAYROLL_STATUS_COLORS[s];
              const count = s === 'ALL' ? runs.length : runs.filter((r) => r.status === s).length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRunStatusFilter(s)}
                  aria-pressed={active}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    background: active ? `${color}1a` : 'white',
                    color: active ? color : 'var(--text-muted)'
                  }}
                >
                  {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()} ({count})
                </button>
              );
            })}
          </div>

          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <SortableTh label="Month" sortKey="period" table={runsTable} />
                  <SortableTh label="Company" sortKey="company" table={runsTable} />
                  <SortableTh label="Status" sortKey="status" table={runsTable} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runsTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      {runs.length ? 'No payroll periods with this status.' : 'No payroll periods yet.'}
                    </td>
                  </tr>
                ) : (
                  runsTable.pageRows.map((r) => (
                    <tr
                      key={r.id}
                      style={selectedRun?.run?.id === r.id ? { background: 'var(--primary-soft)' } : undefined}
                    >
                      <td>
                        {pad2(r.period_month)}/{r.period_year}
                      </td>
                      <td>{r.company_name}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => viewRun(r.id)}
                        >
                          View
                        </button>
                        {canViewEmployeePayslips ? (
                          <Link
                            className="btn btn-secondary"
                            to={`/admin/employee-payslips?companyId=${r.company_id}&runId=${r.id}`}
                          >
                            Payslips
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar table={runsTable} />
        </div>

        <div className="card" ref={runDetailRef} style={{ scrollMarginTop: 88 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>
              Payroll Run{selectedRun ? ` — ${runPeriod} · ${selectedRun.run.company_name}` : ''}
            </h2>
            {selectedRun ? <StatusBadge status={runStatus} /> : null}
          </div>
          {renderRunDetail()}
          <p style={{ marginTop: 12 }}>
            {canViewEmployeePayslips ? (
              <>
                <Link
                  to={
                    selectedRun
                      ? `/admin/employee-payslips?companyId=${selectedRun.run.company_id}`
                      : '/admin/employee-payslips'
                  }
                >
                  {selectedRun ? `All payslips — ${selectedRun.run.company_name}` : 'All company payslips'}
                </Link>
                {' · '}
              </>
            ) : null}
            <Link to="/admin/attendance-corrections">Correction Requests</Link>
          </p>
        </div>
      </>
    );
  }

  function renderDetailPanel() {
    if (!detailItem) return null;
    const snap = parseSnapshot(detailItem);
    const att = snap?.attendanceSummary;
    const figures = snap ? buildPayslipFigures({ ...detailItem, breakdown: snap }) : null;
    const payableDays = detailItem.payable_days ?? snap?.paidDays ?? '—';
    const workingDays = snap?.basisDays ?? selectedRun?.run?.working_days ?? '—';
    const stats = [
      { label: 'Present', value: att?.presentDays },
      { label: 'Paid Leave', value: att?.paidLeave },
      { label: 'Half Day', value: att?.halfDays },
      { label: 'LOP Days', value: snap?.lopDays ?? att?.lopDays, danger: true }
    ];

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.45)',
          zIndex: 1200,
          display: 'flex',
          justifyContent: 'flex-end'
        }}
        onClick={() => setDetailItem(null)}
      >
        <div
          className="card"
          style={{
            width: 'min(560px, 100%)',
            height: '100%',
            margin: 0,
            borderRadius: 0,
            overflow: 'auto',
            padding: 20,
            background: 'var(--surface-muted)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Employee Payroll Detail</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setDetailItem(null)}>
              Close
            </button>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{detailItem.full_name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{detailItem.emp_code}</div>
              </div>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'var(--primary-soft)',
                  color: 'var(--primary-dark)',
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: 'nowrap'
                }}
              >
                Payable Days {payableDays} / Working Days {workingDays}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Department</div>
                <strong>{detailItem.department_name || '—'}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Designation</div>
                <strong>{detailItem.designation || '—'}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Joining Date</div>
                <strong>{detailItem.joining_date ? String(detailItem.joining_date).slice(0, 10) : '—'}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
            {stats.map((s) => (
              <div key={s.label} className="card" style={{ padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.danger && Number(s.value) > 0 ? '#b91c1c' : 'inherit' }}>
                  {s.value ?? '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Salary</h3>
            {figures ? (
              <>
                <EarningsDeductionsTable figures={figures} />
                <NetPayBanner netPay={figures.netPay} />
                <EmployerContributions figures={figures} />
              </>
            ) : (
              <p style={{ margin: 0 }}>No calculation snapshot available. Recalculate payroll.</p>
            )}
          </div>

          {['DRAFT', 'SUBMITTED'].includes(runStatus) && canOperate ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => runAction('calculate')}>
                Recalculate
              </button>
              {runStatus === 'DRAFT' ? (
                <button type="button" className="btn btn-primary" onClick={() => runAction('submit')}>
                  Submit for Approval
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderConfirmModal() {
    if (!confirmAction) return null;
    const blockApprove = confirmAction === 'approve' && blockingIssues > 0;
    const content = {
      approve: {
        title: 'Approve payroll',
        body: (
          <>
            You&apos;re about to approve payroll for <strong>{runEmployeeCount}</strong> employees totaling{' '}
            <strong>{inr(runTotals.totalNet)}</strong> net pay.
          </>
        )
      },
      lock: {
        title: 'Generate payslips & lock payroll',
        body: (
          <>
            Locking freezes payroll for <strong>{runPeriod}</strong> so payslips for{' '}
            <strong>{runEmployeeCount}</strong> employees can be previewed and downloaded. No recalculation is possible
            until a Super Admin reopens it. Employees do not see anything until you Submit &amp; Release.
          </>
        )
      },
      release: {
        title: `Submit & release payroll for ${runPeriod}?`,
        body: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong>{runEmployeeCount}</strong> employees · <strong>{inr(runTotals.totalNet)}</strong> net pay ·{' '}
              <strong>{runEmployeeCount - Number(runTotals.missingEmail || 0)}</strong> payslip email(s)
              {Number(runTotals.missingEmail || 0) ? `, ${runTotals.missingEmail} without an email address` : ''}
            </span>
            <span style={{ display: 'block' }}>When you confirm:</span>
            <span style={{ display: 'block', paddingLeft: 12 }}>• payroll is marked Paid and stays locked permanently;</span>
            <span style={{ display: 'block', paddingLeft: 12 }}>• each employee can see their payslip in My Payslips;</span>
            <span style={{ display: 'block', paddingLeft: 12 }}>
              • each payslip PDF is emailed automatically — track delivery and retry failures on this page.
            </span>
            <span style={{ display: 'block', marginTop: 8, color: '#b91c1c', fontWeight: 700 }}>This cannot be undone.</span>
          </>
        )
      }
    }[confirmAction];

    return (
      <div style={OVERLAY_STYLE}>
        <div className="card" style={{ maxWidth: 460, width: '100%', padding: 20 }} role="dialog" aria-modal="true">
          <h3 style={{ marginTop: 0 }}>{content?.title || 'Confirm action'}</h3>
          <div style={{ lineHeight: 1.5, margin: '0 0 14px' }}>{content?.body}</div>
          {blockApprove ? (
            <p className="message message-error">
              {blockingIssues} blocking issue{blockingIssues === 1 ? '' : 's'} remain. Resolve them before approving.
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmAction(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={blockApprove}
              onClick={() => runAction(confirmAction, { skipConfirm: true })}
            >
              {confirmAction === 'release' ? 'Submit & Release' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderReopenModal() {
    if (!reopenOpen || !selectedRun) return null;
    return (
      <div style={OVERLAY_STYLE}>
        <form
          className="card"
          style={{ maxWidth: 480, width: '100%', padding: 20 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-title"
          onSubmit={submitReopen}
        >
          <h3 id="reopen-title" style={{ marginTop: 0 }}>Reopen payroll</h3>
          <p style={{ marginTop: 0 }}>
            Reopening Payroll for <strong>{runPeriod}</strong> — {selectedRun.run.company_name}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            The run will return to Draft so it can be recalculated and approved again.
          </p>
          <label htmlFor="reopen-reason" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Reason for reopening <span style={{ color: '#b91c1c' }}>*</span>
          </label>
          <textarea
            id="reopen-reason"
            className="input"
            rows={4}
            value={reopenReason}
            autoFocus
            aria-invalid={Boolean(reopenError)}
            aria-describedby={reopenError ? 'reopen-reason-error' : undefined}
            style={reopenError ? { borderColor: '#dc2626' } : undefined}
            onChange={(e) => {
              setReopenReason(e.target.value);
              if (reopenError) setReopenError('');
            }}
          />
          {reopenError ? (
            <div id="reopen-reason-error" style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>
              {reopenError}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={closeReopen} disabled={reopenSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={reopenSubmitting}>
              {reopenSubmitting ? 'Reopening…' : 'Confirm Reopen'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        .payroll-config-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
          gap: 16px;
          align-items: start;
          margin-top: 16px;
        }
        .payroll-config-preview {
          position: sticky;
          top: 88px;
          max-height: calc(100vh - 104px);
          overflow: auto;
        }
        @media (max-width: 1200px) {
          .payroll-config-layout { grid-template-columns: 1fr; }
          .payroll-config-preview { position: static; max-height: none; order: -1; }
        }
      `}</style>

      <div className="section-heading" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Salary & Payroll</h1>
          <p className="page-subtitle">
            Set up salaries, configure the calculation rules, and run monthly payroll.
          </p>
        </div>
      </div>

      {renderTabs()}

      {message ? <div className="message message-success" style={{ marginBottom: 12 }}>{message}</div> : null}
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}

      {activeTab === 'overview' ? renderOverview() : null}
      {activeTab === 'salary-setup' ? renderSalarySetup() : null}
      {activeTab === 'configuration' ? renderConfiguration() : null}
      {activeTab === 'runs' ? renderRuns() : null}

      {renderDetailPanel()}
      {renderPayslipPreview()}
      {renderConfirmModal()}
      {renderReopenModal()}
      {renderCompanyModal()}
    </div>
  );
}
