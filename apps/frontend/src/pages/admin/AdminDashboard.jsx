import { useEffect, useState } from 'react';
import { Building2, BriefcaseBusiness, Cake, CalendarDays, IndianRupee, ListTodo, UserRoundSearch, Users, WalletCards } from 'lucide-react';
import api from '../../services/api.js';
import StatCard from '../../components/StatCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const label = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminDashboard() {
  const { user, tenant } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/dashboard/admin').then((response) => setData(response.data.data)).catch((requestError) => setError(requestError.response?.data?.message || 'Unable to load dashboard.')); }, []);
  if (error) return <div className="message message-error">{error}</div>;
  if (!data) return <div className="card">Loading dashboard...</div>;

  const greetings = data.greetings || {};
  return <div className="module-page">
    <div className="page-heading-row"><div><p className="eyebrow">Live Company Overview</p><h1 className="page-title">HR & Recruitment Dashboard</h1><p className="page-subtitle">Workforce, candidates, client requirements, tasks and today’s company moments.</p></div></div>

    {(greetings.holidays || []).map((holiday) => <div className="dashboard-greeting festival-greeting" key={holiday.id}><CalendarDays size={28}/><div><strong>{holiday.greeting_message || `Wishing you a Happy ${holiday.holiday_name}!`}</strong><span>{holiday.department_name ? `For ${holiday.department_name} department` : 'For all employees'}</span></div></div>)}

    {(greetings.employeeBirthdays || []).length > 0 && <div className="dashboard-greeting birthday-greeting"><Cake size={28}/><div><strong>Happy Birthday!</strong><span>{greetings.employeeBirthdays.map((item) => `${item.full_name}${item.designation ? ` — ${item.designation}` : ''}`).join(', ')}</span></div></div>}

    <div className="grid stats-grid">
      <StatCard label="Active Employees" value={data.employees?.active || 0} icon={Users} hint={`${data.employees?.total || 0} total employees`} to="/admin/employees" />
      <StatCard label="Active Clients" value={data.clients?.active || 0} icon={Building2} hint={`${data.clients?.total || 0} total clients`} to="/admin/clients" />
      <StatCard label="Active Requirements" value={data.openings?.active || 0} icon={BriefcaseBusiness} hint={`${data.openings?.total || 0} total requirements`} to="/admin/openings" />
      <StatCard label="Candidates" value={data.candidates?.total || 0} icon={UserRoundSearch} hint={`${tenant?.companyName || 'Company'} candidate database`} to="/admin/candidates" />
      <StatCard label="Pending Tasks" value={data.tasks?.pending || 0} icon={ListTodo} hint={`${data.tasks?.overdue || 0} overdue`} to="/admin/tasks" />
      {user?.role === 'SUPER_ADMIN' && <><StatCard label="Invoice Revenue" value={money(data.invoices?.invoiced)} icon={IndianRupee} hint="Total recruitment invoices" to="/admin/invoices" /><StatCard label="Outstanding" value={money(data.invoices?.outstanding)} icon={WalletCards} hint={`${money(data.invoices?.received)} received`} to="/admin/invoices" /></>}
    </div>

    <div className="dashboard-detail-grid">
      <div className="card"><div className="section-heading"><div><h2>Recruitment Pipeline</h2><p className="page-subtitle">Current candidate sourcing stages.</p></div></div><div className="pipeline-list">{(data.pipeline || []).length === 0 ? <p className="empty-copy">No candidate applications yet.</p> : data.pipeline.map((item) => <div key={item.stage}><span>{label(item.stage)}</span><strong>{item.value}</strong></div>)}</div></div>
      <div className="card"><div className="section-heading"><div><h2>Candidate Birthday Reminders</h2><p className="page-subtitle">Recruiters can contact candidates celebrating today.</p></div><Cake size={20}/></div><div className="birthday-list">{(greetings.candidateBirthdays || []).length === 0 ? <p className="empty-copy">No candidate birthdays today.</p> : greetings.candidateBirthdays.map((candidate) => <div key={candidate.id}><strong>{candidate.full_name}</strong><span>{candidate.phone || candidate.email || 'No contact details'}</span></div>)}</div></div>
    </div>
  </div>;
}
