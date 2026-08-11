import {
  useEffect,
  useRef,
  useState
} from 'react';

import {
  Bell,
  CalendarDays,
  CheckCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCircle
} from 'lucide-react';

import {
  NavLink,
  Outlet
} from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

import {
  adminNavigation,
  employeeNavigation
} from '../config/navigation.js';

import api from '../services/api.js';
import UpdateBanner from '../components/UpdateBanner.jsx';

function formatNotificationDate(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function AppLayout({ mode }) {
  const [open, setOpen] = useState(false);

  const [notificationsOpen, setNotificationsOpen] =
    useState(false);

  const [notifications, setNotifications] =
    useState([]);

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [notificationsLoading, setNotificationsLoading] =
    useState(false);

  const notificationRef = useRef(null);

  const { user, logout } = useAuth();

  const filteredAdminNavigation = adminNavigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.path === '/admin/invoices') {
        return user?.role === 'SUPER_ADMIN';
      }

      if (['/admin/employees', '/admin/passwords'].includes(item.path)) {
        return ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
      }
      return true;
    })
  })).filter((group) => group.items.length > 0);

  const systemGroup = filteredAdminNavigation.find(
    (group) => group.section === 'System'
  );

  const regularAdminGroups =
    filteredAdminNavigation.filter(
      (group) => group.section !== 'System'
    );

  const adminSelfService =
    user?.role !== 'SUPER_ADMIN'
      ? {
          section: 'My Employee Portal',
          items: [
            {
              label: 'My Dashboard',
              path: '/admin/my-dashboard',
              icon: LayoutDashboard
            },
            {
              label: 'My Attendance',
              path: '/admin/my-attendance',
              icon: Clock3
            },
            {
              label: 'Attendance Correction',
              path: '/admin/my-attendance-corrections',
              icon: Clock3
            },
            {
              label: 'Holiday Calendar',
              path: '/admin/holidays',
              icon: CalendarDays
            },
            {
              label: 'My Leave',
              path: '/admin/my-leave',
              icon: CalendarDays
            },
            {
              label: 'My Profile',
              path: '/admin/my-profile',
              icon: UserCircle
            }
          ]
        }
      : null;

  const adminGroups = [
    ...regularAdminGroups,
    ...(adminSelfService
      ? [adminSelfService]
      : []),
    ...(systemGroup ? [systemGroup] : [])
  ];

  const navigation =
    mode === 'admin'
      ? adminGroups
      : employeeNavigation.map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (item.path === '/employee/openings') {
              return ['RECRUITER', 'EMPLOYEE'].includes(user?.role);
            }
            if (item.path === '/employee/candidates') {
              return ['RECRUITER', 'EMPLOYEE'].includes(user?.role);
            }
            return true;
          })
        })).filter((group) => group.items.length > 0);

  async function loadUnreadCount() {
    try {
      const response = await api.get(
        '/notifications/unread-count'
      );

      setUnreadCount(
        response.data.data?.unreadCount || 0
      );
    } catch {
      setUnreadCount(0);
    }
  }

  async function loadNotifications() {
    try {
      setNotificationsLoading(true);

      const response = await api.get(
        '/notifications'
      );

      setNotifications(
        response.data.data || []
      );
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function toggleNotifications() {
    const nextOpen = !notificationsOpen;

    setNotificationsOpen(nextOpen);

    if (nextOpen) {
      await loadNotifications();
      await loadUnreadCount();
    }
  }

  async function markNotificationRead(
    notification
  ) {
    if (notification.is_read) {
      return;
    }

    try {
      await api.put(
        `/notifications/${notification.id}/read`
      );

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                is_read: 1
              }
            : item
        )
      );

      setUnreadCount((current) =>
        Math.max(current - 1, 0)
      );
    } catch {
      return;
    }
  }

  async function markAllRead() {
    try {
      await api.put(
        '/notifications/read-all'
      );

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: 1
        }))
      );

      setUnreadCount(0);
    } catch {
      return;
    }
  }

  useEffect(() => {
    loadUnreadCount();

    const interval = window.setInterval(
      loadUnreadCount,
      30000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(
          event.target
        )
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener(
      'mousedown',
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );
    };
  }, []);

  return (
    <div className="app-shell">
      <style>
        {`
          .topbar-right {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-left: auto;
          }

          .notification-wrap {
            position: relative;
          }

          .notification-button {
            position: relative;
            width: 42px;
            height: 42px;
            display: grid;
            place-items: center;
            padding: 0;
          }

          .notification-count {
            position: absolute;
            top: -5px;
            right: -5px;
            min-width: 19px;
            height: 19px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 5px;
            border-radius: 999px;
            background: #dc2626;
            color: white;
            border: 2px solid var(--surface);
            font-size: 10px;
            font-weight: 800;
          }

          .notification-dropdown {
            position: absolute;
            top: calc(100% + 10px);
            right: 0;
            width: min(380px, calc(100vw - 28px));
            max-height: 480px;
            overflow: hidden;
            z-index: 1000;
            border: 1px solid var(--border);
            border-radius: 16px;
            background: var(--surface);
            box-shadow:
              0 18px 45px rgba(15, 23, 42, 0.18);
          }

          .notification-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 15px 16px;
            border-bottom: 1px solid var(--border);
          }

          .notification-header h3 {
            margin: 0;
            font-size: 16px;
          }

          .notification-mark-all {
            border: 0;
            background: transparent;
            color: #0f766e;
            cursor: pointer;
            font: inherit;
            font-size: 12px;
            font-weight: 700;
          }

          .notification-list {
            max-height: 400px;
            overflow-y: auto;
          }

          .notification-item {
            width: 100%;
            display: block;
            padding: 14px 16px;
            border: 0;
            border-bottom: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            text-align: left;
            cursor: pointer;
            font: inherit;
          }

          .notification-item:last-child {
            border-bottom: 0;
          }

          .notification-item:hover {
            background: var(--surface-muted);
          }

          .notification-item-unread {
            background: rgba(15, 118, 110, 0.07);
          }

          .notification-title-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          }

          .notification-title {
            font-size: 13px;
            font-weight: 800;
          }

          .notification-dot {
            width: 8px;
            height: 8px;
            flex-shrink: 0;
            margin-top: 5px;
            border-radius: 999px;
            background: #0f766e;
          }

          .notification-message {
            margin-top: 5px;
            color: var(--text-muted);
            font-size: 12px;
            line-height: 1.5;
          }

          .notification-date {
            margin-top: 7px;
            color: var(--text-muted);
            font-size: 10px;
          }

          .notification-empty {
            padding: 30px 18px;
            color: var(--text-muted);
            text-align: center;
            font-size: 13px;
          }

          @media (max-width: 650px) {
            .topbar-right .btn span {
              display: none;
            }

            .notification-dropdown {
              position: fixed;
              top: 68px;
              right: 14px;
              left: 14px;
              width: auto;
            }
          }
        `}
      </style>

      <aside
        className={`sidebar ${
          open ? 'open' : ''
        }`}
      >
        <BrandLogo name="SRSB Work Management" />

        <div className="nav-section">
          {navigation.map((group) => (
            <div
              className="nav-group"
              key={group.section}
            >
              <div className="nav-label">
                {group.section}
              </div>

              {group.items.map(
                ({
                  label,
                  path,
                  icon: Icon
                }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={
                      path === '/admin' ||
                      path === '/employee'
                    }
                    className={({ isActive }) =>
                      `nav-link ${
                        isActive
                          ? 'active'
                          : ''
                      }`
                    }
                    onClick={() =>
                      setOpen(false)
                    }
                  >
                    <Icon size={18} />
                    {label}
                  </NavLink>
                )
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="btn btn-secondary mobile-menu-btn"
            onClick={() => setOpen(!open)}
          >
            <Menu size={18} />
          </button>

          <div>
            <strong>
              {user?.full_name ||
                user?.fullName}
            </strong>

            <div
              style={{
                color: 'var(--text-muted)',
                fontSize: 12
              }}
            >
              {user?.designation ||
                user?.role}
            </div>
          </div>

          <div className="topbar-right">
            <div
              className="notification-wrap"
              ref={notificationRef}
            >
              <button
                type="button"
                className="btn btn-secondary notification-button"
                onClick={toggleNotifications}
                aria-label="Notifications"
              >
                <Bell size={18} />

                {unreadCount > 0 && (
                  <span className="notification-count">
                    {unreadCount > 99
                      ? '99+'
                      : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="notification-dropdown">
                  <div className="notification-header">
                    <h3>Notifications</h3>

                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="notification-mark-all"
                        onClick={markAllRead}
                      >
                        <CheckCheck size={14} />
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="notification-list">
                    {notificationsLoading && (
                      <div className="notification-empty">
                        Loading notifications...
                      </div>
                    )}

                    {!notificationsLoading &&
                      notifications.map(
                        (notification) => (
                          <button
                            type="button"
                            key={notification.id}
                            className={`notification-item ${
                              notification.is_read
                                ? ''
                                : 'notification-item-unread'
                            }`}
                            onClick={() =>
                              markNotificationRead(
                                notification
                              )
                            }
                          >
                            <div className="notification-title-row">
                              <span className="notification-title">
                                {notification.title}
                              </span>

                              {!notification.is_read && (
                                <span className="notification-dot" />
                              )}
                            </div>

                            <div className="notification-message">
                              {notification.message}
                            </div>

                            <div className="notification-date">
                              {formatNotificationDate(
                                notification.created_at
                              )}
                            </div>
                          </button>
                        )
                      )}

                    {!notificationsLoading &&
                      !notifications.length && (
                        <div className="notification-empty">
                          No notifications yet.
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>

            <button
              className="btn btn-secondary"
              onClick={logout}
            >
              <LogOut size={17} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <UpdateBanner />
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}