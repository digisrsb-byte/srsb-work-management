import { useEffect, useState } from 'react';
import { Bell, DownloadCloud, LockKeyhole, RefreshCw, Save, UserCircle } from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const defaultPreferences = {
  emailNotifications: true,
  leaveNotifications: true,
  taskNotifications: true,
  candidateNotifications: true
};

export default function Settings() {
  const { user } = useAuth();
  const desktop = window.srsbDesktop;
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [version, setVersion] = useState('Web');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  useEffect(() => {
    desktop?.getVersion?.().then(setVersion).catch(() => setVersion('Web'));
    const removeProgress = desktop?.onUpdateProgress?.((data) => setProgress(data.progress));
    return () => removeProgress?.();
  }, [desktop]);

  useEffect(() => {
    api.get('/profile/notification-preferences')
      .then((response) => {
        setPreferences({ ...defaultPreferences, ...(response.data.data || {}) });
      })
      .catch(() => {
        const saved = localStorage.getItem('srsb-settings');
        if (saved) {
          try {
            setPreferences({ ...defaultPreferences, ...JSON.parse(saved) });
          } catch {
            setPreferences(defaultPreferences);
          }
        }
      });
  }, []);

  async function savePreferences() {
    try {
      setSavingPreferences(true);
      setError('');
      const response = await api.put('/profile/notification-preferences', preferences);
      setPreferences(response.data.data || preferences);
      localStorage.setItem('srsb-settings', JSON.stringify(response.data.data || preferences));
      setMessage(response.data.message || 'Notification preferences saved successfully.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Notification preferences could not be saved.');
    } finally {
      setSavingPreferences(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError('New password must contain at least 8 characters.');
      return;
    }
    try {
      setSavingPassword(true);
      await api.put('/profile/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password changed successfully.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Password could not be changed.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function checkUpdates() {
    if (!desktop?.checkForUpdates) {
      setError('Automatic updates are available only in the installed desktop application.');
      return;
    }
    try {
      setCheckingUpdate(true);
      setError('');
      const result = await desktop.checkForUpdates({ refresh: true });
      setUpdateInfo(result);
      setMessage(result.updateAvailable
        ? `Version ${result.latestVersion} is available.`
        : result.success
          ? `Version ${result.currentVersion} is up to date.`
          : 'The update server could not be reached.');
    } catch (requestError) {
      setError(requestError?.message || 'Unable to check for updates.');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function installUpdate() {
    try {
      setDownloading(true);
      setError('');
      await desktop.downloadUpdate(updateInfo);
    } catch (requestError) {
      setError(requestError?.message || 'The update could not be downloaded.');
      setDownloading(false);
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row"><div><p className="eyebrow">System & Account</p><h1 className="page-title">Settings & Updates</h1><p className="page-subtitle">Manage your account preferences, password and application version.</p></div></div>
      {error && <div className="message message-error">{error}</div>}
      {message && <div className="message message-success">{message}</div>}

      <div className="settings-grid">
        <div className="card settings-card">
          <div className="settings-card-heading"><UserCircle size={24} /><div><h2>Account Information</h2><p>Your current login and employment details.</p></div></div>
          <div className="form-grid"><label className="form-group"><span>Employee Name</span><input className="input" value={user?.full_name || user?.fullName || ''} disabled /></label><label className="form-group"><span>Role</span><input className="input" value={user?.role || ''} disabled /></label><label className="form-group"><span>Designation</span><input className="input" value={user?.designation || ''} disabled /></label><label className="form-group"><span>Official Email</span><input className="input" value={user?.email || ''} disabled /></label></div>
        </div>

        <div className="card settings-card">
          <div className="settings-card-heading"><Bell size={24} /><div><h2>Notification Preferences</h2><p>Choose which alerts you want to receive.</p></div></div>
          {[
            ['emailNotifications', 'Email Notifications'],
            ['leaveNotifications', 'Leave Request Updates'],
            ['taskNotifications', 'Task Updates'],
            ['candidateNotifications', 'Candidate and Recruitment Updates']
          ].map(([key, label]) => <label className="settings-toggle" key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
          <button className="btn btn-primary" type="button" onClick={savePreferences} disabled={savingPreferences}><Save size={17} /> {savingPreferences ? 'Saving…' : 'Save Preferences'}</button>
        </div>

        <form className="card settings-card" onSubmit={changePassword}>
          <div className="settings-card-heading"><LockKeyhole size={24} /><div><h2>Change Password</h2><p>Use a strong password with at least 8 characters.</p></div></div>
          <label className="form-group"><span>Current Password</span><input className="input" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required /></label>
          <label className="form-group"><span>New Password</span><input className="input" type="password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required /></label>
          <label className="form-group"><span>Confirm New Password</span><input className="input" type="password" minLength={8} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} required /></label>
          <button className="btn btn-primary" disabled={savingPassword}><LockKeyhole size={17} /> {savingPassword ? 'Changing…' : 'Change Password'}</button>
        </form>

        <div className="card settings-card update-settings-card">
          <div className="settings-card-heading"><DownloadCloud size={24} /><div><h2>Application Updates</h2><p>Future desktop versions can be downloaded and installed from here.</p></div></div>
          <div className="version-row"><span>Installed Version</span><strong>{version}</strong></div>
          {updateInfo?.latestVersion && <div className="version-row"><span>Latest Version</span><strong>{updateInfo.latestVersion}</strong></div>}
          {downloading && <div className="download-progress"><div style={{ width: `${progress || 5}%` }} /><span>{progress === null ? 'Downloading…' : `${progress}%`}</span></div>}
          <div className="form-actions settings-update-actions"><button className="btn btn-secondary" type="button" onClick={checkUpdates} disabled={checkingUpdate || downloading}><RefreshCw className={checkingUpdate ? 'spin' : ''} size={17} /> {checkingUpdate ? 'Checking…' : 'Check for Updates'}</button>{updateInfo?.updateAvailable && <button className="btn btn-primary" type="button" onClick={installUpdate} disabled={downloading}><DownloadCloud size={17} /> {downloading ? 'Downloading…' : 'Update Now'}</button>}</div>
        </div>
      </div>
    </div>
  );
}
