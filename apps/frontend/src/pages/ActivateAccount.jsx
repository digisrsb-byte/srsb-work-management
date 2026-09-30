import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

function passwordChecks(password, employeeCode) {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'An uppercase and a lowercase letter', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'At least one number', ok: /\d/.test(password) },
    {
      label: 'Does not contain your Employee ID',
      ok: Boolean(password) && !(employeeCode && password.toLowerCase().includes(employeeCode.toLowerCase()))
    }
  ];
}

function formatExpiry(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
}

function PasswordInput({ value, onChange, show, onToggle, placeholder, autoComplete }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={128}
        style={{ paddingRight: 44 }}
        required
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          padding: 4,
          color: 'var(--text-muted)',
          display: 'flex'
        }}
      >
        {show ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}

export default function ActivateAccount() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get('token') || '');
  const [companyCode, setCompanyCode] = useState(() => searchParams.get('company') || '');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState('checking');
  const [linkError, setLinkError] = useState('');
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    const fromUrl = searchParams.get('token');
    if (!fromUrl) return;
    // Another link opened in the same tab replaces the current one.
    setToken(fromUrl);
    setCompanyCode(searchParams.get('company') || '');
    // Keep the single-use token out of the address bar and browser history once it is read.
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setInvite(null);
    setDone(null);
    setError('');
    setPassword('');
    setConfirmPassword('');
    if (!token) {
      setStatus('invalid');
      setLinkError('This activation link is incomplete. Open the full link from your invitation email.');
      return undefined;
    }
    setStatus('checking');
    setLinkError('');
    let cancelled = false;
    api
      .post('/auth/invitations/verify', { token, companyCode })
      .then((response) => {
        if (cancelled) return;
        setInvite(response.data.data);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        const code = err.response?.status;
        setStatus(code === 410 ? 'expired' : 'invalid');
        setLinkError(
          err.response?.data?.message ||
            (code
              ? 'This activation link could not be verified.'
              : 'Unable to reach the HRMS server. Check your connection and reload this page.')
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token, companyCode]);

  const checks = passwordChecks(password, invite?.employeeCode);

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (checks.some((check) => !check.ok)) {
      setError('Your password does not meet all the requirements below.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }

    try {
      setSaving(true);
      const response = await api.post('/auth/invitations/accept', {
        token,
        companyCode,
        password
      });
      setPassword('');
      setConfirmPassword('');
      setDone({ message: response.data.message, employeeCode: response.data.data.employeeCode });
    } catch (err) {
      const code = err.response?.status;
      const message = err.response?.data?.message || 'Your password could not be saved. Please try again.';
      if (code === 404 || code === 410) {
        setStatus(code === 410 ? 'expired' : 'invalid');
        setLinkError(message);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <BrandLogo />
        <div style={{ marginTop: 28 }}>
          <h1>SRSB Business Suite</h1>
          <p>Activate your employee account to access onboarding and the Employee Portal.</p>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          {done ? (
            <>
              <h2>Account activated</h2>
              <div className="message message-success" style={{ marginBottom: 16 }}>
                {done.message}
              </div>
              {user ? (
                <p>
                  This browser is signed in as {user.full_name || user.employee_id}. Continuing will sign that account
                  out so you can sign in with Employee ID <strong>{done.employeeCode}</strong>.
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 12 }}
                onClick={() => {
                  if (user) {
                    logout();
                    sessionStorage.removeItem('srsb_employee_portal_return');
                  }
                  navigate('/login', { replace: true, state: { loginId: done.employeeCode } });
                }}
              >
                Go to sign in
              </button>
            </>
          ) : status === 'checking' ? (
            <>
              <h2>Activate your account</h2>
              <p>Checking your activation link...</p>
            </>
          ) : status === 'expired' || status === 'invalid' ? (
            <>
              <h2>{status === 'expired' ? 'Link no longer valid' : 'Invalid activation link'}</h2>
              <div className="message message-error" style={{ marginBottom: 16 }}>
                {linkError}
              </div>
              <p>
                Activation links work once and expire for your security. Contact your HR team and ask them to resend
                your invitation; the new email will contain a fresh link.
              </p>
              <Link to="/login" className="btn btn-secondary" style={{ width: '100%', marginTop: 12 }}>
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={submit}>
              <h2>Create your password</h2>
              <p>
                Welcome, {invite.fullName}. Your email {invite.maskedEmail} is verified by opening this link. Choose a
                password to activate your account.
              </p>

              <div className="info-grid" style={{ marginBottom: 16 }}>
                <div>
                  <div className="label">Employee ID (your sign-in ID)</div>
                  <div className="value" style={{ fontSize: 18 }}>{invite.employeeCode}</div>
                </div>
                <div>
                  <div className="label">Link expires</div>
                  <div className="value">{formatExpiry(invite.expiresAt)} IST</div>
                </div>
              </div>

              {error ? (
                <div className="message message-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              ) : null}

              <div className="form-group">
                <label>New password</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 4 }}>
                {checks.map((check) => (
                  <li
                    key={check.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: check.ok ? 'var(--success, #15803d)' : 'var(--text-muted)'
                    }}
                  >
                    {check.ok ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    {check.label}
                  </li>
                ))}
              </ul>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Confirm password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showConfirm}
                  onToggle={() => setShowConfirm((current) => !current)}
                  placeholder="Re-enter the password"
                  autoComplete="new-password"
                />
              </div>

              <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} disabled={saving}>
                {saving ? 'Activating...' : 'Activate account'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
