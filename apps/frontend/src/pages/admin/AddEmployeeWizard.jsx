import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, KeyRound, MailCheck, X } from 'lucide-react';
import api from '../../services/api.js';
import { REQUIREMENT_LABELS, onboardingResultTone } from '../onboarding/onboardingUi.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MODES = {
  ONBOARDING: {
    label: 'Onboard new joiner',
    icon: MailCheck,
    description:
      'Same flow as a Recruitment candidate marked Joined: an inactive employee account, the onboarding document checklist and an emailed activation link. The account becomes active once HR verifies the required documents.',
    steps: ['Basic details', 'Employment', 'Onboarding & documents', 'Review & create']
  },
  DIRECT: {
    label: 'Create active account now',
    icon: KeyRound,
    description:
      'For existing staff who are already onboarded: the account is active immediately and signs in with a temporary password. No onboarding checklist is created.',
    steps: ['Basic details', 'Employment', 'Account access', 'Review & create']
  }
};

const EMPTY_FORM = {
  employeeId: '',
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  role: 'EMPLOYEE',
  designation: '',
  departmentId: '',
  companyId: '',
  joiningDate: '',
  password: 'Employee@123'
};

function requirementBadgeClass(requirement) {
  if (requirement === 'REQUIRED') return 'badge-pending';
  return 'badge-muted';
}

export default function AddEmployeeWizard({
  companies,
  roleOptions,
  departments = [],
  onboardingOnly = false,
  onCancel,
  onCreated
}) {
  const [mode, setMode] = useState('ONBOARDING');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    companyId: companies[0]?.id ? String(companies[0].id) : ''
  }));
  const [checklist, setChecklist] = useState([]);
  const [checklistError, setChecklistError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/onboarding/checklist-template')
      .then((res) => setChecklist(res.data.data || []))
      .catch(() =>
        setChecklistError(
          'The checklist preview could not be loaded. The checklist is still created with the employee.'
        )
      );
  }, []);

  const isOnboarding = mode === 'ONBOARDING';
  const steps = MODES[mode].steps;
  const lastStep = steps.length - 1;
  const companyName =
    companies.find((company) => String(company.id) === String(form.companyId))?.name || '';
  const roleLabel = roleOptions.find((option) => option.value === form.role)?.label || form.role;
  const departmentLabel =
    departments.find((department) => String(department.id) === String(form.departmentId))?.name ||
    form.departmentId;

  function update(key) {
    return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  function stepProblem(index) {
    const email = form.email.trim();
    if (index === 0) {
      if (!isOnboarding && !form.employeeId.trim()) return 'Enter the Employee ID.';
      if (form.fullName.trim().length < 2) return 'Enter the full name (at least 2 characters).';
      if (isOnboarding && !email) {
        return 'Enter the official email. The activation link is sent to this address.';
      }
      if (email && !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
    }
    if (index === 2 && !isOnboarding && form.password.length < 8) {
      return 'The temporary password must be at least 8 characters.';
    }
    return '';
  }

  function goTo(target) {
    for (let index = 0; index < target; index += 1) {
      const problem = stepProblem(index);
      if (problem) {
        setError(problem);
        setStep(index);
        return;
      }
    }
    setError('');
    setStep(target);
  }

  function switchMode(next) {
    setMode(next);
    setStep(0);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (step < lastStep) {
      goTo(step + 1);
      return;
    }
    for (let index = 0; index < lastStep; index += 1) {
      const problem = stepProblem(index);
      if (problem) {
        setError(problem);
        setStep(index);
        return;
      }
    }

    setSaving(true);
    setError('');
    const common = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      dateOfBirth: form.dateOfBirth || null,
      role: form.role,
      designation: form.designation.trim(),
      departmentId: form.departmentId || null,
      companyId: form.companyId || null
    };

    try {
      const response = isOnboarding
        ? await api.post('/employees', {
            ...common,
            onboarding: true,
            employeeId: form.employeeId.trim() || null,
            joiningDate: form.joiningDate || null
          })
        : await api.post('/employees', {
            ...common,
            employeeId: form.employeeId.trim(),
            password: form.password
          });
      const onboarding = response.data.data?.onboarding;
      onCreated({
        message: response.data.message,
        tone: onboardingResultTone(onboarding),
        caseId: onboarding?.caseId || null
      });
    } catch (err) {
      setError(
        err.response?.data?.details?.[0]?.msg && err.response?.status === 422
          ? `${err.response.data.message} (${err.response.data.details
              .map((d) => d.path)
              .join(', ')})`
          : err.response?.data?.message || 'Employee could not be created.'
      );
    } finally {
      setSaving(false);
    }
  }

  const reviewRows = [
    ['Flow', MODES[mode].label],
    ['Employee ID', form.employeeId.trim() || (isOnboarding ? 'Auto-generated (SRSB###)' : '—')],
    ['Full name', form.fullName.trim() || '—'],
    ['Official email', form.email.trim() || '—'],
    ['Phone', form.phone.trim() || '—'],
    ['Date of birth', form.dateOfBirth || '—'],
    ['Role', roleLabel],
    ['Designation', form.designation.trim() || (isOnboarding ? 'New Joiner' : '—')],
    ['Department', departmentLabel || '—'],
    ['Company', companyName || 'Your default company'],
    ...(isOnboarding
      ? [
          ['Joining date', form.joiningDate || 'Today'],
          [
            'Documents',
            checklist.length
              ? `${checklist.filter((item) => item.requirement === 'REQUIRED').length} required, ${
                  checklist.filter((item) => item.requirement === 'OPTIONAL').length
                } optional`
              : 'Standard onboarding checklist'
          ],
          ['Sign-in', 'Activation link emailed; the employee sets their own password']
        ]
      : [['Sign-in', 'Temporary password (must be changed at first login)']])
  ];

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 20 }} noValidate>
      <div className="section-heading">
        <h2>New Employee</h2>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} />
          Close
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(MODES)
          .filter(([value]) => !onboardingOnly || value === 'ONBOARDING')
          .map(([value, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={value}
              type="button"
              className={`btn ${mode === value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchMode(value)}
              aria-pressed={mode === value}
            >
              <Icon size={16} />
              {meta.label}
            </button>
          );
        })}
      </div>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        {MODES[mode].description}
      </p>

      <ol
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          listStyle: 'none',
          padding: 0,
          margin: '0 0 18px'
        }}
      >
        {steps.map((label, index) => {
          const state = index === step ? 'current' : index < step ? 'done' : 'todo';
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => goTo(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontWeight: state === 'current' ? 700 : 500,
                  background:
                    state === 'current'
                      ? 'var(--primary)'
                      : state === 'done'
                        ? 'var(--primary-soft)'
                        : 'var(--surface-soft)',
                  color: state === 'current' ? 'white' : state === 'done' ? 'var(--primary)' : 'var(--text-muted)'
                }}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="message message-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 0 && (
        <div className="form-grid">
          <div className="form-group">
            <label>Employee ID{isOnboarding ? ' (optional)' : ''}</label>
            <input
              className="input"
              value={form.employeeId}
              onChange={update('employeeId')}
              placeholder={isOnboarding ? 'Leave blank to auto-generate (SRSB###)' : ''}
            />
          </div>
          <div className="form-group">
            <label>Full Name</label>
            <input className="input" value={form.fullName} onChange={update('fullName')} />
          </div>
          <div className="form-group">
            <label>Official Email{isOnboarding ? '' : ' (optional)'}</label>
            <input className="input" type="email" value={form.email} onChange={update('email')} />
            {isOnboarding && (
              <small style={{ color: 'var(--text-muted)' }}>
                The activation link is sent to this address.
              </small>
            )}
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input className="input" value={form.phone} onChange={update('phone')} />
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input
              className="input"
              type="date"
              value={form.dateOfBirth}
              onChange={update('dateOfBirth')}
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="form-grid">
          <div className="form-group">
            <label>Role</label>
            <select className="input" value={form.role} onChange={update('role')}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input
              className="input"
              value={form.designation}
              onChange={update('designation')}
              placeholder={isOnboarding ? 'New Joiner' : ''}
            />
          </div>
          <div className="form-group">
            <label>Department</label>
            {departments.length ? (
              <select className="input" value={form.departmentId} onChange={update('departmentId')}>
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                type="number"
                value={form.departmentId}
                onChange={update('departmentId')}
                placeholder="Enter department ID"
              />
            )}
          </div>
          <div className="form-group">
            <label>Company</label>
            <select className="input" value={form.companyId} onChange={update('companyId')}>
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          {isOnboarding && (
            <div className="form-group">
              <label>Joining Date</label>
              <input
                className="input"
                type="date"
                value={form.joiningDate}
                onChange={update('joiningDate')}
              />
            </div>
          )}
        </div>
      )}

      {step === 2 && isOnboarding && (
        <div>
          <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              An <strong>inactive</strong> employee account is created with login pending activation.
            </li>
            <li>
              An activation link is emailed to{' '}
              <strong>{form.email.trim() || 'the official email'}</strong>. The employee opens it,
              sets their own password and signs in to <strong>My Onboarding</strong>.
            </li>
            <li>The employee uploads each document below.</li>
            <li>
              HR reviews and verifies the documents in the <strong>Onboarding</strong> queue, then
              activates the employee.
            </li>
          </ol>
          {checklistError && (
            <div className="message message-warning" style={{ marginBottom: 12 }}>
              {checklistError}
            </div>
          )}
          {checklist.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Document</th>
                    <th>Requirement</th>
                  </tr>
                </thead>
                <tbody>
                  {checklist.map((item) => (
                    <tr key={item.document_type}>
                      <td>{item.sort_order}</td>
                      <td>{item.label}</td>
                      <td>
                        <span className={`badge ${requirementBadgeClass(item.requirement)}`}>
                          {REQUIREMENT_LABELS[item.requirement] || item.requirement}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {step === 2 && !isOnboarding && (
        <div className="form-grid">
          <div className="form-group">
            <label>Temporary Password</label>
            <input
              className="input"
              value={form.password}
              onChange={update('password')}
              minLength="8"
            />
            <small style={{ color: 'var(--text-muted)' }}>
              Share this with the employee. They are asked to change it at first login.
            </small>
          </div>
        </div>
      )}

      {step === lastStep && (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(140px, max-content) 1fr',
            gap: '8px 18px',
            margin: 0
          }}
        >
          {reviewRows.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</dt>
              <dd style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        {step > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => goTo(step - 1)}
            disabled={saving}
          >
            <ChevronLeft size={16} />
            Back
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {step < lastStep ? (
            <>
              Next
              <ChevronRight size={16} />
            </>
          ) : saving ? (
            'Creating...'
          ) : isOnboarding ? (
            'Create employee & send activation link'
          ) : (
            'Create employee'
          )}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
