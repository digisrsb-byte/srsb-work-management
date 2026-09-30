import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const emptyShift = {
  id: null,
  name: 'General Shift',
  startTime: '09:30',
  endTime: '18:30',
  breakMinutes: 60,
  workingDays: 'MON,TUE,WED,THU,FRI',
  status: 'ACTIVE'
};

function withSeconds(time) {
  return time.length === 5 ? `${time}:00` : time;
}

export default function CompanyConfigPanel() {
  const { user } = useAuth();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(user?.role);
  const canEditConfig = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [profile, setProfile] = useState({
    name: '',
    code: '',
    address: '',
    official_email: '',
    contact_phone: '',
    website: '',
    status: 'ACTIVE'
  });
  const [shifts, setShifts] = useState([]);
  const [shiftForm, setShiftForm] = useState(emptyShift);
  const [configError, setConfigError] = useState('');
  const [configMessage, setConfigMessage] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get('/access/companies')
      .then((res) => {
        const list = res.data.data || [];
        setCompanies(list);
        if (list[0]) setSelectedCompanyId(String(list[0].id));
      })
      .catch((err) => {
        setConfigError(err.response?.data?.message || 'Unable to load companies for configuration.');
      });
  }, [isAdmin]);

  useEffect(() => {
    if (selectedCompanyId) loadCompanyConfig(selectedCompanyId);
  }, [selectedCompanyId]);

  async function loadCompanyConfig(companyId) {
    setConfigError('');
    try {
      const [p, s] = await Promise.all([
        api.get(`/company-config/${companyId}/profile`),
        api.get(`/company-config/${companyId}/shifts`)
      ]);
      setProfile({
        name: p.data.data.name || '',
        code: p.data.data.code || '',
        address: p.data.data.address || '',
        official_email: p.data.data.official_email || '',
        contact_phone: p.data.data.contact_phone || '',
        website: p.data.data.website || '',
        status: p.data.data.status || 'ACTIVE'
      });
      setShifts(s.data.data || []);
    } catch (err) {
      setConfigError(err.response?.data?.message || 'Unable to load company configuration.');
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!canEditConfig) return;
    setConfigError('');
    setConfigMessage('');
    try {
      await api.put(`/company-config/${selectedCompanyId}/profile`, {
        name: profile.name,
        address: profile.address,
        officialEmail: profile.official_email,
        contactPhone: profile.contact_phone,
        website: profile.website,
        status: profile.status
      });
      setConfigMessage('Company profile updated.');
      await loadCompanyConfig(selectedCompanyId);
    } catch (err) {
      setConfigError(err.response?.data?.message || 'Unable to update profile.');
    }
  }

  async function saveShift(event) {
    event.preventDefault();
    if (!canEditConfig) return;
    setConfigError('');
    setConfigMessage('');
    try {
      await api.post(`/company-config/${selectedCompanyId}/shifts`, {
        id: shiftForm.id,
        name: shiftForm.name,
        startTime: withSeconds(shiftForm.startTime),
        endTime: withSeconds(shiftForm.endTime),
        breakMinutes: Number(shiftForm.breakMinutes),
        workingDays: shiftForm.workingDays,
        status: shiftForm.status
      });
      setConfigMessage('Office shift saved.');
      setShiftForm(emptyShift);
      await loadCompanyConfig(selectedCompanyId);
    } catch (err) {
      setConfigError(err.response?.data?.message || 'Unable to save shift.');
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Building2 size={24} />
        <div>
          <h2 style={{ margin: 0 }}>Employer Configuration</h2>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Employer profile and office shifts used for attendance and payroll. Holidays are
            managed in Holiday Calendar; role permissions under Access &amp; Scope.
          </p>
        </div>
      </div>

      {configError ? <div className="message-error" style={{ marginBottom: 12 }}>{configError}</div> : null}
      {configMessage ? <div className="message-success" style={{ marginBottom: 12 }}>{configMessage}</div> : null}

      <div className="form-group" style={{ marginBottom: 16, maxWidth: 360 }}>
        <label>Employer</label>
        <select className="input" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
          <option value="">Select employer</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
          ))}
        </select>
      </div>

      {selectedCompanyId ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <form onSubmit={saveProfile}>
            <h3>Employer profile</h3>
            <div className="form-group">
              <label>Code</label>
              <input className="input" value={profile.code} disabled />
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Name</label>
              <input
                className="input"
                value={profile.name}
                disabled={!canEditConfig}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Registered address</label>
              <textarea
                className="input"
                value={profile.address}
                disabled={!canEditConfig}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Official email</label>
              <input
                className="input"
                type="email"
                value={profile.official_email}
                disabled={!canEditConfig}
                onChange={(e) => setProfile({ ...profile, official_email: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Contact number</label>
              <input
                className="input"
                value={profile.contact_phone}
                disabled={!canEditConfig}
                onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Website</label>
              <input
                className="input"
                value={profile.website}
                disabled={!canEditConfig}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
              />
            </div>
            {canEditConfig ? (
              <button className="btn btn-primary" style={{ marginTop: 12 }}>Save profile</button>
            ) : (
              <p className="page-subtitle">View only. Ask Admin / Super Admin to edit, or submit an Access Request.</p>
            )}
          </form>

          <div>
            <h3>Office shifts</h3>
            <ul style={{ paddingLeft: 18 }}>
              {shifts.length ? (
                shifts.map((s) => (
                  <li key={s.id} style={{ marginBottom: 8 }}>
                    <strong>{s.name}</strong> · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                    {' '}· break {s.break_minutes}m · {s.working_days} · {s.status}
                    {canEditConfig ? (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        style={{ marginLeft: 8 }}
                        onClick={() =>
                          setShiftForm({
                            id: s.id,
                            name: s.name,
                            startTime: String(s.start_time).slice(0, 5),
                            endTime: String(s.end_time).slice(0, 5),
                            breakMinutes: s.break_minutes,
                            workingDays: s.working_days,
                            status: s.status
                          })
                        }
                      >
                        Edit
                      </button>
                    ) : null}
                  </li>
                ))
              ) : (
                <li style={{ color: 'var(--text-muted)' }}>No shifts configured.</li>
              )}
            </ul>
            {canEditConfig ? (
              <form onSubmit={saveShift} className="grid" style={{ gap: 8 }}>
                <input
                  className="input"
                  placeholder="Shift name"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  required
                />
                <input
                  className="input"
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                />
                <input
                  className="input"
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Break minutes"
                  value={shiftForm.breakMinutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Working days (MON,TUE,...)"
                  value={shiftForm.workingDays}
                  onChange={(e) => setShiftForm({ ...shiftForm, workingDays: e.target.value })}
                />
                <select
                  className="input"
                  value={shiftForm.status}
                  onChange={(e) => setShiftForm({ ...shiftForm, status: e.target.value })}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
                <button className="btn btn-primary" type="submit">
                  {shiftForm.id ? 'Update shift' : 'Add shift'}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Select an employer in your access scope to view configuration.</p>
      )}
    </div>
  );
}
