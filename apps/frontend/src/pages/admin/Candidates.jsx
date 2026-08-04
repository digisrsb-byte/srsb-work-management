import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Building2, CalendarDays, IndianRupee, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyCandidate = {
  fullName: '', email: '', phone: '', currentLocation: '', preferredLocation: '',
  totalExperience: '', currentCtc: '', expectedCtc: '', noticePeriodDays: '',
  skills: '', openingId: '', stage: 'SOURCED'
};

const emptyHistory = {
  clientId: '', position: '', ctc: '', joiningDate: '', leavingDate: '',
  employmentStatus: 'JOINED', reasonForLeaving: '', notes: ''
};

const stages = ['SOURCED','SCREENING','SHORTLISTED','INTERVIEW','OFFERED','JOINED','REJECTED','WITHDRAWN'];
const employmentStatuses = ['OFFERED','JOINED','ACTIVE','LEFT','NO_SHOW','TERMINATED'];

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Candidates() {
  const { user } = useAuth();
  const canDeleteHistory = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user?.role);
  const [candidates, setCandidates] = useState([]);
  const [clients, setClients] = useState([]);
  const [openings, setOpenings] = useState([]);
  const [candidateForm, setCandidateForm] = useState(emptyCandidate);
  const [historyForm, setHistoryForm] = useState(emptyHistory);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [editingHistory, setEditingHistory] = useState(null);
  const [history, setHistory] = useState([]);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadReferenceData = useCallback(async () => {
    const [clientsResponse, openingsResponse] = await Promise.all([
      api.get('/clients/reference'),
      api.get('/openings')
    ]);
    setClients(clientsResponse.data.data || []);
    setOpenings((openingsResponse.data.data || []).filter((opening) => opening.status !== 'CLOSED'));
  }, []);

  const loadCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/candidates', {
        params: { search: debouncedSearch || undefined, stage: stage || undefined }
      });
      setCandidates(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load candidates.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, stage]);

  useEffect(() => {
    Promise.all([loadReferenceData(), loadCandidates()]).catch((requestError) => {
      setError(requestError.response?.data?.message || 'Unable to load candidate information.');
    });
  }, [loadReferenceData, loadCandidates]);

  const uniqueCandidates = useMemo(() => {
    const map = new Map();
    candidates.forEach((candidate) => {
      const current = map.get(candidate.id);
      if (!current) map.set(candidate.id, { ...candidate, applications: candidate.application_id ? [candidate] : [] });
      else if (candidate.application_id) current.applications.push(candidate);
    });
    return [...map.values()];
  }, [candidates]);

  function updateCandidateField(event) {
    const { name, value } = event.target;
    setCandidateForm((current) => ({ ...current, [name]: value }));
  }

  function updateHistoryField(event) {
    const { name, value } = event.target;
    setHistoryForm((current) => ({ ...current, [name]: value }));
  }

  function openCandidateCreate() {
    setEditingCandidate(null);
    setCandidateForm(emptyCandidate);
    setShowCandidateForm(true);
    setMessage('');
    setError('');
  }

  function openCandidateEdit(candidate) {
    setEditingCandidate(candidate);
    setCandidateForm({
      fullName: candidate.full_name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      currentLocation: candidate.current_location || '',
      preferredLocation: candidate.preferred_location || '',
      totalExperience: candidate.total_experience ?? '',
      currentCtc: candidate.current_ctc ?? '',
      expectedCtc: candidate.expected_ctc ?? '',
      noticePeriodDays: candidate.notice_period_days ?? '',
      skills: candidate.skills || '',
      openingId: '',
      stage: 'SOURCED'
    });
    setShowCandidateForm(true);
    setMessage('');
    setError('');
  }

  async function saveCandidate(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const response = editingCandidate
        ? await api.put(`/candidates/${editingCandidate.id}`, candidateForm)
        : await api.post('/candidates', candidateForm);
      setMessage(response.data.message);
      setShowCandidateForm(false);
      setEditingCandidate(null);
      setCandidateForm(emptyCandidate);
      await loadCandidates();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Candidate could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(candidate) {
    try {
      setSelectedCandidate(candidate);
      setShowHistoryForm(false);
      setHistoryForm(emptyHistory);
      setEditingHistory(null);
      const response = await api.get(`/candidates/${candidate.id}/history`);
      setHistory(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load candidate history.');
    }
  }

  function openHistoryCreate() {
    setEditingHistory(null);
    setHistoryForm(emptyHistory);
    setShowHistoryForm(true);
  }

  function openHistoryEdit(record) {
    setEditingHistory(record);
    setHistoryForm({
      clientId: record.client_id || '',
      position: record.position || '',
      ctc: record.ctc ?? '',
      joiningDate: record.joining_date ? String(record.joining_date).slice(0, 10) : '',
      leavingDate: record.leaving_date ? String(record.leaving_date).slice(0, 10) : '',
      employmentStatus: record.employment_status || 'JOINED',
      reasonForLeaving: record.reason_for_leaving || '',
      notes: record.notes || ''
    });
    setShowHistoryForm(true);
  }

  async function saveHistory(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const response = editingHistory
        ? await api.put(`/candidates/${selectedCandidate.id}/history/${editingHistory.id}`, historyForm)
        : await api.post(`/candidates/${selectedCandidate.id}/history`, historyForm);
      setMessage(response.data.message);
      setShowHistoryForm(false);
      setEditingHistory(null);
      setHistoryForm(emptyHistory);
      await openHistory(selectedCandidate);
      await loadCandidates();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Employment history could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteHistory(record) {
    if (!window.confirm('Delete this employment history record?')) return;
    try {
      const response = await api.delete(`/candidates/${selectedCandidate.id}/history/${record.id}`);
      setMessage(response.data.message);
      await openHistory(selectedCandidate);
      await loadCandidates();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'History record could not be deleted.');
    }
  }

  async function changeStage(applicationId, nextStage) {
    try {
      await api.put(`/candidates/applications/${applicationId}/stage`, { stage: nextStage });
      setMessage('Candidate stage updated successfully.');
      await loadCandidates();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Candidate stage could not be updated.');
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Talent Delivery</p>
          <h1 className="page-title">Candidates & Placement History</h1>
          <p className="page-subtitle">Track candidate profiles, job stages and every company they joined through SRSB.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCandidateCreate}><Plus size={18} /> Add Candidate</button>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showCandidateForm && (
        <form className="card form-card" onSubmit={saveCandidate}>
          <div className="section-heading"><div><h2>{editingCandidate ? 'Edit Candidate' : 'Add Candidate'}</h2><p className="page-subtitle">Add a profile now. Placement history can be added after saving.</p></div><button className="icon-btn" type="button" onClick={() => setShowCandidateForm(false)}><X size={20} /></button></div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Candidate Name *</span><input className="input" name="fullName" value={candidateForm.fullName} onChange={updateCandidateField} required /></label>
            <label className="form-group"><span>Email</span><input className="input" type="email" name="email" value={candidateForm.email} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Phone</span><input className="input" name="phone" value={candidateForm.phone} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Current Location</span><input className="input" name="currentLocation" value={candidateForm.currentLocation} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Preferred Location</span><input className="input" name="preferredLocation" value={candidateForm.preferredLocation} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Total Experience (years)</span><input className="input" type="number" step="0.1" min="0" name="totalExperience" value={candidateForm.totalExperience} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Current CTC</span><input className="input" type="number" min="0" name="currentCtc" value={candidateForm.currentCtc} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Expected CTC</span><input className="input" type="number" min="0" name="expectedCtc" value={candidateForm.expectedCtc} onChange={updateCandidateField} /></label>
            <label className="form-group"><span>Notice Period (days)</span><input className="input" type="number" min="0" name="noticePeriodDays" value={candidateForm.noticePeriodDays} onChange={updateCandidateField} /></label>
            <label className="form-group form-span-2"><span>Skills</span><textarea className="input" rows="3" name="skills" value={candidateForm.skills} onChange={updateCandidateField} /></label>
            {!editingCandidate && <><label className="form-group"><span>Link to Requirement</span><select className="input" name="openingId" value={candidateForm.openingId} onChange={updateCandidateField}><option value="">Candidate database only</option>{openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.company_name} — {opening.title}</option>)}</select></label><label className="form-group"><span>Stage</span><select className="input" name="stage" value={candidateForm.stage} onChange={updateCandidateField}>{stages.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label></>}
          </div>
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowCandidateForm(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Candidate'}</button></div>
        </form>
      )}

      <div className="card">
        <div className="toolbar"><div className="search-box"><Search size={18} /><input value={search} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Search candidate, company, position or recruiter" /></div><select className="input compact-select" value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All stages</option>{stages.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select><button className="btn btn-secondary" type="button" onClick={loadCandidates} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>

        <div className="candidate-grid">
          {!loading && !uniqueCandidates.length && <div className="empty-state"><UserRound size={34} /><strong>No candidates found.</strong></div>}
          {uniqueCandidates.map((candidate) => (
            <article className="candidate-card" key={candidate.id}>
              <div className="candidate-card-header"><div className="candidate-avatar">{candidate.full_name.slice(0, 1).toUpperCase()}</div><div><h3>{candidate.full_name}</h3><p>{candidate.phone || candidate.email || 'No contact details'}</p></div><button className="icon-btn" type="button" onClick={() => openCandidateEdit(candidate)}><Pencil size={17} /></button></div>
              <div className="candidate-info-grid"><div><span>Experience</span><strong>{candidate.total_experience ?? 0} years</strong></div><div><span>Current CTC</span><strong>{formatMoney(candidate.current_ctc)}</strong></div><div><span>Expected CTC</span><strong>{formatMoney(candidate.expected_ctc)}</strong></div><div><span>Added By</span><strong>{candidate.added_by_name || '—'}</strong></div></div>

              {candidate.latest_history_id ? (
                <div className="placement-highlight"><div><Building2 size={18} /><strong>{candidate.latest_company}</strong></div><span>{candidate.latest_position} · {formatMoney(candidate.latest_ctc)}</span><small>{candidate.latest_employment_status?.replaceAll('_', ' ')} · Joined {formatDate(candidate.latest_joining_date)}</small></div>
              ) : <div className="placement-empty">No placement history recorded yet.</div>}

              {!!candidate.applications.length && <div className="application-list">{candidate.applications.map((application) => <div className="application-row" key={application.application_id}><div><strong>{application.company_name} — {application.job_role}</strong><span>{application.assigned_recruiter_name || 'Unassigned'}</span></div><select value={application.stage} onChange={(event) => changeStage(application.application_id, event.target.value)}>{stages.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></div>)}</div>}

              <div className="card-actions"><button className="btn btn-secondary" type="button" onClick={() => openHistory(candidate)}><BriefcaseBusiness size={16} /> View History ({candidate.history_count})</button></div>
            </article>
          ))}
        </div>
      </div>

      {selectedCandidate && (
        <div className="drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelectedCandidate(null)}>
          <aside className="side-drawer">
            <div className="drawer-header"><div><p className="eyebrow">Employment Timeline</p><h2>{selectedCandidate.full_name}</h2></div><button className="icon-btn" type="button" onClick={() => setSelectedCandidate(null)}><X size={20} /></button></div>
            <button className="btn btn-primary" type="button" onClick={openHistoryCreate}><Plus size={17} /> Add Placement / Employment</button>

            {showHistoryForm && (
              <form className="nested-form" onSubmit={saveHistory}>
                <h3>{editingHistory ? 'Edit History' : 'Add History'}</h3>
                <label className="form-group"><span>Company *</span><select className="input" name="clientId" value={historyForm.clientId} onChange={updateHistoryField} required><option value="">Select company</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></label>
                <label className="form-group"><span>Position *</span><input className="input" name="position" value={historyForm.position} onChange={updateHistoryField} required /></label>
                <label className="form-group"><span>CTC</span><input className="input" type="number" min="0" name="ctc" value={historyForm.ctc} onChange={updateHistoryField} /></label>
                <div className="form-grid"><label className="form-group"><span>Date of Joining</span><input className="input" type="date" name="joiningDate" value={historyForm.joiningDate} onChange={updateHistoryField} /></label><label className="form-group"><span>Date of Leaving</span><input className="input" type="date" name="leavingDate" value={historyForm.leavingDate} onChange={updateHistoryField} /></label></div>
                <label className="form-group"><span>Status</span><select className="input" name="employmentStatus" value={historyForm.employmentStatus} onChange={updateHistoryField}>{employmentStatuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="form-group"><span>Reason for Leaving</span><textarea className="input" rows="2" name="reasonForLeaving" value={historyForm.reasonForLeaving} onChange={updateHistoryField} /></label>
                <label className="form-group"><span>Notes</span><textarea className="input" rows="2" name="notes" value={historyForm.notes} onChange={updateHistoryField} /></label>
                <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowHistoryForm(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save History'}</button></div>
              </form>
            )}

            <div className="timeline">
              {!history.length && <div className="empty-state">No employment history recorded.</div>}
              {history.map((record) => (
                <div className="timeline-item" key={record.id}>
                  <div className="timeline-dot" />
                  <div className="timeline-content"><div className="timeline-top"><div><h3>{record.position}</h3><p>{record.company_name || record.company_name_snapshot}</p></div><span className={`badge badge-${String(record.employment_status).toLowerCase()}`}>{record.employment_status.replaceAll('_', ' ')}</span></div><div className="timeline-meta"><span><IndianRupee size={15} /> {formatMoney(record.ctc)}</span><span><CalendarDays size={15} /> {formatDate(record.joining_date)} — {record.leaving_date ? formatDate(record.leaving_date) : 'Present'}</span></div>{record.reason_for_leaving && <p><strong>Reason:</strong> {record.reason_for_leaving}</p>}<div className="row-actions"><button className="icon-btn" type="button" onClick={() => openHistoryEdit(record)}><Pencil size={16} /></button>{canDeleteHistory && <button className="icon-btn danger" type="button" onClick={() => deleteHistory(record)}><Trash2 size={16} /></button>}</div></div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
