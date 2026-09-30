import {
  LayoutDashboard,
  Users,
  Clock3,
  CalendarDays,
  Building2,
  BriefcaseBusiness,
  UserRoundSearch,
  ListTodo,
  FileBarChart,
  Settings,
  UserCircle,
  KeyRound,
  CalendarCheck2,
  ReceiptIndianRupee,
  ClipboardCheck,
  ShieldCheck,
  ClipboardList,
  Wallet,
  Package,
  Bell
} from 'lucide-react';

export const adminNavigation = [
  {
    section: 'HR Management',
    items: [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'Employees', path: '/admin/employees', icon: Users },
      { label: 'Password Management', path: '/admin/passwords', icon: KeyRound },
      { label: 'Attendance', path: '/admin/attendance', icon: Clock3 },
      { label: 'Attendance Corrections', path: '/admin/attendance-corrections', icon: ClipboardCheck },
      { label: 'Correction Workflow', path: '/admin/attendance-correction-workflow', icon: ClipboardList },
      { label: 'Leave & Approvals', path: '/admin/requests', icon: CalendarDays },
      { label: 'Holiday Calendar', path: '/admin/holidays', icon: CalendarCheck2 },
      { label: 'Onboarding', path: '/admin/onboarding', icon: ClipboardList },
      { label: 'Salary & Payroll', path: '/admin/payroll', icon: Wallet },
      { label: 'Employee Payslips', path: '/admin/employee-payslips', icon: Wallet },
      { label: 'Assets', path: '/admin/assets', icon: Package }
    ]
  },
  {
    section: 'Recruitment',
    items: [
      { label: 'Clients', path: '/admin/clients', icon: Building2 },
      { label: 'Job Requirements', path: '/admin/openings', icon: BriefcaseBusiness },
      { label: 'Candidates & Placements', path: '/admin/candidates', icon: UserRoundSearch }
    ]
  },
  {
    section: 'Finance & Work',
    items: [
      { label: 'Invoices', path: '/admin/invoices', icon: ReceiptIndianRupee },
      { label: 'Tasks', path: '/admin/tasks', icon: ListTodo },
      { label: 'Reports', path: '/admin/reports', icon: FileBarChart },
      { label: 'Ops Reports', path: '/admin/ops-reports', icon: FileBarChart },
      { label: 'Notifications', path: '/admin/notifications', icon: Bell }
    ]
  },
  {
    section: 'System',
    items: [
      {
        label: 'Activation Codes',
        path: '/admin/activation-codes',
        icon: KeyRound
      },
      { label: 'Access & Scope', path: '/admin/access', icon: ShieldCheck },
      { label: 'Access Requests', path: '/admin/access-requests', icon: KeyRound },
      { label: 'Settings & Updates', path: '/admin/settings', icon: Settings }
    ]
  }
];

export const onboardingOnlyNavigation = [
  {
    section: 'Onboarding',
    items: [
      { label: 'My Onboarding', path: '/employee/onboarding', icon: ClipboardList },
      { label: 'Notifications', path: '/employee/notifications', icon: Bell },
      { label: 'Settings', path: '/employee/settings', icon: Settings }
    ]
  }
];

export const employeeNavigation = [
  {
    section: 'Employee Portal',
    items: [
      { label: 'My Dashboard', path: '/employee', icon: LayoutDashboard },
      { label: 'My Onboarding', path: '/employee/onboarding', icon: ClipboardList },
      { label: 'My Attendance', path: '/employee/attendance', icon: Clock3 },
      { label: 'Attendance Correction', path: '/employee/attendance-corrections', icon: ClipboardCheck },
      { label: 'My Leave', path: '/employee/leave', icon: CalendarDays },
      { label: 'Holiday Calendar', path: '/employee/holidays', icon: CalendarCheck2 },
      { label: 'My Tasks', path: '/employee/tasks', icon: ListTodo },
      { label: 'My Assets', path: '/employee/assets', icon: Package },
      { label: 'My Payslips', path: '/employee/payslips', icon: Wallet },
      { label: 'My Assigned Openings', path: '/employee/openings', icon: BriefcaseBusiness },
      { label: 'Candidates', path: '/employee/candidates', icon: UserRoundSearch },
      { label: 'Notifications', path: '/employee/notifications', icon: Bell },
      { label: 'My Profile', path: '/employee/profile', icon: UserCircle }
    ]
  },
  {
    section: 'System',
    items: [
      { label: 'Access Requests', path: '/employee/access-requests', icon: KeyRound },
      { label: 'Settings & Updates', path: '/employee/settings', icon: Settings }
    ]
  }
];
