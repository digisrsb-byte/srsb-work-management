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
  KeyRound
} from 'lucide-react';

export const adminNavigation = [
  {
    section: 'HR Management',
    items: [
      {
        label: 'Dashboard',
        path: '/admin',
        icon: LayoutDashboard
      },
      {
        label: 'Employees',
        path: '/admin/employees',
        icon: Users
      },
      {
        label: 'Password Management',
        path: '/admin/passwords',
        icon: KeyRound
      },
      {
        label: 'Attendance',
        path: '/admin/attendance',
        icon: Clock3
      },
      {
        label: 'Requests & Approvals',
        path: '/admin/requests',
        icon: CalendarDays
      }
    ]
  },
  {
    section: 'Recruitment',
    items: [
      {
        label: 'Clients',
        path: '/admin/clients',
        icon: Building2
      },
      {
        label: 'Requirements',
        path: '/admin/openings',
        icon: BriefcaseBusiness
      },
      {
        label: 'Candidates',
        path: '/admin/candidates',
        icon: UserRoundSearch
      }
    ]
  },
  {
    section: 'Work Management',
    items: [
      {
        label: 'Tasks',
        path: '/admin/tasks',
        icon: ListTodo
      },
      {
        label: 'Reports',
        path: '/admin/reports',
        icon: FileBarChart
      }
    ]
  },
  {
    section: 'System',
    items: [
      {
        label: 'Settings',
        path: '/admin/settings',
        icon: Settings
      }
    ]
  }
];

export const employeeNavigation = [
  {
    section: 'Employee Portal',
    items: [
      {
        label: 'My Dashboard',
        path: '/employee',
        icon: LayoutDashboard
      },
      {
        label: 'My Attendance',
        path: '/employee/attendance',
        icon: Clock3
      },
      {
        label: 'My Leave',
        path: '/employee/leave',
        icon: CalendarDays
      },
      {
        label: 'My Tasks',
        path: '/employee/tasks',
        icon: ListTodo
      },
{
  label: 'Candidates',
  path: '/employee/candidates',
  icon: UserRoundSearch
},
      {
        label: 'My Profile',
        path: '/employee/profile',
        icon: UserCircle
      }
    ]
  },
  {
    section: 'System',
    items: [
      {
        label: 'Settings',
        path: '/employee/settings',
        icon: Settings
      }
    ]
  }
];