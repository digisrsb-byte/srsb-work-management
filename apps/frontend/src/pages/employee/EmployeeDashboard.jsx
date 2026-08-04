import {
  useEffect,
  useState
} from 'react';
import {
  Clock3,
  CalendarCheck,
  ListTodo,
  CalendarDays,
  ArrowRight,
  UserCircle,
  Mail,
  Phone,
  Briefcase,
  Building2
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import StatCard from '../../components/StatCard.jsx';

function hours(minutes = 0) {
  const value = Number(minutes || 0);
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

export default function EmployeeDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const location = useLocation();

  const isAdminMode = location.pathname.startsWith('/admin');

  const attendancePath = isAdminMode
    ? '/admin/my-attendance'
    : '/employee/attendance';

  const leavePath = isAdminMode
    ? '/admin/my-leave'
    : '/employee/leave';

  const tasksPath = isAdminMode
    ? '/admin/tasks'
    : '/employee/tasks';

  const profilePath = isAdminMode
    ? '/admin/my-profile'
    : '/employee/profile';

  async function loadDashboard() {
    try {
      setError('');

      const response = await api.get('/dashboard/employee');
      setData(response.data.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to load dashboard.'
      );
    }
  }

  useEffect(() => {
    loadDashboard();

    const handleFocus = () => loadDashboard();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (!data) {
    return (
      <div className="card">
        Loading employee dashboard...
      </div>
    );
  }

  const profile = data.profile || {};

  return (
    <div className="employee-dashboard-page">
      <div className="employee-dashboard-heading">
        <p className="employee-dashboard-eyebrow">
          Employee Self Service
        </p>

        <h1>
          Welcome, {profile.full_name || 'Employee'}
        </h1>

        <span>
          A quick summary of your profile, attendance, tasks and leave
          requests.
        </span>
      </div>

      {error && (
        <div className="employee-dashboard-error">
          {error}
        </div>
      )}

      <div className="employee-profile-summary">
        <div className="employee-profile-avatar">
          {(profile.full_name || 'E')
            .charAt(0)
            .toUpperCase()}
        </div>

        <div className="employee-profile-main">
          <h2>{profile.full_name || '-'}</h2>

          <p>
            {profile.employee_id || '-'} ·{' '}
            {profile.role || '-'}
          </p>
        </div>

        <div className="employee-profile-details">
          <div>
            <Mail size={17} />
            <span>
              {profile.email ||
                profile.personal_email ||
                '-'}
            </span>
          </div>

          <div>
            <Phone size={17} />
            <span>{profile.phone || '-'}</span>
          </div>

          <div>
            <Briefcase size={17} />
            <span>{profile.designation || '-'}</span>
          </div>

          <div>
            <Building2 size={17} />
            <span>{profile.department || '-'}</span>
          </div>
        </div>

        <Link
          to={profilePath}
          className="employee-profile-edit"
        >
          Edit Profile
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid stats-grid">
        <StatCard
          label="Today's Status"
          value={
            data.attendance?.status || 'Not Punched In'
          }
          icon={Clock3}
        />

        <StatCard
          label="Monthly Work Time"
          value={hours(data.monthly?.minutes)}
          icon={CalendarCheck}
        />

        <StatCard
          label="Pending Tasks"
          value={data.tasks?.pending || 0}
          icon={ListTodo}
        />

        <StatCard
          label="Pending Leave Requests"
          value={data.leaveRequests?.pending || 0}
          icon={CalendarDays}
        />
      </div>

      <div className="employee-quick-grid">
        <Link
          to={attendancePath}
          className="employee-quick-card"
        >
          <div className="employee-quick-icon">
            <Clock3 size={22} />
          </div>

          <div>
            <h3>My Attendance</h3>
            <p>
              Punch in, punch out and view attendance history.
            </p>
          </div>

          <ArrowRight size={18} />
        </Link>

        <Link
          to={leavePath}
          className="employee-quick-card"
        >
          <div className="employee-quick-icon">
            <CalendarDays size={22} />
          </div>

          <div>
            <h3>My Leave</h3>
            <p>
              Apply for leave and check approval status.
            </p>
          </div>

          <ArrowRight size={18} />
        </Link>

        <Link
          to={tasksPath}
          className="employee-quick-card"
        >
          <div className="employee-quick-icon">
            <ListTodo size={22} />
          </div>

          <div>
            <h3>My Tasks</h3>
            <p>
              Review assigned tasks and update progress.
            </p>
          </div>

          <ArrowRight size={18} />
        </Link>

        <Link
          to={profilePath}
          className="employee-quick-card"
        >
          <div className="employee-quick-icon">
            <UserCircle size={22} />
          </div>

          <div>
            <h3>My Profile</h3>
            <p>
              Review and update personal information.
            </p>
          </div>

          <ArrowRight size={18} />
        </Link>
      </div>

      <style>{`
        .employee-dashboard-page {
          padding: 28px;
        }

        .employee-dashboard-heading {
          margin-bottom: 22px;
        }

        .employee-dashboard-eyebrow {
          margin: 0 0 6px;
          color: #0f8b8d;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .employee-dashboard-heading h1 {
          margin: 0;
          color: #182230;
        }

        .employee-dashboard-heading span {
          display: block;
          margin-top: 6px;
          color: #667085;
        }

        .employee-dashboard-error {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          background: #fff1f1;
          color: #b42318;
          font-size: 14px;
        }

        .employee-profile-summary {
          display: grid;
          grid-template-columns: auto 1fr 2fr auto;
          align-items: center;
          gap: 20px;
          padding: 22px;
          margin-bottom: 22px;
          background: #ffffff;
          border: 1px solid #eaecf0;
          border-radius: 18px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
        }

        .employee-profile-avatar {
          display: grid;
          place-items: center;
          width: 64px;
          height: 64px;
          border-radius: 18px;
          background: linear-gradient(135deg, #0f766e, #14b8a6);
          color: white;
          font-size: 26px;
          font-weight: 800;
        }

        .employee-profile-main h2 {
          margin: 0;
          color: #182230;
          font-size: 20px;
        }

        .employee-profile-main p {
          margin: 6px 0 0;
          color: #667085;
          font-size: 13px;
        }

        .employee-profile-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .employee-profile-details div {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #475467;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .employee-profile-details svg {
          color: #0f766e;
          flex-shrink: 0;
        }

        .employee-profile-edit {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #0f766e;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
        }

        .employee-quick-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
          margin-top: 22px;
        }

        .employee-quick-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          padding: 20px;
          background: white;
          border: 1px solid #eaecf0;
          border-radius: 16px;
          color: inherit;
          text-decoration: none;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s ease;
        }

        .employee-quick-card:hover {
          transform: translateY(-2px);
          border-color: #99f6e4;
          box-shadow: 0 12px 30px rgba(16, 24, 40, 0.08);
        }

        .employee-quick-icon {
          display: grid;
          place-items: center;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: #ccfbf1;
          color: #0f766e;
        }

        .employee-quick-card h3 {
          margin: 0;
          color: #182230;
          font-size: 17px;
        }

        .employee-quick-card p {
          margin: 5px 0 0;
          color: #667085;
          font-size: 13px;
          line-height: 1.5;
        }

        @media (max-width: 1000px) {
          .employee-profile-summary {
            grid-template-columns: auto 1fr;
          }

          .employee-profile-details {
            grid-column: 1 / -1;
          }

          .employee-profile-edit {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 800px) {
          .employee-quick-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .employee-dashboard-page {
            padding: 16px;
          }

          .employee-profile-summary {
            grid-template-columns: 1fr;
          }

          .employee-profile-details {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}