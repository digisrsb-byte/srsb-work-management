import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Users,
  Building2,
  BriefcaseBusiness,
  UserRoundSearch,
  IndianRupee,
  WalletCards,
  ListTodo,
  TrendingUp,
  Activity,
  Target,
  CircleCheckBig
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import api from '../../services/api.js';
import StatCard from '../../components/StatCard.jsx';

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value || 0);

const COLORS = ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed', '#dc2626'];

export default function AdminDashboard() {
const [data, setData] = useState(null);
const [error, setError] = useState('');

const { user } = useAuth();
const canViewFinance = false; // Finance module disabled for this release
  useEffect(() => {
    api.get('/dashboard/admin')
      .then((response) => setData(response.data.data))
      .catch((err) =>
        setError(err.response?.data?.message || 'Unable to load dashboard.')
      );
  }, []);

  const workforceData = useMemo(() => {
    if (!data) return [];

    return [
      {
        category: 'Employees',
        total: data.employees?.total || 0,
        active: data.employees?.active || 0
      },
      {
        category: 'Clients',
        total: data.clients?.total || 0,
        active: data.clients?.active || 0
      },
      {
        category: 'Requirements',
        total: data.openings?.total || 0,
        active: data.openings?.active || 0
      },
      {
        category: 'Candidates',
        total: data.candidates?.total || 0,
        active: data.candidates?.total || 0
      }
    ];
  }, [data]);

  const requirementData = useMemo(() => {
    if (!data) return [];

    const total = data.openings?.total || 0;
    const active = data.openings?.active || 0;
    const closed = Math.max(total - active, 0);

    return [
      { name: 'Active Requirements', value: active },
      { name: 'Closed Requirements', value: closed }
    ];
  }, [data]);

  const financeData = useMemo(() => {
    if (!data) return [];

    return [
      {
        category: 'Revenue',
        amount: data.finance?.receivedRevenue || 0
      },
      {
        category: 'Expenses',
        amount: data.finance?.expenses || 0
      },
      {
        category: 'Outstanding',
        amount: data.finance?.outstanding || 0
      },
      {
        category: 'Net Result',
        amount: data.finance?.netProfit || 0
      }
    ];
  }, [data]);

  if (error) {
    return <div className="message message-error">{error}</div>;
  }

  if (!data) {
    return <div className="card">Loading dashboard...</div>;
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 20,
          marginBottom: 24,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h1 className="page-title">HR & Recruitment Dashboard</h1>
          <p className="page-subtitle">
            {canViewFinance
              ? 'Company workforce, recruitment, tasks and financial performance.'
              : 'Company workforce, recruitment and task performance.'}
          </p>
        </div>

        <div
          style={{
            background: 'var(--surface-muted)',
            padding: '10px 16px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          Live Company Overview
        </div>
      </div>

      <div className="grid stats-grid">
       <StatCard
           label="Active Employees"
           value={data.employees?.active || 0}
           icon={Users}
          hint={`${data.employees?.total || 0} total employees`}
          to="/admin/employees"
         />

       <StatCard
  label="Active Clients"
  value={data.clients?.active || 0}
  icon={Building2}
  hint={`${data.clients?.total || 0} total clients`}
  to="/admin/clients"
/>

       <StatCard
  label="Active Requirements"
  value={data.openings?.active || 0}
  icon={BriefcaseBusiness}
  hint={`${data.openings?.total || 0} total requirements`}
  to="/admin/openings"
/>

        <StatCard
  label="Total Candidates"
  value={data.candidates?.total || 0}
  icon={UserRoundSearch}
  hint="Candidate database"
  to="/admin/candidates"
/>

       {canViewFinance && (
  <>
    <StatCard
      label="Revenue Received"
      value={money(data.finance?.receivedRevenue)}
      icon={IndianRupee}
      hint="Payments received"
      to="/admin/finance"
    />

    <StatCard
      label="Outstanding"
      value={money(data.finance?.outstanding)}
      icon={WalletCards}
      hint="Pending collection"
      to="/admin/finance"
    />
  </>
)}

<StatCard
  label="Pending Tasks"
  value={data.tasks?.pending || 0}
  icon={ListTodo}
  hint="Needs attention"
  to="/admin/tasks"
/>

{canViewFinance && (
  <StatCard
    label="Net Profit / Loss"
    value={money(data.finance?.netProfit)}
    icon={TrendingUp}
    hint="Current net result"
    to="/admin/finance"
  />
)}
      </div>

      <div
        className="grid two-col"
        style={{
          marginTop: 22,
          alignItems: 'stretch'
        }}
      >
        <div className="card">
          <div className="section-heading">
            <div>
              <h2>Company Distribution</h2>
              <p className="page-subtitle">
                Total and active records across major HR modules.
              </p>
            </div>
            <Activity size={20} />
          </div>

          <div style={{ height: 330 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={workforceData}
                margin={{ top: 15, right: 10, left: -15, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.3}
                />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 118, 110, 0.06)' }}
                />
                <Legend />
                <Bar
                  dataKey="total"
                  name="Total"
                  fill="#cbd5e1"
                  radius={[7, 7, 0, 0]}
                />
                <Bar
                  dataKey="active"
                  name="Active"
                  fill="#0f766e"
                  radius={[7, 7, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-heading">
            <div>
              <h2>Requirement Status</h2>
              <p className="page-subtitle">
                Active and completed client requirements.
              </p>
            </div>
            <Target size={20} />
          </div>

          <div style={{ height: 330 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={requirementData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="46%"
                  innerRadius={72}
                  outerRadius={108}
                  paddingAngle={4}
                  label={({ value }) => value}
                >
                  {requirementData.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>

                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div
        className="grid two-col"
        style={{
          marginTop: 22,
          alignItems: 'stretch'
        }}
      >
        <div className="card">
          <div className="section-heading">
            <div>
              <h2>Candidate Pipeline</h2>
              <p className="page-subtitle">
                Candidates currently available at each recruitment stage.
              </p>
            </div>
            <UserRoundSearch size={20} />
          </div>

          <div style={{ height: 330 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.pipeline || []}
                margin={{ top: 15, right: 10, left: -15, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.3}
                />
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                />
                <Bar
                  dataKey="value"
                  name="Candidates"
                  fill="#2563eb"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={58}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {canViewFinance && (<div className="card">
          <div className="section-heading">
            <div>
              <h2>Financial Performance</h2>
              <p className="page-subtitle">
                Revenue, expenses, outstanding payments and net result.
              </p>
            </div>
            <IndianRupee size={20} />
          </div>

          <div style={{ height: 330 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={financeData}
                layout="vertical"
                margin={{ top: 15, right: 20, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  opacity={0.3}
                />
                <XAxis
                  type="number"
                  tickFormatter={(value) =>
                    new Intl.NumberFormat('en-IN', {
                      notation: 'compact',
                      maximumFractionDigits: 1
                    }).format(value)
                  }
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={90}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(value) => money(value)} />
                <Bar
                  dataKey="amount"
                  name="Amount"
                  fill="#7c3aed"
                  radius={[0, 8, 8, 0]}
                  maxBarSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          marginTop: 22,
          gap: 16
        }}
      >
        <div className="card">
          <CircleCheckBig size={22} />
          <div className="stat-label" style={{ marginTop: 14 }}>
            Active Workforce
          </div>
          <div className="stat-value">
            {data.employees?.active || 0}
          </div>
          <p className="page-subtitle">
            Employees currently working with the company.
          </p>
        </div>

        <div className="card">
          <Target size={22} />
          <div className="stat-label" style={{ marginTop: 14 }}>
            Requirement Completion
          </div>
          <div className="stat-value">
            {Math.max(
              (data.openings?.total || 0) -
                (data.openings?.active || 0),
              0
            )}
          </div>
          <p className="page-subtitle">
            Requirements completed or currently closed.
          </p>
        </div>

        {canViewFinance && (
          <div className="card">
            <WalletCards size={22} />
            <div className="stat-label" style={{ marginTop: 14 }}>
              Collection Pending
            </div>
            <div className="stat-value">
              {money(data.finance?.outstanding)}
            </div>
            <p className="page-subtitle">
              Client payments that still need to be collected.
            </p>
          </div>
        )}
      </div>
    </>
  );
}