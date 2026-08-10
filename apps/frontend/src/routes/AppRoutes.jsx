import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import AdminDashboard from '../pages/admin/AdminDashboard.jsx';
import EmployeeDashboard from '../pages/employee/EmployeeDashboard.jsx';
import Employees from '../pages/admin/Employees.jsx';
import Clients from '../pages/admin/Clients.jsx';
import Tasks from '../pages/Tasks.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import MyProfile from '../pages/employee/MyProfile.jsx';
import Openings from '../pages/admin/Openings.jsx';
import Reports from '../pages/admin/Reports.jsx';
import RequestsApprovals from '../pages/admin/RequestsApprovals.jsx';
import MyLeave from '../pages/employee/MyLeave.jsx';
import MyAttendance from '../pages/employee/MyAttendance.jsx';
import AttendanceManagement from '../pages/admin/AttendanceManagement.jsx';
import Candidates from '../pages/admin/Candidates.jsx';
import Settings from '../pages/Settings.jsx';
import PasswordManagement from '../pages/admin/PasswordManagement.jsx';
import AttendanceCorrections from '../pages/admin/AttendanceCorrections.jsx';
import MyAttendanceCorrections from '../pages/employee/MyAttendanceCorrections.jsx';
import Holidays from '../pages/admin/Holidays.jsx';
import Invoices from '../pages/admin/Invoices.jsx';

const adminRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER'
];

export default function AppRoutes() {
  const { user } = useAuth();

  const home = user
    ? adminRoles.includes(user.role)
      ? '/admin'
      : '/employee'
    : '/login';

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={home} replace />
          ) : (
            <Login />
          )
        }
      />

      <Route
        element={
          <ProtectedRoute roles={adminRoles}>
            <AppLayout mode="admin" />
          </ProtectedRoute>
        }
      >
        <Route
          path="/admin"
          element={<AdminDashboard />}
        />

        <Route
          path="/admin/employees"
          element={<ProtectedRoute roles={['SUPER_ADMIN','ADMIN']}><Employees /></ProtectedRoute>}
        />

        <Route path="/admin/passwords" element={<ProtectedRoute roles={['SUPER_ADMIN','ADMIN']}><PasswordManagement /></ProtectedRoute>} />

        <Route
          path="/admin/clients"
          element={<Clients />}
        />

        <Route
          path="/admin/openings"
          element={<Openings />}
        />

        <Route
          path="/admin/tasks"
          element={<Tasks />}
        />


        <Route
  path="/admin/attendance"
  element={<AttendanceManagement />}
/>

        <Route path="/admin/attendance-corrections" element={<AttendanceCorrections />} />

        <Route
          path="/admin/requests"
          element={<RequestsApprovals />}
        />

        <Route path="/admin/holidays" element={<Holidays />} />
        <Route path="/admin/invoices" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Invoices /></ProtectedRoute>} />

      <Route
  path="/admin/candidates"
  element={<Candidates />}
 />

        <Route
          path="/admin/reports"
          element={<Reports />}
        />

       <Route
  path="/admin/settings"
  element={<Settings />}
/>
        <Route
          path="/admin/my-dashboard"
          element={<EmployeeDashboard />}
        />

        <Route
          path="/admin/my-attendance"
          element={<MyAttendance />}
        />

        <Route path="/admin/my-attendance-corrections" element={<MyAttendanceCorrections />} />

        <Route
          path="/admin/my-leave"
          element={<MyLeave />}
        />

        <Route
          path="/admin/my-profile"
          element={<MyProfile />}
        />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <AppLayout mode="employee" />
          </ProtectedRoute>
        }
      >
        <Route
          path="/employee"
          element={<EmployeeDashboard />}
        />

        <Route
          path="/employee/attendance"
          element={<MyAttendance />}
        />

        <Route path="/employee/attendance-corrections" element={<MyAttendanceCorrections />} />

        <Route path="/employee/holidays" element={<Holidays />} />

        <Route
          path="/employee/leave"
          element={<MyLeave />}
        />

        <Route
          path="/employee/tasks"
          element={<Tasks />}
        />
        <Route
          path="/employee/openings"
          element={<Openings />}
        />
        <Route
          path="/employee/candidates"
          element={<Candidates />}
        />
        <Route
          path="/employee/profile"
          element={<MyProfile />}
        />

        <Route
  path="/employee/settings"
  element={<Settings />}
/>
</Route>

      <Route
        path="*"
        element={<Navigate to={home} replace />}
      />
    </Routes>
  );
}