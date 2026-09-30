import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import SetupWizard from '../pages/SetupWizard.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import AdminDashboard from '../pages/admin/AdminDashboard.jsx';
import EmployeeDashboard from '../pages/employee/EmployeeDashboard.jsx';
import Employees from '../pages/admin/Employees.jsx';
import Clients from '../pages/admin/Clients.jsx';
import Tasks from '../pages/Tasks.jsx';
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
import ActivationCodes from '../pages/admin/ActivationCodes.jsx';
import { isSrsbHeadAdmin } from '../utils/srsbHeadAdmin.js';
import AccessManagement from '../pages/admin/AccessManagement.jsx';
import OnboardingQueue from '../pages/OnboardingQueue.jsx';
import OnboardingCaseDetail from '../pages/OnboardingCaseDetail.jsx';
import PayrollPage from '../pages/admin/PayrollPage.jsx';
import AssetsPage from '../pages/admin/AssetsPage.jsx';
import AccessRequestsPage from '../pages/admin/AccessRequestsPage.jsx';
import ExtendedReportsPage from '../pages/admin/ExtendedReportsPage.jsx';
import MyPayslips from '../pages/employee/MyPayslips.jsx';
import MyAssets from '../pages/employee/MyAssets.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';
import MyOnboarding from '../pages/employee/MyOnboarding.jsx';
import ActivateAccount from '../pages/ActivateAccount.jsx';
import AttendanceCorrectionsPage from '../pages/admin/AttendanceCorrectionsPage.jsx';
import EmployeePayslipsPage from '../pages/admin/EmployeePayslipsPage.jsx';

const adminRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER'
];
const payslipStaffRoles = ['ADMIN', 'HR', 'MANAGER'];

export function homePathFor(user) {
  if (!user) return getUnauthenticatedHome();
  if (user.onboardingOnly) return '/employee/onboarding';
  return adminRoles.includes(user.role) ? '/admin' : '/employee';
}

function getUnauthenticatedHome() {
  // Existing companies (including SRSB) go to login.
  // Brand-new companies use Login → "New company? Complete setup".
  return '/login';
}

export default function AppRoutes() {
  const { user } = useAuth();
  const home = homePathFor(user);

  // Joiners who are not activated yet can only complete their onboarding checklist.
  if (user?.onboardingOnly) {
    return (
      <Routes>
        <Route path="/activate-account" element={<ActivateAccount />} />
        <Route element={<ProtectedRoute><AppLayout mode="employee" /></ProtectedRoute>}>
          <Route path="/employee/onboarding" element={<MyOnboarding />} />
          <Route path="/employee/notifications" element={<NotificationsPage />} />
          <Route path="/employee/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={home} replace /> : <Login />}
      />
      <Route path="/activate-account" element={<ActivateAccount />} />
      <Route
        path="/setup"
        element={
          user ? (
            <Navigate to={home} replace />
          ) : (
            <SetupWizard />
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
          element={
            <ProtectedRoute
              roles={[
                'SUPER_ADMIN',
                'ADMIN'
              ]}
            >
              <Openings />
            </ProtectedRoute>
          }
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
        <Route path="/admin/attendance-correction-workflow" element={<AttendanceCorrectionsPage />} />
        <Route path="/admin/onboarding" element={<OnboardingQueue />} />
        <Route path="/admin/onboarding/:caseId" element={<OnboardingCaseDetail />} />
        <Route path="/admin/payroll" element={<PayrollPage />} />

        <Route
          path="/admin/requests"
          element={<RequestsApprovals />}
        />

        <Route path="/admin/holidays" element={<Holidays />} />
        <Route path="/admin/invoices" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Invoices /></ProtectedRoute>} />
        <Route
          path="/admin/activation-codes"
          element={
            isSrsbHeadAdmin(user) ? (
              <ActivationCodes />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

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
          path="/admin/employee-payslips"
          element={
            <ProtectedRoute roles={payslipStaffRoles}>
              <EmployeePayslipsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/assets" element={<AssetsPage />} />
        <Route path="/admin/ops-reports" element={<ExtendedReportsPage />} />
        <Route path="/admin/notifications" element={<NotificationsPage />} />
        <Route
          path="/admin/access"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN']}>
              <AccessManagement />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/access-requests" element={<AccessRequestsPage />} />
        <Route path="/admin/my-leave" element={<MyLeave />} />
        <Route path="/admin/my-profile" element={<MyProfile />} />
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
        <Route path="/employee/onboarding" element={<MyOnboarding />} />
        <Route path="/employee/onboarding/:caseId" element={<Navigate to="/employee/onboarding" replace />} />
        <Route path="/employee/assets" element={<MyAssets />} />
        <Route path="/employee/payslips" element={<MyPayslips />} />
        <Route path="/employee/notifications" element={<NotificationsPage />} />
        <Route path="/employee/access-requests" element={<AccessRequestsPage />} />

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

      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
