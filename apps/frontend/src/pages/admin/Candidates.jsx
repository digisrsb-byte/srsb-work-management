import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Building2, CalendarDays, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useAuth } from '../../context/AuthContext.jsx';

const stages = ['SOURCED','SCREENING','SHORTLISTED','INTERVIEW','OFFERED','JOINED','REJECTED','WITHDRAWN'];
const employmentStatuses = ['OFFERED','JOINED','ACTIVE','LEFT','NO_SHOW','TERMINATED'];
const sourceOptions = ['JOB_PORTAL','REFERRAL','WALK_IN','LINKEDIN','COMPANY_WEBSITE','EXISTING_DATABASE','OTHER'];
const emptyCandidate = {
  fullName: '', email: '', phone: '', dateOfBirth: '', candidateSource: 'JOB_PORTAL', sourceDetails: '',
  enrollmentDate: new Date().toISOString().slice(0, 10), currentLocation: '', preferredLocation: '',
  totalExperience: '', currentCtc: '', expectedCtc: '', noticePeriodDays: '', skills: '', openingId: '',
  assignedRecruiterId: '', sourcedDate: new Date().toISOString().slice(0, 10), sourcingNotes: '', stage: 'SOURCED'
};
const emptySourcing = { openingId: '', assignedRecruiterId: '', sourcedDate: new Date().toISOString().slice(0, 10), sourcingNotes: '', stage: 'SOURCED' };
const emptyPlacement = {
  applicationId: '', clientId: '', openingId: '', position: '', location: '', ctc: '', offeredCtc: '', grossSalary: '',
  offerDate: '', joiningDate: '', leavingDate: '', employmentStatus: 'JOINED', placementFee: '', replacementPeriodDays: '',
  recruiterId: '', reasonForLeaving: '', notes: ''
};

const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function Candidates() {
  const { user } = useAuth();
  const canDelete = ['SUPER_ADMIN','ADMIN','HR'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [reference, setReference] = useState({ clients: [], openings: [], recruiters: [], sources: sourceOptions });
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [candidateForm, setCandidateForm] = useState(emptyCandidate);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sourcingForm, setSourcingForm] = useState(emptySourcing);
  const [showSourcing, setShowSourcing] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [placementForm, setPlacementForm] = useState(emptyPlacement);
  const [editingPlacement, setEditingPlacement] = useState(null);
  const [showPlacement, setShowPlacement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadReference = useCallback(async () => {
    const response = await api.get('/candidates/reference-data');
    setReference(response.data.data || { clients: [], openings: [], recruiters: [], sources: sourceOptions });
  }, []);

  const loadCandidates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/candidates', { params: { search: debouncedSearch || undefined, stage: stage || undefined } });
      const data = response.data.data || [];
      setRows(data);
      return data;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load candidates.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, stage]);

  useEffect(() => {
    Promise.all([loadReference(), loadCandidates()]).catch((requestError) => setError(requestError.response?.data?.message || 'Unable to load candidate information.'));
  }, [loadReference, loadCandidates]);

  const candidates = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.id)) map.set(row.id, { ...row, applications: [] });
      if (row.application_id && !map.get(row.id).applications.some((item) => item.application_id === row.application_id)) {
        map.get(row.id).applications.push(row);
      }
    });
    return [...map.values()];
  }, [rows]);

  function setField(setter) {
    return (event) => {
      const { name, value } = event.target;
      setter((current) => ({ ...current, [name]: value }));
    };
  }

  function openCreate() {
    setEditingCandidate(null);
    setCandidateForm(emptyCandidate);
    setShowCandidateForm(true);
    setError(''); setMessage('');
  }

  function openEdit(candidate) {
    setEditingCandidate(candidate);
    setCandidateForm({
      ...emptyCandidate,
      fullName: candidate.full_name || '', email: candidate.email || '', phone: candidate.phone || '',
      dateOfBirth: candidate.date_of_birth ? String(candidate.date_of_birth).slice(0, 10) : '',
      candidateSource: candidate.candidate_source || 'OTHER', sourceDetails: candidate.source_details || '',
      enrollmentDate: candidate.enrollment_date ? String(candidate.enrollment_date).slice(0, 10) : '',
      currentLocation: candidate.current_location || '', preferredLocation: candidate.preferred_location || '',
      totalExperience: candidate.total_experience ?? '', currentCtc: candidate.current_ctc ?? '', expectedCtc: candidate.expected_ctc ?? '',
      noticePeriodDays: candidate.notice_period_days ?? '', skills: candidate.skills || '', openingId: ''
    });
    setShowCandidateForm(true);
  }

  async function saveCandidate(event) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      const payload = editingCandidate ? { ...candidateForm, openingId: undefined } : candidateForm;
      const response = editingCandidate
        ? await api.put(`/candidates/${editingCandidate.id}`, payload)
        : await api.post('/candidates', payload);
      setMessage(response.data.message);
      setShowCandidateForm(false); setEditingCandidate(null); setCandidateForm(emptyCandidate);
      await loadCandidates();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Candidate could not be saved.');
    } finally { setSaving(false); }
  }

  async function selectCandidate(candidate) {
    setSelected(candidate);
    setShowSourcing(false); setShowPlacement(false); setEditingPlacement(null);
    try {
      const response = await api.get(`/candidates/${candidate.id}/history`);
      setPlacements(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load placement history.');
    }
  }

  async function saveSourcing(event) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      const response = await api.post(`/candidates/${selected.id}/applications`, sourcingForm);
      setMessage(response.data.message); setShowSourcing(false); setSourcingForm(emptySourcing);
      const refreshedRows = await loadCandidates();
      const applications = (refreshedRows || []).filter((item) => Number(item.id) === Number(selected.id) && item.application_id);
      setSelected((current) => ({ ...(current || selected), applications }));
    } catch (requestError) { setError(requestError.response?.data?.message || 'Sourcing record could not be added.'); }
    finally { setSaving(false); }
  }

  async function updateStage(applicationId, nextStage, recruiterId) {
    try {
      await api.put(`/candidates/applications/${applicationId}/stage`, { stage: nextStage, assignedRecruiterId: recruiterId || undefined });
      setMessage('Candidate stage updated.');
      const refreshedRows = await loadCandidates();
      if (selected) {
        const applications = (refreshedRows || []).filter((item) => Number(item.id) === Number(selected.id) && item.application_id);
        setSelected((current) => ({ ...(current || selected), applications }));
      }
    } catch (requestError) { setError(requestError.response?.data?.message || 'Stage could not be updated.'); }
  }

  async function deleteSourcing(applicationId) {
    if (!window.confirm('Delete this sourcing record?')) return;
    try {
      const response = await api.delete(`/candidates/${selected.id}/applications/${applicationId}`);
      setMessage(response.data.message); await loadCandidates();
      setSelected((current) => ({ ...current, applications: current.applications.filter((item) => item.application_id !== applicationId) }));
    } catch (requestError) { setError(requestError.response?.data?.message || 'Sourcing record could not be deleted.'); }
  }

  function openPlacement(record = null) {
    setEditingPlacement(record);
    setPlacementForm(record ? {
      applicationId: record.application_id || '', clientId: record.client_id || '', openingId: record.opening_id || '',
      position: record.position || '', location: record.location || '', ctc: record.ctc ?? '', offeredCtc: record.offered_ctc ?? '',
      grossSalary: record.gross_salary ?? '', offerDate: record.offer_date ? String(record.offer_date).slice(0, 10) : '',
      joiningDate: record.joining_date ? String(record.joining_date).slice(0, 10) : '', leavingDate: record.leaving_date ? String(record.leaving_date).slice(0, 10) : '',
      employmentStatus: record.employment_status || 'JOINED', placementFee: record.placement_fee ?? '',
      replacementPeriodDays: record.replacement_period_days ?? '', recruiterId: record.recruiter_id || '',
      reasonForLeaving: record.reason_for_leaving || '', notes: record.notes || ''
    } : emptyPlacement);
    setShowPlacement(true);
  }

  function chooseApplication(event) {
    const applicationId = event.target.value;
    const application = selected?.applications?.find((item) => String(item.application_id) === String(applicationId));
    setPlacementForm((current) => ({
      ...current, applicationId,
      clientId: application?.client_id || current.clientId,
      openingId: application?.opening_id || current.openingId,
      position: application?.job_role || current.position,
      location: application?.requirement_location || current.location,
      recruiterId: application?.assigned_recruiter_id || current.recruiterId
    }));
  }

  async function savePlacement(event) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      const response = editingPlacement
        ? await api.put(`/candidates/${selected.id}/history/${editingPlacement.id}`, placementForm)
        : await api.post(`/candidates/${selected.id}/history`, placementForm);
      setMessage(response.data.message); setShowPlacement(false); setEditingPlacement(null);
      await selectCandidate(selected); await loadCandidates();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Placement could not be saved.'); }
    finally { setSaving(false); }
  }

  async function deletePlacement(record) {
    if (!window.confirm('Delete this placement history?')) return;
    try {
      const response = await api.delete(`/candidates/${selected.id}/history/${record.id}`);
      setMessage(response.data.message); await selectCandidate(selected); await loadCandidates();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Placement could not be deleted.'); }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">Recruitment Delivery</p><h1 className="page-title">Candidates & Placements</h1><p className="page-subtitle">Enrol candidates, source them for multiple client requirements and preserve final placement history.</p></div>
        <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={18} /> Enrol Candidate</button>
      </div>
      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showCandidateForm && <form className="card form-card" onSubmit={saveCandidate}>
        <div className="section-heading"><div><h2>{editingCandidate ? 'Edit Candidate' : 'Candidate Enrolment'}</h2><p className="page-subtitle">The employee who saves this profile is recorded automatically as Enrolled By.</p></div><button className="icon-btn" type="button" onClick={() => setShowCandidateForm(false)}><X size={20}/></button></div>
        <div className="form-grid form-grid-3">
          <label className="form-group"><span>Candidate Name *</span><input className="input" name="fullName" value={candidateForm.fullName} onChange={setField(setCandidateForm)} required /></label>
          <label className="form-group"><span>Email</span><input className="input" type="email" name="email" value={candidateForm.email} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Phone</span><input className="input" name="phone" value={candidateForm.phone} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Date of Birth</span><input className="input" type="date" name="dateOfBirth" value={candidateForm.dateOfBirth} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Candidate Source *</span><select className="input" name="candidateSource" value={candidateForm.candidateSource} onChange={setField(setCandidateForm)}>{(reference.sources || sourceOptions).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label className="form-group"><span>Source Details</span><input className="input" name="sourceDetails" value={candidateForm.sourceDetails} onChange={setField(setCandidateForm)} placeholder="Portal, referral name or campaign" /></label>
          <label className="form-group"><span>Enrolment Date</span><input className="input" type="date" name="enrollmentDate" value={candidateForm.enrollmentDate} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Current Location</span><input className="input" name="currentLocation" value={candidateForm.currentLocation} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Preferred Location</span><input className="input" name="preferredLocation" value={candidateForm.preferredLocation} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Experience (years)</span><input className="input" type="number" min="0" step="0.1" name="totalExperience" value={candidateForm.totalExperience} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Current CTC</span><input className="input" type="number" min="0" name="currentCtc" value={candidateForm.currentCtc} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Expected CTC</span><input className="input" type="number" min="0" name="expectedCtc" value={candidateForm.expectedCtc} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group"><span>Notice Period (days)</span><input className="input" type="number" min="0" name="noticePeriodDays" value={candidateForm.noticePeriodDays} onChange={setField(setCandidateForm)} /></label>
          <label className="form-group form-span-2"><span>Skills</span><input className="input" name="skills" value={candidateForm.skills} onChange={setField(setCandidateForm)} placeholder="React, Node.js, Recruitment..." /></label>
          {!editingCandidate && <>
            <label className="form-group form-span-2"><span>Sourced For Company / Job Requirement</span><select className="input" name="openingId" value={candidateForm.openingId} onChange={setField(setCandidateForm)}><option value="">Candidate database only</option>{reference.openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.company_name} — {opening.title} ({label(opening.status)})</option>)}</select></label>
            <label className="form-group"><span>Assigned Recruiter</span><select className="input" name="assignedRecruiterId" value={candidateForm.assignedRecruiterId} onChange={setField(setCandidateForm)}><option value="">Current employee</option>{reference.recruiters.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
          </>}
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Candidate'}</button><button className="btn btn-secondary" type="button" onClick={() => setShowCandidateForm(false)}>Cancel</button></div>
      </form>}

      <div className="card toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidate, company, skill or recruiter" /></div><select className="input compact-select" value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All Stages</option>{stages.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>

      <div className="candidate-list">
        {loading ? <div className="card">Loading candidates...</div> : candidates.length === 0 ? <div className="card empty-state">No candidates found.</div> : candidates.map((candidate) => <article className="card candidate-card" key={candidate.id}>
          <div className="candidate-card-head"><div className="candidate-avatar"><UserRound size={22}/></div><div><h3>{candidate.full_name}</h3><p>{candidate.email || candidate.phone || 'No contact'} · Enrolled by {candidate.enrolled_by_name || 'SRSB'}</p></div><div className="row-actions"><button className="btn btn-secondary" type="button" onClick={() => selectCandidate(candidate)}>View Journey</button><button className="icon-btn" type="button" onClick={() => openEdit(candidate)}><Pencil size={17}/></button></div></div>
          <div className="candidate-info-grid"><span><strong>Source:</strong> {label(candidate.candidate_source)}</span><span><strong>Enrolled:</strong> {formatDate(candidate.enrollment_date)}</span><span><strong>Sourcing records:</strong> {candidate.applications.length}</span><span><strong>Placements:</strong> {candidate.history_count || 0}</span><span><strong>Latest company:</strong> {candidate.latest_company || 'Not placed'}</span><span><strong>Latest status:</strong> {candidate.latest_employment_status ? label(candidate.latest_employment_status) : '—'}</span></div>
          {candidate.applications.length > 0 && <div className="candidate-stage-strip">{candidate.applications.map((application) => <div key={application.application_id}><Building2 size={15}/><span>{application.company_name} — {application.job_role}</span><select value={application.stage || 'SOURCED'} onChange={(event) => updateStage(application.application_id, event.target.value, application.assigned_recruiter_id)}>{stages.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>)}</div>}
        </article>)}
      </div>

      {selected && <div className="modal-overlay"><div className="modal-card modal-wide">
        <div className="section-heading"><div><h2>{selected.full_name} — Recruitment Journey</h2><p className="page-subtitle">Separate sourcing history from the company where the candidate finally joined.</p></div><button className="icon-btn" type="button" onClick={() => setSelected(null)}><X size={20}/></button></div>
        <div className="journey-actions"><button className="btn btn-secondary" type="button" onClick={() => { setSourcingForm(emptySourcing); setShowSourcing(true); }}><Plus size={16}/> Source for Company</button><button className="btn btn-primary" type="button" onClick={() => openPlacement()}><Plus size={16}/> Add Placement</button></div>

        {showSourcing && <form className="nested-form" onSubmit={saveSourcing}><h3>Source for another company requirement</h3><div className="form-grid form-grid-3"><label className="form-group form-span-2"><span>Company / Job Requirement *</span><select className="input" name="openingId" value={sourcingForm.openingId} onChange={setField(setSourcingForm)} required><option value="">Select requirement</option>{reference.openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.company_name} — {opening.title}</option>)}</select></label><label className="form-group"><span>Recruiter</span><select className="input" name="assignedRecruiterId" value={sourcingForm.assignedRecruiterId} onChange={setField(setSourcingForm)}><option value="">Current employee</option>{reference.recruiters.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className="form-group"><span>Sourced Date</span><input className="input" type="date" name="sourcedDate" value={sourcingForm.sourcedDate} onChange={setField(setSourcingForm)} /></label><label className="form-group"><span>Stage</span><select className="input" name="stage" value={sourcingForm.stage} onChange={setField(setSourcingForm)}>{stages.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label className="form-group"><span>Remarks</span><input className="input" name="sourcingNotes" value={sourcingForm.sourcingNotes} onChange={setField(setSourcingForm)} /></label></div><div className="form-actions"><button className="btn btn-primary" disabled={saving}>Add Sourcing Record</button><button className="btn btn-secondary" type="button" onClick={() => setShowSourcing(false)}>Cancel</button></div></form>}

        <h3>Sourcing History</h3><div className="history-list">{(selected.applications || []).length === 0 ? <p className="empty-copy">Not sourced for a requirement yet.</p> : selected.applications.map((application) => <div className="history-row" key={application.application_id}><div><strong>{application.company_name}</strong><span>{application.job_role} · {label(application.stage)} · {application.assigned_recruiter_name || 'Unassigned'}</span></div>{canDelete && <button className="icon-btn danger" type="button" onClick={() => deleteSourcing(application.application_id)}><Trash2 size={16}/></button>}</div>)}</div>

        {showPlacement && <form className="nested-form" onSubmit={savePlacement}><h3>{editingPlacement ? 'Edit Placement' : 'Add Placement / Employment'}</h3><div className="form-grid form-grid-3"><label className="form-group form-span-2"><span>Related Sourcing Record</span><select className="input" name="applicationId" value={placementForm.applicationId} onChange={chooseApplication}><option value="">Select manually</option>{(selected.applications || []).map((item) => <option key={item.application_id} value={item.application_id}>{item.company_name} — {item.job_role}</option>)}</select></label><label className="form-group"><span>Placed Company *</span><select className="input" name="clientId" value={placementForm.clientId} onChange={setField(setPlacementForm)} required><option value="">Select company</option>{reference.clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></label><label className="form-group"><span>Designation *</span><input className="input" name="position" value={placementForm.position} onChange={setField(setPlacementForm)} required /></label><label className="form-group"><span>Joining Location</span><input className="input" name="location" value={placementForm.location} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Recruiter Responsible</span><select className="input" name="recruiterId" value={placementForm.recruiterId} onChange={setField(setPlacementForm)}><option value="">Current employee</option>{reference.recruiters.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className="form-group"><span>Offer Date</span><input className="input" type="date" name="offerDate" value={placementForm.offerDate} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Joining Date</span><input className="input" type="date" name="joiningDate" value={placementForm.joiningDate} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Status</span><select className="input" name="employmentStatus" value={placementForm.employmentStatus} onChange={setField(setPlacementForm)}>{employmentStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label className="form-group"><span>Annual CTC</span><input className="input" type="number" min="0" name="offeredCtc" value={placementForm.offeredCtc} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Gross Salary</span><input className="input" type="number" min="0" name="grossSalary" value={placementForm.grossSalary} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Placement Fee</span><input className="input" type="number" min="0" name="placementFee" value={placementForm.placementFee} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Replacement Period (days)</span><input className="input" type="number" min="0" name="replacementPeriodDays" value={placementForm.replacementPeriodDays} onChange={setField(setPlacementForm)} /></label><label className="form-group"><span>Leaving Date</span><input className="input" type="date" name="leavingDate" value={placementForm.leavingDate} onChange={setField(setPlacementForm)} /></label><label className="form-group form-span-2"><span>Reason / Notes</span><input className="input" name="notes" value={placementForm.notes} onChange={setField(setPlacementForm)} /></label></div><div className="form-actions"><button className="btn btn-primary" disabled={saving}>Save Placement</button><button className="btn btn-secondary" type="button" onClick={() => setShowPlacement(false)}>Cancel</button></div></form>}

        <h3>Placement & Employment History</h3><div className="history-list">{placements.length === 0 ? <p className="empty-copy">No placement has been recorded.</p> : placements.map((record) => <div className="history-row" key={record.id}><div><strong>{record.company_name_snapshot} — {record.position}</strong><span>{label(record.employment_status)} · Joined {formatDate(record.joining_date)} · CTC {money(record.offered_ctc || record.ctc)} · Recruiter {record.recruiter_name || '—'}</span></div><div className="row-actions"><button className="icon-btn" type="button" onClick={() => openPlacement(record)}><Pencil size={16}/></button>{canDelete && <button className="icon-btn danger" type="button" onClick={() => deletePlacement(record)}><Trash2 size={16}/></button>}</div></div>)}</div>
      </div></div>}
    </div>
  );
}
