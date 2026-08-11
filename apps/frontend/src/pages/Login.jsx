import {
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  MailCheck,
  ShieldCheck
} from 'lucide-react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams
} from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import api from '../services/api.js';
import {
  getLastSavedCompanyCode,
  getSavedLogin,
  saveLoginCredentials
} from '../utils/savedLogin.js';

const managementRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER'
];

const DEFAULT_COMPANY_CODE = 'SRSB';

function readInitialCompanyCode(searchParams) {
  const fromQuery =
    searchParams.get('companyCode') ||
    searchParams.get('code') ||
    '';
  if (fromQuery.trim()) {
    return fromQuery.trim().toUpperCase();
  }
  const saved = getLastSavedCompanyCode();
  if (saved) return saved.toUpperCase();
  const stored = localStorage.getItem('srsb_company_code');
  if (stored) return stored.toUpperCase();
  // Existing SRSB workspace — company code is always SRSB.
  return DEFAULT_COMPANY_CODE;
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const initialCompanyCode = readInitialCompanyCode(searchParams);
  const initialSaved = getSavedLogin(initialCompanyCode);

  const [mode, setMode] = useState('login');
  const [companyCode, setCompanyCode] = useState(initialCompanyCode);
  const [loginId, setLoginId] = useState(
    () => initialSaved?.loginId || ''
  );
  const [password, setPassword] = useState(
    () => initialSaved?.password || ''
  );
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [branding, setBranding] = useState({
    displayName: 'Work Management',
    logoDataUrl: null
  });

  useEffect(() => {
    if (location.state?.setupMessage) {
      setMessage(location.state.setupMessage);
    }
  }, [location.state]);

  // When company code changes, load that company's saved email/password.
  useEffect(() => {
    const code = companyCode.trim().toUpperCase();
    if (!code) return;
    const saved = getSavedLogin(code);
    if (!saved || saved.companyCode !== code) return;
    setLoginId(saved.loginId || '');
    setPassword(saved.password || '');
    setRememberMe(true);
  }, [companyCode]);

  useEffect(() => {
    const code = companyCode.trim();
    if (!code) {
      setBranding({
        displayName: 'Work Management',
        logoDataUrl: null
      });
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([
        api.get('/company/branding', {
          params: { companyCode: code }
        }),
        api.get('/onboarding/status', {
          params: { companyCode: code }
        })
      ])
        .then(([brandingResponse, statusResponse]) => {
          if (cancelled) return;
          const data = brandingResponse.data.data || {};
          setBranding({
            displayName: data.displayName || 'Work Management',
            logoDataUrl: data.logoDataUrl || null
          });

          const status = statusResponse.data.data || {};
          if (status.message && status.canLogin === false) {
            setError(status.message);
          } else if (
            status.message &&
            status.requiresSetup &&
            !location.state?.setupMessage
          ) {
            setError('');
            setMessage(status.message);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBranding({
              displayName: 'Work Management',
              logoDataUrl: null
            });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyCode, location.state?.setupMessage]);

  const sessionMessage = useMemo(() => {
    const value = sessionStorage.getItem('srsb_session_message');
    if (value) {
      sessionStorage.removeItem('srsb_session_message');
    }
    return value || '';
  }, []);

  const clearFeedback = () => {
    setError('');
    setMessage('');
  };

  const goLogin = () => {
    clearFeedback();
    setMode('login');
    const saved = getSavedLogin(companyCode);
    setLoginId(saved?.loginId || '');
    setPassword(saved?.password || '');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
  };

  async function performLogin(nextLoginId, nextPassword, nextCompanyCode) {
    const user = await login(
      nextLoginId.trim(),
      nextPassword,
      nextCompanyCode.trim()
    );

    saveLoginCredentials({
      companyCode: nextCompanyCode.trim(),
      loginId: nextLoginId.trim(),
      password: nextPassword,
      remember: rememberMe
    });

    navigate(
      managementRoles.includes(user.role)
        ? '/admin'
        : '/employee',
      { replace: true }
    );
    return user;
  }

  async function submitLogin(event) {
    event.preventDefault();
    clearFeedback();

    try {
      setLoading(true);
      await performLogin(loginId, password, companyCode);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to sign in. Check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function requestRecovery(event) {
    event.preventDefault();
    clearFeedback();

    try {
      setLoading(true);

      const response = await api.post(
        '/auth/forgot-password',
        {
          identifier: loginId.trim(),
          companyCode: companyCode.trim().toUpperCase()
        }
      );

      if (response.data.recoveryType === 'OTP') {
        setLoginId(
          response.data.identifier || loginId.trim()
        );
        setMode('otp');
      }

      setMessage(response.data.message);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Recovery request could not be completed.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    clearFeedback();

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      const response = await api.post(
        '/auth/reset-privileged-password',
        {
          identifier: loginId.trim(),
          otp: otp.trim(),
          newPassword,
          companyCode: companyCode.trim().toUpperCase()
        }
      );

      goLogin();
      setMessage(response.data.message);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'OTP verification failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <BrandLogo name="SRSB Work Management" />

        <div style={{ marginTop: 30 }}>
          <span className="badge badge-active">
            Private Company Workspace
          </span>

          <h1 style={{ marginTop: 16 }}>
            SRSB Work Management
          </h1>

          <p>
            Sign in with your company code to access
            employees, attendance, recruitment, clients,
            tasks and reports.
          </p>

          <div className="login-feature-list">
            <div>
              <ShieldCheck size={18} />
              Role-based access control
            </div>

            <div>
              <MailCheck size={18} />
              Isolated company workspace
            </div>

            <div>
              <KeyRound size={18} />
              Secure password recovery
            </div>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        {mode === 'login' && (
          <form
            className="login-card"
            onSubmit={submitLogin}
          >
            <h2>Welcome back</h2>

            <p>
              Enter your company code, then sign in with
              your email or Employee ID.
            </p>

            {(error || sessionMessage) && (
              <div className="message message-error">
                {error || sessionMessage}
              </div>
            )}

            {message && (
              <div className="message message-success">
                {message}
              </div>
            )}

            <div className="form-group">
              <label>Company code</label>
              <input
                className="input"
                value={companyCode}
                onChange={(event) =>
                  setCompanyCode(
                    event.target.value.toUpperCase()
                  )
                }
                placeholder="SRSB"
                autoComplete="organization"
                required
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                SRSB users: use company code <strong>SRSB</strong>. Other
                companies use the code created during setup.
              </small>
            </div>

            {!companyCode.trim() && (
              <div className="message">
                Enter your company code, or{' '}
                <Link to="/setup">complete first-time setup</Link>.
              </div>
            )}

            <div className="form-group">
              <label>
                Official email or Employee ID
              </label>

              <input
                className="input"
                value={loginId}
                onChange={(event) =>
                  setLoginId(event.target.value)
                }
                placeholder="Email or Employee ID"
                autoComplete="username"
                required
              />
            </div>

            <div
              className="form-group"
              style={{ marginTop: 16 }}
            >
              <label>Password</label>

              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={
                    showPassword ? 'text' : 'password'
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter password"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                  required
                />

                <button
                  type="button"
                  className="password-eye"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    clearFeedback();
                    setMode('forgot');
                    setPassword('');
                    setLoginId('');
                  }}
                >
                  Forgot password?
                </button>

                <label
                  className="settings-toggle"
                  style={{ marginTop: 12 }}
                >
                  <span>Remember company, email and password on this device (fill only — click Sign in to log in)</span>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(event.target.checked)
                    }
                  />
                </label>

                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    marginTop: 20
                  }}
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign in securely'}
                </button>

            <p
              style={{
                marginTop: 18,
                fontSize: 13,
                textAlign: 'center'
              }}
            >
              New company?{' '}
              <Link to="/setup">Complete setup</Link>
            </p>
          </form>
        )}

        {mode === 'forgot' && (
          <form
            className="login-card"
            onSubmit={requestRecovery}
          >
            <h2>Password recovery</h2>

            <p>
              Enter your company code and account
              identifier. Platform Super Admin OTP recovery
              uses the authorised email on the default
              company.
            </p>

            {error && (
              <div className="message message-error">
                {error}
              </div>
            )}

            {message && (
              <div className="message message-success">
                {message}
              </div>
            )}

            <div className="form-group">
              <label>Company code</label>
              <input
                className="input"
                value={companyCode}
                onChange={(event) =>
                  setCompanyCode(
                    event.target.value.toUpperCase()
                  )
                }
                placeholder="e.g. SRSB"
                required
              />
            </div>

            <div className="form-group">
              <label>
                Super Admin email or Employee ID
              </label>

              <input
                className="input"
                value={loginId}
                onChange={(event) =>
                  setLoginId(event.target.value)
                }
                placeholder="Enter email or Employee ID"
                required
              />
            </div>

            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                marginTop: 20
              }}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Continue'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{
                width: '100%',
                marginTop: 10
              }}
              onClick={goLogin}
            >
              Back to login
            </button>
          </form>
        )}

        {mode === 'otp' && (
          <form
            className="login-card"
            onSubmit={verifyOtp}
          >
            <h2>Verify Super Admin OTP</h2>

            <p>
              Enter the 6-digit OTP received at the
              authorised Super Admin email and create a
              new password.
            </p>

            {error && (
              <div className="message message-error">
                {error}
              </div>
            )}

            {message && (
              <div className="message message-success">
                {message}
              </div>
            )}

            <div className="form-group">
              <label>Super Admin email</label>

              <input
                className="input"
                value={loginId}
                readOnly
              />
            </div>

            <div
              className="form-group"
              style={{ marginTop: 14 }}
            >
              <label>6-digit OTP</label>

              <input
                className="input otp-input"
                value={otp}
                onChange={(event) =>
                  setOtp(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )
                }
                inputMode="numeric"
                maxLength={6}
                required
              />
            </div>

            <div
              className="form-group"
              style={{ marginTop: 14 }}
            >
              <label>New password</label>

              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                minLength={8}
                required
              />
            </div>

            <div
              className="form-group"
              style={{ marginTop: 14 }}
            >
              <label>Confirm password</label>

              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                minLength={8}
                required
              />
            </div>

            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                marginTop: 20
              }}
              disabled={loading}
            >
              {loading ? 'Resetting...' : 'Reset password'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{
                width: '100%',
                marginTop: 10
              }}
              onClick={() => {
                clearFeedback();
                setMode('forgot');
                setOtp('');
              }}
            >
              Request another OTP
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
