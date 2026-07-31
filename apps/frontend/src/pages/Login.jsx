import { useState } from 'react';
import { Eye, EyeOff, KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import api from '../services/api.js';

const managementRoles = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];

export default function Login() {
  const [mode, setMode] = useState('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const clearFeedback = () => { setError(''); setMessage(''); };
  const goLogin = () => {
    clearFeedback(); setMode('login'); setLoginId(''); setPassword('');
    setOtp(''); setNewPassword(''); setConfirmPassword('');
  };

  async function submitLogin(event) {
    event.preventDefault(); clearFeedback();
    try {
      setLoading(true);
      const user = await login(loginId.trim(), password);
      navigate(managementRoles.includes(user.role) ? '/admin' : '/employee', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to sign in. Check your credentials.');
    } finally { setLoading(false); }
  }

  async function requestRecovery(event) {
    event.preventDefault(); clearFeedback();
    try {
      setLoading(true);
      const response = await api.post('/auth/forgot-password', { identifier: loginId.trim() });
      if (response.data.recoveryType === 'OTP') {
        setMode('otp');
        setMessage(response.data.message);
      } else {
        setMessage(response.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Recovery request could not be completed.');
    } finally { setLoading(false); }
  }

  async function verifyOtp(event) {
    event.preventDefault(); clearFeedback();
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    try {
      setLoading(true);
      const response = await api.post('/auth/reset-privileged-password', {
        identifier: loginId.trim(), otp: otp.trim(), newPassword
      });
      goLogin();
      setMessage(response.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <BrandLogo />
        <div style={{ marginTop: 30 }}>
          <span className="badge badge-active">Private Company Workspace</span>
          <h1 style={{ marginTop: 16 }}>SRSB Work Management</h1>
          <p>One secure workspace for employees, attendance, recruitment, clients, tasks and reports.</p>
          <div className="login-feature-list">
            <div><ShieldCheck size={18}/> Role-based access control</div>
            <div><MailCheck size={18}/> Protected Admin recovery</div>
            <div><KeyRound size={18}/> Secure password hashing</div>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        {mode === 'login' && (
          <form className="login-card" onSubmit={submitLogin}>
            <h2>Welcome back</h2>
            <p>Use your Employee ID, username or official email.</p>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
            <div className="form-group"><label>Login ID</label><input className="input" value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="Employee ID, username or email" autoComplete="username" required /></div>
            <div className="form-group" style={{ marginTop:16 }}><label>Password</label><div style={{position:'relative'}}><input className="input" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password" style={{paddingRight:44}} required /><button type="button" className="password-eye" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></div>
            <button type="button" className="text-button" onClick={()=>{clearFeedback();setMode('forgot');setPassword('');setLoginId('');}}>Forgot password?</button>
            <button className="btn btn-primary" style={{width:'100%',marginTop:20}} disabled={loading}>{loading?'Signing in...':'Sign in securely'}</button>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="login-card" onSubmit={requestRecovery}>
            <h2>Password recovery</h2>
            <p>Employees send a request to Admin. Admin and Super Admin receive an OTP at their registered recovery email.</p>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
            <div className="form-group"><label>Employee ID, username or email</label><input className="input" value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="Enter your account identifier" required /></div>
            <button className="btn btn-primary" style={{width:'100%',marginTop:20}} disabled={loading}>{loading?'Processing...':'Continue'}</button>
            <button type="button" className="btn btn-secondary" style={{width:'100%',marginTop:10}} onClick={goLogin}>Back to login</button>
          </form>
        )}

        {mode === 'otp' && (
          <form className="login-card" onSubmit={verifyOtp}>
            <h2>Verify recovery OTP</h2>
            <p>Enter the 6-digit OTP and create your new password.</p>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
            <div className="form-group"><label>Account</label><input className="input" value={loginId} readOnly /></div>
            <div className="form-group" style={{marginTop:14}}><label>6-digit OTP</label><input className="input otp-input" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} required /></div>
            <div className="form-group" style={{marginTop:14}}><label>New password</label><input className="input" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} required /></div>
            <div className="form-group" style={{marginTop:14}}><label>Confirm password</label><input className="input" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} required /></div>
            <button className="btn btn-primary" style={{width:'100%',marginTop:20}} disabled={loading}>{loading?'Resetting...':'Reset password'}</button>
            <button type="button" className="btn btn-secondary" style={{width:'100%',marginTop:10}} onClick={()=>{clearFeedback();setMode('forgot');setOtp('');}}>Request another OTP</button>
          </form>
        )}
      </section>
    </div>
  );
}
