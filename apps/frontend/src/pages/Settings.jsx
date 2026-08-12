import { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  DownloadCloud,
  ImagePlus,
  LockKeyhole,
  RefreshCw,
  Save,
  UserCircle
} from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCompany } from '../context/CompanyContext.jsx';

const defaultPreferences = {
  emailNotifications: true,
  leaveNotifications: true,
  taskNotifications: true,
  candidateNotifications: true
};

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(undefined);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Images must be 2 MB or smaller.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || 'image/png',
        data: String(reader.result || '')
      });
    };
    reader.onerror = () =>
      reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { user } = useAuth();
  const { settings, refresh } = useCompany();
  const desktop = window.srsbDesktop;
  const canEditCompany = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);

  const [preferences, setPreferences] = useState(defaultPreferences);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [companyForm, setCompanyForm] = useState({
    legalName: '',
    displayName: '',
    address: '',
    phone: '',
    email: '',
    gstNumber: '',
    stateCode: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankName: '',
    bankBranch: '',
    sacCode: '998591',
    authorisedSignatory: '',
    invoicePrefix: ''
  });
  const [logoPreview, setLogoPreview] = useState('');
  const [signaturePreview, setSignaturePreview] = useState('');
  const [pendingLogo, setPendingLogo] = useState(undefined);
  const [pendingSignature, setPendingSignature] = useState(undefined);
  const [version, setVersion] = useState('Web');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    desktop?.getVersion?.().then(setVersion).catch(() => setVersion('Web'));

    const removeProgress = desktop?.onUpdateProgress?.((data) => {
      setDownloading(true);
      setProgress(data.progress);
    });

    const removeReady = desktop?.onUpdateReady?.((data) => {
      setUpdateInfo((current) => ({ ...(current || {}), ...(data || {}) }));
      setDownloading(false);
      setProgress(100);
      setUpdateReady(true);
      setMessage('Update downloaded. Restart the application to install it.');
    });

    const removeUpdateError = desktop?.onUpdateDownloadError?.((data) => {
      setDownloading(false);
      setError(data?.message || 'Automatic update download failed.');
    });

    return () => {
      removeProgress?.();
      removeReady?.();
      removeUpdateError?.();
    };
  }, [desktop]);

  useEffect(() => {
    api
      .get('/profile/notification-preferences')
      .then((response) => {
        setPreferences({
          ...defaultPreferences,
          ...(response.data.data || {})
        });
      })
      .catch(() => {
        const saved = localStorage.getItem('srsb-settings');
        if (saved) {
          try {
            setPreferences({
              ...defaultPreferences,
              ...JSON.parse(saved)
            });
          } catch {
            setPreferences(defaultPreferences);
          }
        }
      });
  }, []);

  useEffect(() => {
    if (!settings) return;
    setCompanyForm({
      legalName: settings.legalName || '',
      displayName: settings.displayName || '',
      address: settings.address || '',
      phone: settings.phone || '',
      email: settings.email || '',
      gstNumber: settings.gstNumber || '',
      stateCode: settings.stateCode || '',
      bankAccountName: settings.bankAccountName || '',
      bankAccountNumber: settings.bankAccountNumber || '',
      bankIfsc: settings.bankIfsc || '',
      bankName: settings.bankName || '',
      bankBranch: settings.bankBranch || '',
      sacCode: settings.sacCode || '998591',
      authorisedSignatory: settings.authorisedSignatory || '',
      invoicePrefix: settings.invoicePrefix || ''
    });
    setLogoPreview(settings.logoDataUrl || '');
    setSignaturePreview(settings.signatureDataUrl || '');
  }, [settings]);

  async function savePreferences() {
    try {
      setSavingPreferences(true);
      setError('');
      const response = await api.put(
        '/profile/notification-preferences',
        preferences
      );
      setPreferences(response.data.data || preferences);
      localStorage.setItem(
        'srsb-settings',
        JSON.stringify(response.data.data || preferences)
      );
      setMessage(
        response.data.message ||
          'Notification preferences saved successfully.'
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Notification preferences could not be saved.'
      );
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
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setMessage('Password changed successfully.');
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Password could not be changed.'
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveCompany(event) {
    event.preventDefault();
    if (!canEditCompany) return;
    try {
      setSavingCompany(true);
      setError('');
      const payload = { ...companyForm };
      if (pendingLogo !== undefined) payload.logo = pendingLogo;
      if (pendingSignature !== undefined) {
        payload.signature = pendingSignature;
      }
      const response = await api.put('/company/settings', payload);
      setMessage(
        response.data.message || 'Company profile updated successfully.'
      );
      setPendingLogo(undefined);
      setPendingSignature(undefined);
      await refresh();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Company profile could not be saved.'
      );
    } finally {
      setSavingCompany(false);
    }
  }

  async function onLogoPick(event) {
    try {
      const payload = await fileToPayload(event.target.files?.[0]);
      setPendingLogo(payload || null);
      setLogoPreview(payload?.data || '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSignaturePick(event) {
    try {
      const payload = await fileToPayload(event.target.files?.[0]);
      setPendingSignature(payload || null);
      setSignaturePreview(payload?.data || '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function checkUpdates() {
    if (!desktop?.checkForUpdates) {
      setError(
        'Automatic updates are available only in the installed desktop application.'
      );
      return;
    }
    try {
      setCheckingUpdate(true);
      setError('');
      const result = await desktop.checkForUpdates({ refresh: true });
      setUpdateInfo(result);
      setUpdateReady(Boolean(result?.prepared));
      setMessage(
        result.updateAvailable
          ? `Version ${result.latestVersion} is available.`
          : result.success
            ? `Version ${result.currentVersion} is up to date.`
            : 'The update server could not be reached.'
      );
    } catch (requestError) {
      setError(requestError?.message || 'Unable to check for updates.');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function installUpdate() {
    try {
      setError('');

      if (updateReady && desktop?.installPreparedUpdate) {
        const result = await desktop.installPreparedUpdate();
        if (!result?.success) {
          setError(result?.message || 'The update could not be installed.');
        }
        return;
      }

      setDownloading(true);
      const result = await desktop.downloadUpdate();

      if (!result?.success) {
        setDownloading(false);
        setError(result?.message || 'The update could not be downloaded.');
        return;
      }

      if (result?.prepared) {
        setDownloading(false);
        setProgress(100);
        setUpdateReady(true);
      }
    } catch (requestError) {
      setError(
        requestError?.message || 'The update could not be downloaded.'
      );
      setDownloading(false);
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">System & Account</p>
          <h1 className="page-title">Settings & Updates</h1>
          <p className="page-subtitle">
            Manage company branding, account preferences, password and
            application version.
          </p>
        </div>
      </div>
      {error && <div className="message message-error">{error}</div>}
      {message && (
        <div className="message message-success">{message}</div>
      )}

      <div className="settings-grid">
        {canEditCompany && (
          <form
            className="card settings-card"
            onSubmit={saveCompany}
            style={{ gridColumn: '1 / -1' }}
          >
            <div className="settings-card-heading">
              <Building2 size={24} />
              <div>
                <h2>Company profile</h2>
                <p>
                  Logo, legal details and bank info used across login,
                  sidebar and invoices.
                </p>
              </div>
            </div>

            <div className="form-grid">
              <label className="form-group">
                <span>Legal name</span>
                <input
                  className="input"
                  value={companyForm.legalName}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      legalName: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label className="form-group">
                <span>Display name</span>
                <input
                  className="input"
                  value={companyForm.displayName}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      displayName: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label className="form-group" style={{ gridColumn: '1 / -1' }}>
                <span>Address</span>
                <textarea
                  className="input"
                  rows={3}
                  value={companyForm.address}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      address: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Phone</span>
                <input
                  className="input"
                  value={companyForm.phone}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      phone: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Invoice Email</span>
                <input
                  className="input"
                  type="email"
                  value={companyForm.email}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>GST number</span>
                <input
                  className="input"
                  value={companyForm.gstNumber}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      gstNumber: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>State code</span>
                <input
                  className="input"
                  value={companyForm.stateCode}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      stateCode: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Bank account name</span>
                <input
                  className="input"
                  value={companyForm.bankAccountName}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      bankAccountName: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Account number</span>
                <input
                  className="input"
                  value={companyForm.bankAccountNumber}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      bankAccountNumber: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>IFSC</span>
                <input
                  className="input"
                  value={companyForm.bankIfsc}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      bankIfsc: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Bank name</span>
                <input
                  className="input"
                  value={companyForm.bankName}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      bankName: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Branch</span>
                <input
                  className="input"
                  value={companyForm.bankBranch}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      bankBranch: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Invoice prefix</span>
                <input
                  className="input"
                  value={companyForm.invoicePrefix}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      invoicePrefix: event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>SAC code</span>
                <input
                  className="input"
                  value={companyForm.sacCode}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      sacCode: event.target.value
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span>Authorised signatory</span>
                <input
                  className="input"
                  value={companyForm.authorisedSignatory}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      authorisedSignatory: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            <div className="setup-upload-grid" style={{ marginTop: 16 }}>
              <label className="setup-upload">
                <span>
                  <ImagePlus size={16} /> Company logo
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onLogoPick}
                />
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" />
                ) : (
                  <div className="setup-upload-placeholder">No logo</div>
                )}
              </label>
              <label className="setup-upload">
                <span>Authorised signature</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onSignaturePick}
                />
                {signaturePreview ? (
                  <img src={signaturePreview} alt="Signature" />
                ) : (
                  <div className="setup-upload-placeholder">
                    No signature
                  </div>
                )}
              </label>
            </div>

            <button
              className="btn btn-primary"
              disabled={savingCompany}
              style={{ marginTop: 16 }}
            >
              <Save size={17} />{' '}
              {savingCompany ? 'Saving…' : 'Save company profile'}
            </button>
          </form>
        )}

        <div className="card settings-card">
          <div className="settings-card-heading">
            <UserCircle size={24} />
            <div>
              <h2>Account Information</h2>
              <p>Your current login and employment details.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="form-group">
              <span>Employee Name</span>
              <input
                className="input"
                value={user?.full_name || user?.fullName || ''}
                disabled
              />
            </label>
            <label className="form-group">
              <span>Role</span>
              <input className="input" value={user?.role || ''} disabled />
            </label>
            <label className="form-group">
              <span>Company code</span>
              <input
                className="input"
                value={user?.companyCode || settings?.companyCode || ''}
                disabled
              />
            </label>
            <label className="form-group">
              <span>Official Email</span>
              <input
                className="input"
                value={user?.email || ''}
                disabled
              />
            </label>
          </div>
        </div>

        <div className="card settings-card">
          <div className="settings-card-heading">
            <Bell size={24} />
            <div>
              <h2>Notification Preferences</h2>
              <p>Choose which alerts you want to receive.</p>
            </div>
          </div>
          {[
            ['emailNotifications', 'Email Notifications'],
            ['leaveNotifications', 'Leave Request Updates'],
            ['taskNotifications', 'Task Updates'],
            [
              'candidateNotifications',
              'Candidate and Recruitment Updates'
            ]
          ].map(([key, label]) => (
            <label className="settings-toggle" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    [key]: event.target.checked
                  }))
                }
              />
            </label>
          ))}
          <button
            className="btn btn-primary"
            type="button"
            onClick={savePreferences}
            disabled={savingPreferences}
          >
            <Save size={17} />{' '}
            {savingPreferences ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>

        <form className="card settings-card" onSubmit={changePassword}>
          <div className="settings-card-heading">
            <LockKeyhole size={24} />
            <div>
              <h2>Change Password</h2>
              <p>Use a strong password with at least 8 characters.</p>
            </div>
          </div>
          <label className="form-group">
            <span>Current Password</span>
            <input
              className="input"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  currentPassword: event.target.value
                }))
              }
              required
            />
          </label>
          <label className="form-group">
            <span>New Password</span>
            <input
              className="input"
              type="password"
              minLength={8}
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  newPassword: event.target.value
                }))
              }
              required
            />
          </label>
          <label className="form-group">
            <span>Confirm New Password</span>
            <input
              className="input"
              type="password"
              minLength={8}
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value
                }))
              }
              required
            />
          </label>
          <button className="btn btn-primary" disabled={savingPassword}>
            <LockKeyhole size={17} />{' '}
            {savingPassword ? 'Changing…' : 'Change Password'}
          </button>
        </form>

        <div className="card settings-card update-settings-card">
          <div className="settings-card-heading">
            <DownloadCloud size={24} />
            <div>
              <h2>Application Updates</h2>
              <p>
                Future desktop versions can be downloaded and installed
                from here.
              </p>
            </div>
          </div>
          <div className="version-row">
            <span>Installed Version</span>
            <strong>{version}</strong>
          </div>
          {updateInfo?.latestVersion && (
            <div className="version-row">
              <span>Latest Version</span>
              <strong>{updateInfo.latestVersion}</strong>
            </div>
          )}
          {updateInfo?.notes && (
            <div className="update-feature-list update-feature-list-card">
              <b>What's New</b>
              <ul>
                {String(updateInfo.notes)
                  .split(/\r?\n/)
                  .map((line) =>
                    line
                      .replace(/^#{1,6}\s*/, '')
                      .replace(/^[-*+]\s*/, '')
                      .replace(/^\d+[.)]\s*/, '')
                      .trim()
                  )
                  .filter(Boolean)
                  .slice(0, 8)
                  .map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </div>
          )}
          {downloading && (
            <div className="download-progress">
              <div style={{ width: `${progress || 5}%` }} />
              <span>
                {progress === null ? 'Downloading…' : `${progress}%`}
              </span>
            </div>
          )}
          <div className="form-actions settings-update-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={checkUpdates}
              disabled={checkingUpdate || downloading}
            >
              <RefreshCw
                className={checkingUpdate ? 'spin' : ''}
                size={17}
              />{' '}
              {checkingUpdate ? 'Checking…' : 'Check for Updates'}
            </button>
            {updateInfo?.updateAvailable && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={installUpdate}
                disabled={downloading && !updateReady}
              >
                <DownloadCloud size={17} />{' '}
                {updateReady
                  ? 'Restart & Install'
                  : downloading
                    ? 'Downloading…'
                    : 'Download & Install'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
