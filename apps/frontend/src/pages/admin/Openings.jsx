import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  MapPin,
  Plus,
  Search,
  RefreshCw,
  UserRound
} from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';

const initialForm = {
  clientId: '',
  title: '',
  location: '',
  openingsCount: 1,
  experienceMin: '',
  experienceMax: '',
  assignedRecruiterId: '',
  priority: 'MEDIUM',
  status: 'OPEN',
  openedDate: '',
  targetCloseDate: ''
};

const priorityOptions = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
];

const statusOptions = [
  'OPEN',
  'SOURCING',
  'SCREENING',
  'INTERVIEW',
  'OFFERED',
  'JOINED',
  'CLOSED',
  'ON_HOLD'
];

function formatText(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'Not set';

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function Openings() {
  const [openings, setOpenings] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] =
    useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(false);

  const showMessage = (text) => {
    setError('');
    setMessage(text);
  };

  const showError = (text) => {
    setMessage('');
    setError(text);
  };

  const debouncedSearch = useDebouncedValue(search, 300);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent && !hasLoadedRef.current) {
        setLoading(true);
      }

      setError('');

      const openingParams = {};

      if (debouncedSearch.trim()) {
        openingParams.search = debouncedSearch.trim();
      }

      if (selectedClientId) {
        openingParams.clientId = selectedClientId;
      }

      const [
        openingsResult,
        clientsResult,
        employeesResult
      ] = await Promise.allSettled([
        api.get('/openings', { params: openingParams }),
        api.get('/clients'),
        api.get('/employees', {
          params: { status: 'ACTIVE' }
        })
      ]);

      if (openingsResult.status === 'fulfilled') {
        setOpenings(openingsResult.value.data.data || []);
      }

      if (clientsResult.status === 'fulfilled') {
        setClients(clientsResult.value.data.data || []);
      }

      if (employeesResult.status === 'fulfilled') {
        setEmployees(
          employeesResult.value.data.data || []
        );
      }

      const failedResults = [
        openingsResult,
        clientsResult,
        employeesResult
      ].filter((result) => result.status === 'rejected');

      if (failedResults.length === 3) {
        throw failedResults[0].reason;
      }

      if (clientsResult.status === 'rejected') {
        setError(
          'Client list could not be loaded. Refresh before adding a requirement.'
        );
      } else if (failedResults.length) {
        setError(
          'Some information could not be refreshed, but available lists remain usable.'
        );
      }
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to load requirements.'
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
      hasLoadedRef.current = true;
    }
  }, [debouncedSearch, selectedClientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const createOpening = async (event) => {
    event.preventDefault();

    if (!form.clientId) {
      showError('Please select a client.');
      return;
    }

    try {
      setCreating(true);
      setError('');
      setMessage('');

      const response = await api.post('/openings', {
        clientId: Number(form.clientId),
        title: form.title,
        location: form.location,
        openingsCount: Number(form.openingsCount),
        experienceMin:
          form.experienceMin === ''
            ? null
            : Number(form.experienceMin),
        experienceMax:
          form.experienceMax === ''
            ? null
            : Number(form.experienceMax),
        assignedRecruiterId:
          form.assignedRecruiterId === ''
            ? null
            : Number(form.assignedRecruiterId),
        priority: form.priority,
        status: form.status,
        openedDate: form.openedDate || null,
        targetCloseDate:
          form.targetCloseDate || null
      });

      showMessage(
        response.data.message ||
          'Requirement created successfully.'
      );

      setForm(initialForm);
      await loadData();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to create requirement.'
      );
    } finally {
      setCreating(false);
    }
  };

  const filteredOpenings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return openings.filter((opening) => {
      const matchesSearch =
        !keyword ||
        [
          opening.company_name,
          opening.title,
          opening.location,
          opening.assigned_recruiter_name,
          opening.status,
          opening.priority
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword);

      const matchesClient =
        !selectedClientId ||
        Number(opening.client_id) ===
          Number(selectedClientId);

      return matchesSearch && matchesClient;
    });
  }, [openings, search, selectedClientId]);

  const openingsByClient = useMemo(() => {
    return clients.map((client) => {
      const clientOpenings = openings.filter(
        (opening) =>
          Number(opening.client_id) === client.id
      );

      return {
        ...client,
        openings: clientOpenings,
        totalOpenings: clientOpenings.reduce(
          (sum, opening) =>
            sum +
            Number(opening.openings_count || 0),
          0
        ),
        filledPositions: clientOpenings.reduce(
          (sum, opening) =>
            sum +
            Number(opening.filled_positions || 0),
          0
        )
      };
    });
  }, [clients, openings]);

  if (loading) {
    return (
      <div className="card">
        Loading requirements...
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .opening-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            flex-wrap: wrap;
            margin-bottom: 24px;
          }

          .opening-header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
          }

          .opening-search-wrap {
            position: relative;
            width: min(360px, 100%);
          }

          .opening-refresh-spin {
            animation: opening-spin 0.8s linear infinite;
          }

          @keyframes opening-spin {
            to { transform: rotate(360deg); }
          }

          .opening-search-wrap svg {
            position: absolute;
            left: 13px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
          }

          .opening-search {
            width: 100%;
            min-height: 44px;
            padding: 11px 13px 11px 42px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            outline: none;
            font: inherit;
          }

          .opening-search:focus {
            border-color: #0f766e;
            box-shadow:
              0 0 0 3px rgba(15, 118, 110, 0.12);
          }

          .client-cards {
            display: grid;
            grid-template-columns:
              repeat(auto-fit, minmax(230px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }

          .client-card {
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 18px;
            background: var(--surface);
            cursor: pointer;
            transition:
              transform 0.2s ease,
              border-color 0.2s ease,
              box-shadow 0.2s ease;
          }

          .client-card:hover {
            transform: translateY(-2px);
            border-color: #0f766e;
            box-shadow:
              0 10px 30px rgba(15, 23, 42, 0.08);
          }

          .client-card-selected {
            border-color: #0f766e;
            box-shadow:
              0 0 0 3px rgba(15, 118, 110, 0.12);
          }

          .client-card-heading {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 14px;
          }

          .client-card-title {
            margin: 0;
            font-size: 17px;
          }

          .client-card-meta {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .client-card-stat {
            background: var(--surface-muted);
            border-radius: 11px;
            padding: 10px;
          }

          .client-card-label {
            display: block;
            color: var(--text-muted);
            font-size: 11px;
            margin-bottom: 4px;
          }

          .client-card-value {
            font-size: 17px;
            font-weight: 800;
          }

          .opening-form-grid {
            display: grid;
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
            gap: 16px;
          }

          .opening-field {
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 13px;
            font-weight: 700;
          }

          .opening-field input,
          .opening-field select {
            width: 100%;
            min-height: 44px;
            padding: 11px 13px;
            border-radius: 11px;
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            outline: none;
            font: inherit;
          }

          .opening-field input:focus,
          .opening-field select:focus {
            border-color: #0f766e;
            box-shadow:
              0 0 0 3px rgba(15, 118, 110, 0.12);
          }

          .opening-list {
            display: grid;
            gap: 16px;
            margin-top: 22px;
          }

          .opening-card {
            border: 1px solid var(--border);
            border-radius: 18px;
            background: var(--surface);
            padding: 18px;
          }

          .opening-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 14px;
            flex-wrap: wrap;
            margin-bottom: 16px;
          }

          .opening-card-title {
            margin: 0 0 5px;
            font-size: 18px;
          }

          .opening-company {
            color: #0f766e;
            font-weight: 700;
            font-size: 13px;
          }

          .opening-card-badges {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .opening-details-grid {
            display: grid;
            grid-template-columns:
              repeat(auto-fit, minmax(165px, 1fr));
            gap: 12px;
          }

          .opening-detail {
            background: var(--surface-muted);
            border-radius: 12px;
            padding: 11px 12px;
          }

          .opening-detail-label {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
            font-size: 11px;
            margin-bottom: 6px;
          }

          .opening-detail-value {
            font-size: 13px;
            font-weight: 750;
          }

          .opening-progress {
            margin-top: 16px;
          }

          .opening-progress-top {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 12px;
            margin-bottom: 7px;
          }

          .opening-progress-track {
            height: 9px;
            background: var(--surface-muted);
            border-radius: 999px;
            overflow: hidden;
          }

          .opening-progress-fill {
            height: 100%;
            background: #0f766e;
            border-radius: 999px;
          }

          @media (max-width: 980px) {
            .opening-form-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 650px) {
            .opening-form-grid {
              grid-template-columns: 1fr;
            }

            .client-card-meta {
              grid-template-columns: 1fr;
            }
          }
        `}
      </style>

      <div className="opening-header">
        <div>
          <h1 className="page-title">
            Requirements & Openings
          </h1>

          <p className="page-subtitle">
            View client brands, job roles, opening counts
            and assigned employees.
          </p>
        </div>

        <div className="opening-header-actions">
          <div className="opening-search-wrap">
            <Search size={18} />

            <input
              type="search"
              className="opening-search"
              placeholder="Search company, role or employee..."
              value={search}
              onInput={(event) =>
                setSearch(event.currentTarget.value)
              }
              autoComplete="off"
              aria-label="Search requirements"
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              setRefreshing(true);
              await loadData({ silent: true });
              setRefreshing(false);
            }}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={17}
              className={refreshing ? 'opening-refresh-spin' : ''}
            />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && (
        <div className="message message-success">
          {message}
        </div>
      )}

      {error && (
        <div className="message message-error">
          {error}
        </div>
      )}

      <div className="client-cards">
        <div
          className={`client-card ${
            selectedClientId === ''
              ? 'client-card-selected'
              : ''
          }`}
          onClick={() => setSelectedClientId('')}
        >
          <div className="client-card-heading">
            <div>
              <h3 className="client-card-title">
                All Brands
              </h3>

              <span className="page-subtitle">
                View every requirement
              </span>
            </div>

            <Building2 size={22} />
          </div>

          <div className="client-card-meta">
            <div className="client-card-stat">
              <span className="client-card-label">
                Companies
              </span>

              <span className="client-card-value">
                {clients.length}
              </span>
            </div>

            <div className="client-card-stat">
              <span className="client-card-label">
                Requirements
              </span>

              <span className="client-card-value">
                {openings.length}
              </span>
            </div>
          </div>
        </div>

        {openingsByClient.map((client) => (
          <div
            key={client.id}
            className={`client-card ${
              Number(selectedClientId) === client.id
                ? 'client-card-selected'
                : ''
            }`}
            onClick={() =>
              setSelectedClientId(String(client.id))
            }
          >
            <div className="client-card-heading">
              <div>
                <h3 className="client-card-title">
                  {client.company_name}
                </h3>

                <span className="page-subtitle">
                  {client.industry || 'Industry not added'}
                </span>
              </div>

              <Building2 size={22} />
            </div>

            <div className="client-card-meta">
              <div className="client-card-stat">
                <span className="client-card-label">
                  Job Roles
                </span>

                <span className="client-card-value">
                  {client.openings.length}
                </span>
              </div>

              <div className="client-card-stat">
                <span className="client-card-label">
                  Total Positions
                </span>

                <span className="client-card-value">
                  {client.totalOpenings}
                </span>
              </div>

              <div className="client-card-stat">
                <span className="client-card-label">
                  Filled
                </span>

                <span className="client-card-value">
                  {client.filledPositions}
                </span>
              </div>

              <div className="client-card-stat">
                <span className="client-card-label">
                  Remaining
                </span>

                <span className="client-card-value">
                  {Math.max(
                    client.totalOpenings -
                      client.filledPositions,
                    0
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={createOpening}>
        <div className="section-heading">
          <div>
            <h2>Add New Requirement</h2>

            <p className="page-subtitle">
              Add a client position and assign it to an
              employee.
            </p>
          </div>

          <Plus size={22} />
        </div>

        <div className="opening-form-grid">
          <label className="opening-field">
            Client / Brand

            <select
              name="clientId"
              value={form.clientId}
              onChange={handleChange}
              onInput={handleChange}
              disabled={!clients.length}
              required
            >
              <option value="">
                {clients.length
                  ? 'Select client'
                  : 'No clients available — add a client first'}
              </option>

              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.company_name}
                </option>
              ))}
            </select>
          </label>

          <label className="opening-field">
            Job Role

            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Example: Office Boy"
              required
            />
          </label>

          <label className="opening-field">
            Number of Positions

            <input
              type="number"
              name="openingsCount"
              min="1"
              value={form.openingsCount}
              onChange={handleChange}
              required
            />
          </label>

          <label className="opening-field">
            Location

            <input
              type="text"
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="Example: Bengaluru"
            />
          </label>

          <label className="opening-field">
            Minimum Experience

            <input
              type="number"
              name="experienceMin"
              min="0"
              step="0.5"
              value={form.experienceMin}
              onChange={handleChange}
              placeholder="0"
            />
          </label>

          <label className="opening-field">
            Maximum Experience

            <input
              type="number"
              name="experienceMax"
              min="0"
              step="0.5"
              value={form.experienceMax}
              onChange={handleChange}
              placeholder="5"
            />
          </label>

          <label className="opening-field">
            Assigned Employee

            <select
              name="assignedRecruiterId"
              value={form.assignedRecruiterId}
              onChange={handleChange}
            >
              <option value="">
                Not Assigned
              </option>

              {employees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {employee.full_name}
                  {' — '}
                  {employee.employee_id}
                </option>
              ))}
            </select>
          </label>

          <label className="opening-field">
            Priority

            <select
              name="priority"
              value={form.priority}
              onChange={handleChange}
            >
              {priorityOptions.map((priority) => (
                <option
                  key={priority}
                  value={priority}
                >
                  {formatText(priority)}
                </option>
              ))}
            </select>
          </label>

          <label className="opening-field">
            Status

            <select
              name="status"
              value={form.status}
              onChange={handleChange}
            >
              {statusOptions.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {formatText(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="opening-field">
            Opened Date

            <input
              type="date"
              name="openedDate"
              value={form.openedDate}
              onChange={handleChange}
            />
          </label>

          <label className="opening-field">
            Target Close Date

            <input
              type="date"
              name="targetCloseDate"
              value={form.targetCloseDate}
              onChange={handleChange}
            />
          </label>
        </div>

        <button
          type="submit"
          className="button"
          disabled={creating}
          style={{ marginTop: 18 }}
        >
          {creating
            ? 'Creating...'
            : 'Create Requirement'}
        </button>
      </form>

      <div className="opening-list">
        {filteredOpenings.map((opening) => {
          const totalPositions = Number(
            opening.openings_count || 0
          );

          const filledPositions = Number(
            opening.filled_positions || 0
          );

          const progress =
            totalPositions > 0
              ? Math.min(
                  Math.round(
                    (filledPositions /
                      totalPositions) *
                      100
                  ),
                  100
                )
              : 0;

          return (
            <article
              className="opening-card"
              key={opening.id}
            >
              <div className="opening-card-header">
                <div>
                  <h3 className="opening-card-title">
                    {opening.title}
                  </h3>

                  <div className="opening-company">
                    {opening.company_name}
                  </div>
                </div>

                <div className="opening-card-badges">
                  <span
                    className={`badge badge-${String(
                      opening.priority || 'MEDIUM'
                    ).toLowerCase()}`}
                  >
                    {formatText(opening.priority)}
                  </span>

                  <span
                    className={`badge badge-${String(
                      opening.status || 'OPEN'
                    ).toLowerCase()}`}
                  >
                    {formatText(opening.status)}
                  </span>
                </div>
              </div>

              <div className="opening-details-grid">
                <div className="opening-detail">
                  <span className="opening-detail-label">
                    <BriefcaseBusiness size={14} />
                    Positions
                  </span>

                  <span className="opening-detail-value">
                    {opening.openings_count || 0}
                  </span>
                </div>

                <div className="opening-detail">
                  <span className="opening-detail-label">
                    <MapPin size={14} />
                    Location
                  </span>

                  <span className="opening-detail-value">
                    {opening.location || 'Not added'}
                  </span>
                </div>

                <div className="opening-detail">
                  <span className="opening-detail-label">
                    <UserRound size={14} />
                    Handled By
                  </span>

                  <span className="opening-detail-value">
                    {opening.assigned_recruiter_name ||
                      'Not Assigned'}
                  </span>
                </div>

                <div className="opening-detail">
                  <span className="opening-detail-label">
                    <CalendarDays size={14} />
                    Target Date
                  </span>

                  <span className="opening-detail-value">
                    {formatDate(
                      opening.target_close_date
                    )}
                  </span>
                </div>

                <div className="opening-detail">
                  <span className="opening-detail-label">
                    Filled Positions
                  </span>

                  <span className="opening-detail-value">
                    {filledPositions}
                  </span>
                </div>

                <div className="opening-detail">
                  <span className="opening-detail-label">
                    Remaining Positions
                  </span>

                  <span className="opening-detail-value">
                    {opening.remaining_positions || 0}
                  </span>
                </div>
              </div>

              <div className="opening-progress">
                <div className="opening-progress-top">
                  <span>
                    Placement progress
                  </span>

                  <strong>{progress}%</strong>
                </div>

                <div className="opening-progress-track">
                  <div
                    className="opening-progress-fill"
                    style={{
                      width: `${progress}%`
                    }}
                  />
                </div>
              </div>
            </article>
          );
        })}

        {!filteredOpenings.length && (
          <div className="card">
            No requirements found.
          </div>
        )}
      </div>
    </>
  );
}