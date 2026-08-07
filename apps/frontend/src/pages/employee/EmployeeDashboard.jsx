import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Cake, CalendarCheck, CalendarDays, Clock3, ListTodo, Mail, Phone, UserCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import StatCard from '../../components/StatCard.jsx';

const hours = (minutes = 0) => { const value = Math.max(Number(minutes || 0), 0); return `${Math.floor(value / 60)}h ${value % 60}m`; };

export default function EmployeeDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const location = useLocation();
  const adminMode = location.pathname.startsWith('/admin');
  const path = (admin, employee) => adminMode ? admin : employee;

  async function load() {
    try { const response = await api.get('/dashboard/employee'); setData(response.data.data); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load dashboard.'); }
  }
  useEffect(() => { load(); const focus = () => load(); window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, []);
  if (!data) return <div className="card">Loading employee dashboard...</div>;
  const profile = data.profile || {}; const greetings = data.greetings || {};

  return <div className="module-page">
    <div className="page-heading-row"><div><p className="eyebrow">Employee Self Service</p><h1 className="page-title">Welcome, {profile.full_name || 'Employee'}</h1><p className="page-subtitle">Your profile, attendance, tasks, leave and company greetings.</p></div></div>
    {error && <div className="message message-error">{error}</div>}
    {greetings.ownBirthday && <div className="dashboard-greeting birthday-greeting"><Cake size={30}/><div><strong>Happy Birthday, {greetings.ownBirthday.full_name}! 🎉</strong><span>Wishing you happiness, success and a wonderful year ahead.</span></div></div>}
    {(greetings.holidays || []).map((holiday) => <div className="dashboard-greeting festival-greeting" key={holiday.id}><CalendarDays size={28}/><div><strong>{holiday.greeting_message || `Wishing you a Happy ${holiday.holiday_name}!`}</strong><span>{holiday.holiday_name}</span></div></div>)}

    <div className="employee-profile-summary"><div className="employee-profile-avatar">{(profile.full_name || 'E').charAt(0).toUpperCase()}</div><div className="employee-profile-main"><h2>{profile.full_name}</h2><p>{profile.employee_id || '—'} · {profile.designation || profile.role}</p></div><div className="employee-profile-details"><div><Mail size={17}/><span>{profile.email || profile.personal_email || '—'}</span></div><div><Phone size={17}/><span>{profile.phone || '—'}</span></div><div><Building2 size={17}/><span>{profile.department || '—'}</span></div></div><Link className="employee-profile-edit" to={path('/admin/my-profile','/employee/profile')}>Edit Profile <ArrowRight size={16}/></Link></div>

    <div className="grid stats-grid"><StatCard label="Today's Status" value={data.attendance?.status || 'Not Marked'} icon={Clock3}/><StatCard label="Monthly Work Time" value={hours(data.monthly?.minutes)} icon={CalendarCheck}/><StatCard label="Pending Tasks" value={data.tasks?.pending || 0} icon={ListTodo} hint={`${data.tasks?.overdue || 0} overdue`}/><StatCard label="Pending Leave" value={data.leaveRequests?.pending || 0} icon={CalendarDays}/></div>
    <div className="employee-quick-grid"><Link to={path('/admin/my-attendance','/employee/attendance')} className="employee-quick-card"><Clock3 size={22}/><div><h3>My Attendance</h3><p>Monthly colour calendar and punch actions.</p></div><ArrowRight size={18}/></Link><Link to={path('/admin/my-leave','/employee/leave')} className="employee-quick-card"><CalendarDays size={22}/><div><h3>My Leave</h3><p>Apply for leave and review approval.</p></div><ArrowRight size={18}/></Link><Link to={path('/admin/tasks','/employee/tasks')} className="employee-quick-card"><ListTodo size={22}/><div><h3>My Tasks</h3><p>Update work and request deadline extension.</p></div><ArrowRight size={18}/></Link><Link to={path('/admin/my-profile','/employee/profile')} className="employee-quick-card"><UserCircle size={22}/><div><h3>My Profile</h3><p>Review personal and work information.</p></div><ArrowRight size={18}/></Link></div>
  </div>;
}
