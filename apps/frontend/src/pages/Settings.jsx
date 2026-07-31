import { useState } from 'react';
import {
  Building2,
  Bell,
  LockKeyhole,
  Save,
  UserCircle
} from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Settings() {
  const { user } = useAuth();

  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('srsb-settings');

    return saved
      ? JSON.parse(saved)
      : {
          emailNotifications: true,
          leaveNotifications: true,
          taskNotifications: true,
          candidateNotifications: true
        };
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const isAdmin = [
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ].includes(user?.role);

  function savePreferences() {
    localStorage.setItem(
      'srsb-settings',
      JSON.stringify(preferences)
    );

    setError('');
    setMessage('Notification preferences saved successfully.');
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (
      passwordForm.newPassword !==
      passwordForm.confirmPassword
    ) {
      setError('New password and confirmation do not match.');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setError(
        'New password must contain at least 8 characters.'
      );
      return;
    }

    setSavingPassword(true);

    try {
      await api.put('/profile/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      setMessage('Password changed successfully.');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Password could not be changed.'
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Manage your account, notifications and system preferences.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="message message-error"
          style={{ marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          className="message message-success"
          style={{ marginBottom: 16 }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20
        }}
      >
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20
            }}
          >
            <UserCircle size={24} />

            <div>
              <h2 style={{ margin: 0 }}>Account Information</h2>
              <p
                className="page-subtitle"
                style={{ marginTop: 4 }}
              >
                Your current login and employment details.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Employee Name</label>
              <input
                className="input"
                value={
                  user?.full_name ||
                  user?.fullName ||
                  ''
                }
                disabled
              />
            </div>

            <div className="form-group">
              <label>Role</label>
              <input
                className="input"
                value={user?.role || ''}
                disabled
              />
            </div>

            <div className="form-group">
              <label>Designation</label>
              <input
                className="input"
                value={user?.designation || ''}
                disabled
              />
            </div>

            <div className="form-group">
              <label>Official Email</label>
              <input
                className="input"
                value={user?.email || ''}
                disabled
              />
            </div>
          </div>

          <p
            style={{
              marginTop: 16,
              color: 'var(--text-muted)',
              fontSize: 13
            }}
          >
            Official employee information can only be changed from
            Employee Management by an authorised administrator.
          </p>
        </div>

        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20
            }}
          >
            <Bell size={24} />

            <div>
              <h2 style={{ margin: 0 }}>
                Notification Preferences
              </h2>
              <p
                className="page-subtitle"
                style={{ marginTop: 4 }}
              >
                Choose which application alerts you want to receive.
              </p>
            </div>
          </div>

          {[
            {
              key: 'emailNotifications',
              label: 'Email Notifications'
            },
            {
              key: 'leaveNotifications',
              label: 'Leave Request Updates'
            },
            {
              key: 'taskNotifications',
              label: 'Task Updates'
            },
            {
              key: 'candidateNotifications',
              label: 'Candidate and Recruitment Updates'
            }
          ].map((item) => (
            <label
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '12px 0',
                borderBottom:
                  '1px solid var(--border-color)'
              }}
            >
              <span>{item.label}</span>

              <input
                type="checkbox"
                checked={preferences[item.key]}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    [item.key]: event.target.checked
                  })
                }
              />
            </label>
          ))}

          <button
            className="btn btn-primary"
            onClick={savePreferences}
            style={{ marginTop: 20 }}
          >
            <Save size={17} />
            Save Preferences
          </button>
        </div>

        <form className="card" onSubmit={changePassword}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20
            }}
          >
            <LockKeyhole size={24} />

            <div>
              <h2 style={{ margin: 0 }}>Change Password</h2>
              <p
                className="page-subtitle"
                style={{ marginTop: 4 }}
              >
                Use a strong password with at least 8 characters.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label>Current Password</label>
            <input
              className="input"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  currentPassword: event.target.value
                })
              }
              required
            />
          </div>

          <div
            className="form-group"
            style={{ marginTop: 14 }}
          >
            <label>New Password</label>
            <input
              className="input"
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  newPassword: event.target.value
                })
              }
              minLength={8}
              required
            />
          </div>

          <div
            className="form-group"
            style={{ marginTop: 14 }}
          >
            <label>Confirm New Password</label>
            <input
              className="input"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  confirmPassword: event.target.value
                })
              }
              minLength={8}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 20 }}
            disabled={savingPassword}
          >
            <LockKeyhole size={17} />
            {savingPassword
              ? 'Changing Password...'
              : 'Change Password'}
          </button>
        </form>

        {isAdmin && (
          <div className="card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16
              }}
            >
              <Building2 size={24} />

              <div>
                <h2 style={{ margin: 0 }}>
                  Company Configuration
                </h2>
                <p
                  className="page-subtitle"
                  style={{ marginTop: 4 }}
                >
                  Company profile, office shifts, holidays and
                  permission controls.
                </p>
              </div>
            </div>

            <p style={{ color: 'var(--text-muted)' }}>
              Company-level configuration will only be available to
              authorised administrators.
            </p>
          </div>
        )}
      </div>
    </>
  );
}