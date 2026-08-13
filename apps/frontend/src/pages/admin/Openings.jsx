import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  MapPin,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  UserRound
} from 'lucide-react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
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
  const { user } = useAuth();
  const canManageRequirement = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'RECRUITER'].includes(user?.role);
  const addFormRef = useRef(null);
  const [openings, setOpenings] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [expandedClientId, setExpandedClientId] =
    useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingOpeningId, setEditingOpeningId] = useState(null);

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
  }, [debouncedSearch]);

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

  const resetRequirementForm = () => {
    setForm(initialForm);
    setEditingOpeningId(null);
  };

  const startEditingRequirement = (opening) => {
    setEditingOpeningId(opening.id);
    setForm({
      clientId: String(opening.client_id || ''),
      title: opening.title || '',
      location: opening.location || '',
      openingsCount: Number(opening.openings_count || 1),
      experienceMin:
        opening.experience_min === null ||
        opening.experience_min === undefined
          ? ''
          : opening.experience_min,
      experienceMax:
        opening.experience_max === null ||
        opening.experience_max === undefined
          ? ''
          : opening.experience_max,
      assignedRecruiterId:
        opening.assigned_recruiter_id === null ||
        opening.assigned_recruiter_id === undefined
          ? ''
          : String(opening.assigned_recruiter_id),
      priority: opening.priority || 'MEDIUM',
      status: opening.status || 'OPEN',
      openedDate: opening.opened_date
        ? String(opening.opened_date).slice(0, 10)
        : '',
      targetCloseDate: opening.target_close_date
        ? String(opening.target_close_date).slice(0, 10)
        : ''
    });

    window.requestAnimationFrame(() => {
      addFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  };

  const saveOpening = async (event) => {
    event.preventDefault();

    if (!form.clientId) {
      showError('Please select a client.');
      return;
    }

    const payload = {
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
      targetCloseDate: form.targetCloseDate || null
    };

    try {
      setCreating(true);
      setError('');
      setMessage('');

      const response = editingOpeningId
        ? await api.put(`/openings/${editingOpeningId}`, payload)
        : await api.post('/openings', payload);

      showMessage(
        response.data.message ||
          (editingOpeningId
            ? 'Requirement updated successfully.'
            : 'Requirement created successfully.')
      );

      resetRequirementForm();
      await loadData();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          (editingOpeningId
            ? 'Unable to update requirement.'
            : 'Unable to create requirement.')
      );
    } finally {
      setCreating(false);
    }
  };

  const deleteOpening = async (opening) => {
    if (!window.confirm(`Delete requirement "${opening.title}" for ${opening.company_name}?`)) {
      return;
    }

    try {
      setError('');
      setMessage('');
      const response = await api.delete(`/openings/${opening.id}`);
      showMessage(response.data.message || 'Requirement deleted successfully.');

      if (editingOpeningId === opening.id) {
        resetRequirementForm();
      }

      await loadData({ silent: true });
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to delete requirement.'
      );
    }
  };

  const filteredOpenings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return openings.filter((opening) => {
      return (
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
          .includes(keyword)
      );
    });
  }, [openings, search]);

  const openingsByClient = useMemo(() => {
    return [...clients]
      .sort((first, second) =>
        String(first.company_name || '').localeCompare(
          String(second.company_name || ''),
          'en',
          { sensitivity: 'base' }
        )
      )
      .map((client) => {
        const clientOpenings = filteredOpenings.filter(
          (opening) =>
            Number(opening.client_id) === Number(client.id)
        );

        return {
          ...client,
          openings: clientOpenings,
          totalOpenings: clientOpenings.reduce(
            (sum, opening) =>
              sum + Number(opening.openings_count || 0),
            0
          ),
          filledPositions: clientOpenings.reduce(
            (sum, opening) =>
              sum + Number(opening.filled_positions || 0),
            0
          )
        };
      });
  }, [clients, filteredOpenings]);

  const visibleClientGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return openingsByClient;

    return openingsByClient.filter((client) => {
      const companyMatches = [
        client.company_name,
        client.industry
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword);

      return companyMatches || client.openings.length > 0;
    });
  }, [openingsByClient, search]);

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

          .requirements-accordion {
            margin-bottom: 24px;
            padding: 0;
            overflow: hidden;
          }

          .requirements-accordion-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 18px;
            border-bottom: 1px solid var(--border);
            background: var(--surface-muted);
          }

          .requirements-accordion-head span {
            color: var(--text-muted);
            font-size: 12px;
          }

          .requirements-company-row {
            border-bottom: 1px solid var(--border);
            background: var(--surface);
          }

          .requirements-company-row:last-child {
            border-bottom: 0;
          }

          .requirements-company-trigger {
            width: 100%;
            border: 0;
            background: transparent;
            color: var(--text);
            font: inherit;
            cursor: pointer;
            display: grid;
            grid-template-columns: 28px 44px minmax(220px, 1fr) auto;
            gap: 12px;
            align-items: center;
            padding: 17px 18px;
            text-align: left;
          }

          .requirements-company-trigger:hover {
            background: var(--surface-muted);
          }

          .requirements-company-chevron {
            color: var(--text-muted);
            display: grid;
            place-items: center;
          }

          .requirements-company-icon {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            display: grid;
            place-items: center;
            color: #0f766e;
            background: rgba(20, 184, 166, 0.14);
          }

          .requirements-company-copy {
            min-width: 0;
            display: grid;
            gap: 3px;
          }

          .requirements-company-copy strong {
            font-size: 15px;
          }

          .requirements-company-copy small {
            color: var(--text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .requirements-company-stats {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
          }

          .requirements-company-stat {
            min-width: 74px;
            padding: 7px 10px;
            border-radius: 10px;
            text-align: center;
            background: var(--surface-muted);
          }

          .requirements-company-stat strong {
            display: block;
            font-size: 14px;
          }

          .requirements-company-stat span {
            display: block;
            margin-top: 2px;
            color: var(--text-muted);
            font-size: 10px;
          }

          .requirements-company-expanded {
            padding: 0 18px 18px 102px;
          }

          .requirements-company-expanded .opening-list {
            margin-top: 0;
          }

          .requirements-company-expanded .opening-card {
            border-radius: 14px;
          }

          .requirements-company-empty {
            border: 1px dashed var(--border);
            border-radius: 12px;
            padding: 16px;
            color: var(--text-muted);
            background: var(--surface-muted);
          }

          @media (max-width: 980px) {
            .opening-form-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 650px) {
            .requirements-company-trigger {
              grid-template-columns: 24px 40px 1fr;
              padding: 14px;
            }

            .requirements-company-stats {
              grid-column: 1 / -1;
              padding-left: 64px;
              justify-content: flex-start;
            }

            .requirements-company-expanded {
              padding: 0 14px 14px;
            }

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

          {canManageRequirement && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                addFormRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
                addFormRef.current?.querySelector('select')?.focus();
              }}
            >
              <Plus size={17} />
              Add Requirement
            </button>
          )}

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

      <div className="card requirements-accordion">
        <div className="requirements-accordion-head">
          <strong>
            {visibleClientGroups.length} Compan
            {visibleClientGroups.length === 1 ? 'y' : 'ies'}
          </strong>

          <span>
            {filteredOpenings.length} Requirement
            {filteredOpenings.length === 1 ? '' : 's'}
            {' · '}Sorted by company name
          </span>
        </div>

        {visibleClientGroups.map((client) => {
          const expanded =
            Number(expandedClientId) === Number(client.id);

          const remainingPositions = Math.max(
            client.totalOpenings - client.filledPositions,
            0
          );

          return (
            <div
              className="requirements-company-row"
              key={client.id}
            >
              <button
                type="button"
                className="requirements-company-trigger"
                onClick={() =>
                  setExpandedClientId(
                    expanded ? '' : String(client.id)
                  )
                }
                aria-expanded={expanded}
              >
                <span className="requirements-company-chevron">
                  {expanded
                    ? <ChevronDown size={20} />
                    : <ChevronRight size={20} />}
                </span>

                <span className="requirements-company-icon">
                  <Building2 size={20} />
                </span>

                <span className="requirements-company-copy">
                  <strong>{client.company_name}</strong>
                  <small>
                    {client.industry || 'Industry not added'}
                  </small>
                </span>

                <span className="requirements-company-stats">
                  <span className="requirements-company-stat">
                    <strong>{client.openings.length}</strong>
                    <span>Job Roles</span>
                  </span>

                  <span className="requirements-company-stat">
                    <strong>{client.totalOpenings}</strong>
                    <span>Positions</span>
                  </span>

                  <span className="requirements-company-stat">
                    <strong>{client.filledPositions}</strong>
                    <span>Filled</span>
                  </span>

                  <span className="requirements-company-stat">
                    <strong>{remainingPositions}</strong>
                    <span>Remaining</span>
                  </span>
                </span>
              </button>

              {expanded && (
                <div className="requirements-company-expanded">
                  {client.openings.length ? (
                    <div className="opening-list">
                      {client.openings.map((opening) => {
                        const totalPositions = Number(
                          opening.openings_count || 0
                        );

                        const filledPositions = Number(
                          opening.filled_positions || 0
                        );

                        const remaining = Math.max(
                          Number(
                            opening.remaining_positions ??
                              totalPositions - filledPositions
                          ),
                          0
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

                                {canManageRequirement && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-compact"
                                      onClick={() =>
                                        startEditingRequirement(
                                          opening
                                        )
                                      }
                                    >
                                      <Pencil size={15} />
                                      Edit
                                    </button>

                                    <button
                                      type="button"
                                      className="btn btn-danger btn-compact"
                                      onClick={() =>
                                        deleteOpening(opening)
                                      }
                                    >
                                      <Trash2 size={15} />
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="opening-details-grid">
                              <div className="opening-detail">
                                <span className="opening-detail-label">
                                  <BriefcaseBusiness size={14} />
                                  Positions
                                </span>
                                <span className="opening-detail-value">
                                  {totalPositions}
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
                                  {remaining}
                                </span>
                              </div>
                            </div>

                            <div className="opening-progress">
                              <div className="opening-progress-top">
                                <span>Placement progress</span>
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
                    </div>
                  ) : (
                    <div className="requirements-company-empty">
                      No matching requirements for this company.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!visibleClientGroups.length && clients.length > 0 && (
          <div className="requirements-company-empty">
            No company or requirement matches your search.
          </div>
        )}
      </div>

      {!clients.length && (
        <div
          className="message message-warning"
          style={{
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <span>
            No client has been added yet. Add a client
            before creating a requirement.
          </span>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              window.location.hash =
                '#/admin/clients';
            }}
          >
            Go to Clients and add a company
          </button>
        </div>
      )}

      {canManageRequirement && (
      <form ref={addFormRef} className="card" onSubmit={saveOpening}>
        <div className="section-heading">
          <div>
            <h2>
              {editingOpeningId
                ? 'Edit Requirement'
                : 'Add New Requirement'}
            </h2>

            <p className="page-subtitle">
              {editingOpeningId
                ? 'Update the selected requirement and save the changes.'
                : 'Add a client position and assign it to an employee.'}
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

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 18
          }}
        >
          <button
            type="submit"
            className="button"
            disabled={creating}
          >
            {creating
              ? editingOpeningId
                ? 'Updating...'
                : 'Creating...'
              : editingOpeningId
                ? 'Update Requirement'
                : 'Create Requirement'}
          </button>

          {editingOpeningId && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetRequirementForm}
              disabled={creating}
            >
              <X size={16} />
              Cancel Edit
            </button>
          )}
        </div>
      </form>
      )}

    </>
  );
}