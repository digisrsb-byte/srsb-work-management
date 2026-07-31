import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Users,
  Building2,
  BriefcaseBusiness,
  UserCheck
} from 'lucide-react';
import api from '../../services/api.js';

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  currentLocation: '',
  preferredLocation: '',
  totalExperience: '',
  currentCtc: '',
  expectedCtc: '',
  noticePeriodDays: '',
  skills: '',
  openingId: '',
  stage: 'SOURCED'
};

const stages = [
  'SOURCED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFERED',
  'JOINED',
  'REJECTED',
  'WITHDRAWN'
];

export default function Candidates() {
  const [candidates, setCandidates] = useState([]);
  const [openings, setOpenings] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [candidateResponse, openingResponse] = await Promise.all([
        api.get('/candidates'),
        api.get('/openings')
      ]);

      setCandidates(candidateResponse.data.data || []);
      setOpenings(openingResponse.data.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to load candidate information.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function submitCandidate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/candidates', {
        ...form,
        openingId: form.openingId || null,
        totalExperience: form.totalExperience || null,
        currentCtc: form.currentCtc || null,
        expectedCtc: form.expectedCtc || null,
        noticePeriodDays: form.noticePeriodDays || null
      });

      setSuccess('Candidate added successfully.');
      setForm(emptyForm);
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0]?.msg ||
          'Candidate could not be saved.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStage(applicationId, stage) {
    if (!applicationId) return;

    setError('');
    setSuccess('');

    try {
      await api.put(
        `/candidates/applications/${applicationId}/stage`,
        { stage }
      );

      setSuccess('Candidate stage updated.');
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Candidate stage could not be updated.'
      );
    }
  }

  const activeOpenings = useMemo(
    () =>
      openings.filter(
        (opening) =>
          opening.status !== 'CLOSED' &&
          opening.status !== 'JOINED'
      ),
    [openings]
  );

  const filteredCandidates = useMemo(() => {
    const text = search.trim().toLowerCase();

    return candidates.filter((candidate) => {
      const matchesSearch =
        !text ||
        candidate.full_name?.toLowerCase().includes(text) ||
        candidate.email?.toLowerCase().includes(text) ||
        candidate.phone?.toLowerCase().includes(text) ||
        candidate.company_name?.toLowerCase().includes(text) ||
        candidate.job_role?.toLowerCase().includes(text) ||
        candidate.added_by_name?.toLowerCase().includes(text);

      const matchesStage =
        stageFilter === 'ALL' ||
        candidate.stage === stageFilter;

      return matchesSearch && matchesStage;
    });
  }, [candidates, search, stageFilter]);

  const summary = useMemo(() => {
    const uniqueCandidateIds = new Set(
      candidates.map((candidate) => candidate.id)
    );

    return {
      totalCandidates: uniqueCandidateIds.size,
      applications: candidates.filter(
        (candidate) => candidate.application_id
      ).length,
      joined: candidates.filter(
        (candidate) => candidate.stage === 'JOINED'
      ).length,
      companies: new Set(
        candidates
          .map((candidate) => candidate.company_name)
          .filter(Boolean)
      ).size
    };
  }, [candidates]);

  function badgeClass(value) {
    return `badge badge-${String(value || '')
      .toLowerCase()
      .replaceAll('_', '-')}`;
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <h1 className="page-title">Candidate Pipeline</h1>
          <p className="page-subtitle">
            Track candidates, companies, job positions, stages and
            employee ownership.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowForm((current) => !current)}
        >
          <Plus size={17} />
          Add Candidate
        </button>
      </div>

      {error && (
        <div
          className="message message-error"
          style={{ marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="message message-success"
          style={{ marginBottom: 16 }}
        >
          {success}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 16,
          marginBottom: 20
        }}
      >
        <div className="card">
          <Users size={22} />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 10
            }}
          >
            {summary.totalCandidates}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Total Candidates
          </div>
        </div>

        <div className="card">
          <BriefcaseBusiness size={22} />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 10
            }}
          >
            {summary.applications}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Applications
          </div>
        </div>

        <div className="card">
          <UserCheck size={22} />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 10
            }}
          >
            {summary.joined}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Joined Candidates
          </div>
        </div>

        <div className="card">
          <Building2 size={22} />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 10
            }}
          >
            {summary.companies}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Companies
          </div>
        </div>
      </div>

      {showForm && (
        <form
          className="card"
          onSubmit={submitCandidate}
          style={{ marginBottom: 20 }}
        >
          <div className="section-heading">
            <div>
              <h2>Add Candidate</h2>
              <p className="page-subtitle">
                The logged-in employee will automatically be saved
                as the person who added the candidate.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Candidate Name</label>
              <input
                className="input"
                value={form.fullName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    fullName: event.target.value
                  })
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Phone</label>
              <input
                className="input"
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Current Location</label>
              <input
                className="input"
                value={form.currentLocation}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currentLocation: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Preferred Location</label>
              <input
                className="input"
                value={form.preferredLocation}
                onChange={(event) =>
                  setForm({
                    ...form,
                    preferredLocation: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Total Experience</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="0"
                value={form.totalExperience}
                onChange={(event) =>
                  setForm({
                    ...form,
                    totalExperience: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Current CTC</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.currentCtc}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currentCtc: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Expected CTC</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.expectedCtc}
                onChange={(event) =>
                  setForm({
                    ...form,
                    expectedCtc: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Notice Period in Days</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.noticePeriodDays}
                onChange={(event) =>
                  setForm({
                    ...form,
                    noticePeriodDays: event.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Company and Job Position</label>
              <select
                className="input"
                value={form.openingId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    openingId: event.target.value
                  })
                }
              >
                <option value="">Candidate Database Only</option>

                {activeOpenings.map((opening) => (
                  <option key={opening.id} value={opening.id}>
                    {opening.company_name} — {opening.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Initial Stage</label>
              <select
                className="input"
                value={form.stage}
                onChange={(event) =>
                  setForm({
                    ...form,
                    stage: event.target.value
                  })
                }
              >
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Skills</label>
              <textarea
                className="input"
                rows="3"
                value={form.skills}
                onChange={(event) =>
                  setForm({
                    ...form,
                    skills: event.target.value
                  })
                }
              />
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Candidate'}
          </button>
        </form>
      )}

      <div
        className="card"
        style={{
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: '1 1 280px'
          }}
        >
          <Search
            size={17}
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              color: 'var(--text-muted)'
            }}
          />

          <input
            className="input"
            placeholder="Search candidate, company, position or employee"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ paddingLeft: 38 }}
          />
        </div>

        <select
          className="input"
          value={stageFilter}
          onChange={(event) =>
            setStageFilter(event.target.value)
          }
          style={{ width: 210 }}
        >
          <option value="ALL">All Stages</option>

          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {stage.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading candidates...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Company</th>
                  <th>Job Position</th>
                  <th>Added By</th>
                  <th>Assigned Employee</th>
                  <th>Stage</th>
                  <th>Position Status</th>
                  <th>Closed By</th>
                </tr>
              </thead>

              <tbody>
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan="8">
                      No candidate records found.
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((candidate, index) => (
                    <tr
                      key={`${candidate.id}-${
                        candidate.application_id || index
                      }`}
                    >
                      <td>
                        <strong>{candidate.full_name}</strong>

                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)'
                          }}
                        >
                          {candidate.email ||
                            candidate.phone ||
                            'No contact details'}
                        </div>

                        {candidate.skills && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              marginTop: 4
                            }}
                          >
                            {candidate.skills}
                          </div>
                        )}
                      </td>

                      <td>
                        {candidate.company_name || 'Not assigned'}
                      </td>

                      <td>
                        {candidate.job_role || 'Candidate database'}
                      </td>

                      <td>
                        {candidate.added_by_name || 'Unknown'}
                      </td>

                      <td>
                        {candidate.assigned_recruiter_name || '—'}
                      </td>

                      <td>
                        {candidate.application_id ? (
                          <select
                            className="input"
                            value={candidate.stage || 'SOURCED'}
                            onChange={(event) =>
                              updateStage(
                                candidate.application_id,
                                event.target.value
                              )
                            }
                            disabled={
                              candidate.opening_status === 'CLOSED'
                            }
                            style={{ minWidth: 145 }}
                          >
                            {stages.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge">
                            DATABASE
                          </span>
                        )}
                      </td>

                      <td>
                        {candidate.opening_status ? (
                          <span
                            className={badgeClass(
                              candidate.opening_status
                            )}
                          >
                            {candidate.opening_status.replaceAll(
                              '_',
                              ' '
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td>
                        {candidate.position_closed_by_name || '—'}

                        {candidate.closed_date && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)'
                            }}
                          >
                            {new Date(
                              candidate.closed_date
                            ).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}