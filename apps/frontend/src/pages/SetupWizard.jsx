import { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  KeyRound,
  ShieldCheck,
  UserPlus
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import BrandLogo from '../components/BrandLogo.jsx';

const PRODUCT_NAME = 'SRSB Work Management';

const STEPS = [
  { id: 'activation', title: 'Activation', icon: KeyRound },
  { id: 'profile', title: 'Company', icon: Building2 },
  { id: 'bank', title: 'Bank', icon: CreditCard },
  { id: 'admin', title: 'Admin', icon: UserPlus }
];

const emptyForm = {
  activationCode: '',
  companyCode: '',
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
  authorisedSignatory: 'Authorised Signatory',
  sacCode: '998591',
  adminFullName: '',
  adminEmail: '',
  adminUsername: '',
  adminPassword: '',
  adminConfirmPassword: ''
};

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activationOk, setActivationOk] = useState(false);

  const progress = useMemo(
    () => ((step + 1) / STEPS.length) * 100,
    [step]
  );

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function validateActivation() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await api.post(
        '/onboarding/validate-activation',
        { activationCode: form.activationCode.trim() }
      );
      setActivationOk(true);
      setMessage(
        response.data.data?.note
          ? `Code accepted (${response.data.data.note}).`
          : 'Activation code accepted.'
      );
      setStep(1);
    } catch (err) {
      setActivationOk(false);
      setError(
        err.response?.data?.message ||
          'Activation code could not be validated.'
      );
    } finally {
      setLoading(false);
    }
  }

  function validateProfileStep() {
    if (!form.companyCode.trim() || form.companyCode.trim().length < 3) {
      setError('Company code must be at least 3 characters.');
      return false;
    }
    if (!form.legalName.trim()) {
      setError('Legal name is required.');
      return false;
    }
    return true;
  }

  function validateAdminStep() {
    if (!form.adminFullName.trim()) {
      setError('Admin full name is required.');
      return false;
    }
    if (!form.adminEmail.trim()) {
      setError('Admin email is required.');
      return false;
    }
    if (form.adminPassword.length < 8) {
      setError('Admin password must contain at least 8 characters.');
      return false;
    }
    if (form.adminPassword !== form.adminConfirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    return true;
  }

  async function goNext() {
    setError('');
    setMessage('');

    if (step === 0) {
      await validateActivation();
      return;
    }
    if (step === 1 && !validateProfileStep()) return;
    if (step === 3) {
      if (!validateAdminStep()) return;
      await submitRegistration();
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setError('');
    setMessage('');
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submitRegistration() {
    setLoading(true);
    setError('');
    try {
      const legalName = form.legalName.trim();
      const response = await api.post('/onboarding/register-company', {
        activationCode: form.activationCode.trim(),
        companyCode: form.companyCode.trim().toUpperCase(),
        legalName,
        // App chrome stays SRSB-branded; legal name is used for invoices/docs.
        displayName: form.displayName.trim() || legalName,
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        gstNumber: form.gstNumber.trim(),
        stateCode: form.stateCode.trim(),
        bankAccountName: form.bankAccountName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankIfsc: form.bankIfsc.trim(),
        bankName: form.bankName.trim(),
        bankBranch: form.bankBranch.trim(),
        authorisedSignatory: form.authorisedSignatory.trim(),
        sacCode: form.sacCode.trim() || '998591',
        admin: {
          fullName: form.adminFullName.trim(),
          email: form.adminEmail.trim(),
          username: form.adminUsername.trim() || undefined,
          password: form.adminPassword
        }
      });

      const companyCode = response.data.data.companyCode;
      localStorage.setItem('srsb_company_code', companyCode);
      navigate(
        `/login?companyCode=${encodeURIComponent(companyCode)}`,
        {
          replace: true,
          state: {
            setupMessage:
              'Company registered successfully. Sign in with your new admin account.'
          }
        }
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Company registration failed. Please review the details and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="setup-page">
      <section className="setup-side">
        <BrandLogo name={PRODUCT_NAME} />
        <h1>Company setup</h1>
        <p>
          Activate your workspace with an activation code, then enter your
          company legal details, bank info and first admin. The app stays
          branded as SRSB Work Management.
        </p>
        <ul className="setup-checklist">
          <li>
            <ShieldCheck size={18} /> Secure activation code
          </li>
          <li>
            <Building2 size={18} /> Company profile &amp; GST
          </li>
          <li>
            <CheckCircle2 size={18} /> Bank details &amp; admin account
          </li>
        </ul>
      </section>

      <section className="setup-main">
        <div className="setup-card">
          <div className="setup-progress">
            <div style={{ width: `${progress}%` }} />
          </div>

          <div className="setup-steps">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`setup-step ${
                    index === step
                      ? 'active'
                      : index < step
                        ? 'done'
                        : ''
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.title}</span>
                </div>
              );
            })}
          </div>

          <h2>{STEPS[step].title}</h2>

          {error && (
            <div className="message message-error">{error}</div>
          )}
          {message && (
            <div className="message message-success">{message}</div>
          )}

          {step === 0 && (
            <div className="setup-fields">
              <p>
                Enter the activation code issued by the platform
                administrator.
              </p>
              <label className="form-group">
                <span>Activation code</span>
                <input
                  className="input"
                  value={form.activationCode}
                  onChange={(event) => {
                    setActivationOk(false);
                    updateField(
                      'activationCode',
                      event.target.value.toUpperCase()
                    );
                  }}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  required
                />
              </label>
              {activationOk && (
                <div className="message message-success">
                  Code validated.
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="setup-fields">
              <p>
                These details are used for invoices and records. App logo and
                product name remain SRSB Work Management.
              </p>
              <div className="form-grid">
                <label className="form-group">
                  <span>Company code</span>
                  <input
                    className="input"
                    value={form.companyCode}
                    onChange={(event) =>
                      updateField(
                        'companyCode',
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                      )
                    }
                    placeholder="ACME"
                    maxLength={20}
                    required
                  />
                </label>
                <label className="form-group">
                  <span>Display name (optional)</span>
                  <input
                    className="input"
                    value={form.displayName}
                    onChange={(event) =>
                      updateField('displayName', event.target.value)
                    }
                    placeholder="Defaults to legal name"
                  />
                </label>
                <label className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <span>Legal name</span>
                  <input
                    className="input"
                    value={form.legalName}
                    onChange={(event) =>
                      updateField('legalName', event.target.value)
                    }
                    placeholder="Acme Staffing Private Limited"
                    required
                  />
                </label>
                <label className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <span>Registered address</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.address}
                    onChange={(event) =>
                      updateField('address', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Phone</span>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(event) =>
                      updateField('phone', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Email</span>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField('email', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>GST number</span>
                  <input
                    className="input"
                    value={form.gstNumber}
                    onChange={(event) =>
                      updateField('gstNumber', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>State code</span>
                  <input
                    className="input"
                    value={form.stateCode}
                    onChange={(event) =>
                      updateField('stateCode', event.target.value)
                    }
                    placeholder="29"
                    maxLength={8}
                  />
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-fields">
              <p>These details appear on recruitment invoices.</p>
              <div className="form-grid">
                <label className="form-group">
                  <span>Account name</span>
                  <input
                    className="input"
                    value={form.bankAccountName}
                    onChange={(event) =>
                      updateField('bankAccountName', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Account number</span>
                  <input
                    className="input"
                    value={form.bankAccountNumber}
                    onChange={(event) =>
                      updateField('bankAccountNumber', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>IFSC</span>
                  <input
                    className="input"
                    value={form.bankIfsc}
                    onChange={(event) =>
                      updateField('bankIfsc', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Bank name</span>
                  <input
                    className="input"
                    value={form.bankName}
                    onChange={(event) =>
                      updateField('bankName', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Branch</span>
                  <input
                    className="input"
                    value={form.bankBranch}
                    onChange={(event) =>
                      updateField('bankBranch', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Authorised signatory</span>
                  <input
                    className="input"
                    value={form.authorisedSignatory}
                    onChange={(event) =>
                      updateField(
                        'authorisedSignatory',
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-fields">
              <p>This account becomes the company administrator.</p>
              <div className="form-grid">
                <label className="form-group">
                  <span>Full name</span>
                  <input
                    className="input"
                    value={form.adminFullName}
                    onChange={(event) =>
                      updateField('adminFullName', event.target.value)
                    }
                    required
                  />
                </label>
                <label className="form-group">
                  <span>Email</span>
                  <input
                    className="input"
                    type="email"
                    value={form.adminEmail}
                    onChange={(event) =>
                      updateField('adminEmail', event.target.value)
                    }
                    required
                  />
                </label>
                <label className="form-group">
                  <span>Username (optional)</span>
                  <input
                    className="input"
                    value={form.adminUsername}
                    onChange={(event) =>
                      updateField('adminUsername', event.target.value)
                    }
                  />
                </label>
                <label className="form-group">
                  <span>Password</span>
                  <input
                    className="input"
                    type="password"
                    minLength={8}
                    value={form.adminPassword}
                    onChange={(event) =>
                      updateField('adminPassword', event.target.value)
                    }
                    required
                  />
                </label>
                <label className="form-group">
                  <span>Confirm password</span>
                  <input
                    className="input"
                    type="password"
                    minLength={8}
                    value={form.adminConfirmPassword}
                    onChange={(event) =>
                      updateField(
                        'adminConfirmPassword',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              </div>
            </div>
          )}

          <div className="setup-actions">
            {step > 0 ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={goBack}
                disabled={loading}
              >
                Back
              </button>
            ) : (
              <Link className="btn btn-secondary" to="/login">
                Already set up? Sign in
              </Link>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={goNext}
              disabled={loading}
            >
              {loading
                ? step === 3
                  ? 'Creating company…'
                  : 'Please wait…'
                : step === 3
                  ? 'Create company'
                  : step === 0
                    ? 'Validate & continue'
                    : 'Continue'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
