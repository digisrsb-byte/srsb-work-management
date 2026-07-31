import {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronUp,
  Edit3,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  X
} from 'lucide-react';

import api from '../../services/api.js';

const initialClientForm = {
  companyName: '',
  industry: '',
  website: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  status: 'PROSPECT'
};

const initialOpeningForm = {
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

const clientStatuses = [
  'PROSPECT',
  'ACTIVE',
  'INACTIVE',
  'CLOSED'
];

const openingStatuses = [
  'OPEN',
  'SOURCING',
  'SCREENING',
  'INTERVIEW',
  'OFFERED',
  'JOINED',
  'CLOSED',
  'ON_HOLD'
];

const priorities = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
];

function formatText(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [clientForm, setClientForm] = useState(
    initialClientForm
  );

  const [openingForm, setOpeningForm] = useState(
    initialOpeningForm
  );

  const [editingClientId, setEditingClientId] =
    useState(null);

  const [selectedClientId, setSelectedClientId] =
    useState(null);

  const [expandedClientId, setExpandedClientId] =
    useState(null);

  const [clientOpenings, setClientOpenings] =
    useState({});

  const [showClientForm, setShowClientForm] =
    useState(false);

  const [showOpeningForm, setShowOpeningForm] =
    useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('');

  const [loading, setLoading] = useState(true);
  const [savingClient, setSavingClient] =
    useState(false);

  const [savingOpening, setSavingOpening] =
    useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function showSuccess(text) {
    setError('');
    setMessage(text);
  }

  function showError(text) {
    setMessage('');
    setError(text);
  }

  async function loadData() {
    try {
      setLoading(true);
      setError('');

      const [
        clientsResponse,
        employeesResponse
      ] = await Promise.all([
        api.get('/clients'),
        api.get('/employees')
      ]);

      setClients(
        clientsResponse.data.data || []
      );

      setEmployees(
        (employeesResponse.data.data || []).filter(
          (employee) =>
            employee.status === 'ACTIVE' ||
            !employee.status
        )
      );
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to load clients.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredClients = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    return clients.filter((client) => {
      const matchesSearch =
        !keyword ||
        [
          client.company_name,
          client.industry,
          client.contact_name,
          client.contact_email,
          client.contact_phone,
          client.onboarded_by_name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword);

      const matchesStatus =
        !statusFilter ||
        client.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  function resetClientForm() {
    setClientForm(initialClientForm);
    setEditingClientId(null);
    setShowClientForm(false);
  }

  function openAddClientForm() {
    setClientForm(initialClientForm);
    setEditingClientId(null);
    setShowClientForm(true);
    setShowOpeningForm(false);
    setError('');
    setMessage('');
  }

  function openEditClientForm(client) {
    setClientForm({
      companyName: client.company_name || '',
      industry: client.industry || '',
      website: client.website || '',
      contactName: client.contact_name || '',
      contactEmail: client.contact_email || '',
      contactPhone: client.contact_phone || '',
      status: client.status || 'PROSPECT'
    });

    setEditingClientId(client.id);
    setShowClientForm(true);
    setShowOpeningForm(false);
    setError('');
    setMessage('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  async function saveClient(event) {
    event.preventDefault();

    try {
      setSavingClient(true);
      setError('');
      setMessage('');

      let response;

      if (editingClientId) {
        response = await api.put(
          `/clients/${editingClientId}`,
          clientForm
        );
      } else {
        response = await api.post(
          '/clients',
          clientForm
        );
      }

      showSuccess(
        response.data.message ||
          'Client saved successfully.'
      );

      resetClientForm();
      await loadData();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Client could not be saved.'
      );
    } finally {
      setSavingClient(false);
    }
  }

  async function viewClientOpenings(clientId) {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      return;
    }

    try {
      setError('');

      const response = await api.get(
        `/clients/${clientId}`
      );

      setClientOpenings((current) => ({
        ...current,
        [clientId]:
          response.data.data.openings || []
      }));

      setExpandedClientId(clientId);
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to load client openings.'
      );
    }
  }

  function openAddOpeningForm(client) {
    setSelectedClientId(client.id);
    setOpeningForm(initialOpeningForm);
    setShowOpeningForm(true);
    setShowClientForm(false);
    setError('');
    setMessage('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  async function saveOpening(event) {
    event.preventDefault();

    if (!selectedClientId) {
      showError('Please select a client.');
      return;
    }

    try {
      setSavingOpening(true);
      setError('');
      setMessage('');

      const response = await api.post(
        '/openings',
        {
          clientId: Number(selectedClientId),
          title: openingForm.title,
          location: openingForm.location,
          openingsCount: Number(
            openingForm.openingsCount
          ),
          experienceMin:
            openingForm.experienceMin === ''
              ? null
              : Number(
                  openingForm.experienceMin
                ),
          experienceMax:
            openingForm.experienceMax === ''
              ? null
              : Number(
                  openingForm.experienceMax
                ),
          assignedRecruiterId:
            openingForm.assignedRecruiterId ===
            ''
              ? null
              : Number(
                  openingForm.assignedRecruiterId
                ),
          priority: openingForm.priority,
          status: openingForm.status,
          openedDate:
            openingForm.openedDate || null,
          targetCloseDate:
            openingForm.targetCloseDate || null
        }
      );

      showSuccess(
        response.data.message ||
          'Opening created successfully.'
      );

      setOpeningForm(initialOpeningForm);
      setShowOpeningForm(false);

      const clientResponse = await api.get(
        `/clients/${selectedClientId}`
      );

      setClientOpenings((current) => ({
        ...current,
        [selectedClientId]:
          clientResponse.data.data.openings || []
      }));

      await loadData();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Opening could not be created.'
      );
    } finally {
      setSavingOpening(false);
    }
  }

  async function deleteClient(client) {
    const confirmed = window.confirm(
      `Delete ${client.company_name}?\n\nClients with opening history cannot be deleted. They should be marked as Former Client instead.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setMessage('');

      const response = await api.delete(
        `/clients/${client.id}`
      );

      showSuccess(
        response.data.message ||
          'Client deleted successfully.'
      );

      await loadData();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Client could not be deleted.'
      );
    }
  }

  const selectedClient = clients.find(
    (client) =>
      client.id === Number(selectedClientId)
  );

  if (loading) {
    return (
      <div className="card">
        Loading clients...
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .clients-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            flex-wrap: wrap;
            margin-bottom: 22px;
          }

          .clients-header-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }

          .clients-toolbar {
            display: grid;
            grid-template-columns:
              minmax(240px, 1fr) 190px;
            gap: 12px;
            margin-bottom: 20px;
          }

          .clients-search-wrap {
            position: relative;
          }

          .clients-search-wrap svg {
            position: absolute;
            left: 13px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
          }

          .clients-search {
            width: 100%;
            min-height: 44px;
            padding: 11px 13px 11px 42px;
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--surface);
            color: var(--text);
            outline: none;
            font: inherit;
          }

          .clients-filter {
            width: 100%;
            min-height: 44px;
            padding: 11px 13px;
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--surface);
            color: var(--text);
            outline: none;
            font: inherit;
          }

          .clients-search:focus,
          .clients-filter:focus {
            border-color: #0f766e;
            box-shadow:
              0 0 0 3px rgba(15, 118, 110, 0.12);
          }

          .client-form-grid {
            display: grid;
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
            gap: 16px;
          }

          .client-field {
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 13px;
            font-weight: 700;
          }

          .client-field input,
          .client-field select {
            width: 100%;
            min-height: 44px;
            padding: 11px 13px;
            border: 1px solid var(--border);
            border-radius: 11px;
            background: var(--surface);
            color: var(--text);
            outline: none;
            font: inherit;
          }

          .client-field input:focus,
          .client-field select:focus {
            border-color: #0f766e;
            box-shadow:
              0 0 0 3px rgba(15, 118, 110, 0.12);
          }

          .client-form-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 18px;
          }

          .client-summary-grid {
            display: grid;
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 20px;
          }

          .client-summary-card {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 17px;
            border: 1px solid var(--border);
            border-radius: 16px;
            background: var(--surface);
          }

          .client-summary-icon {
            width: 43px;
            height: 43px;
            display: grid;
            place-items: center;
            flex-shrink: 0;
            border-radius: 13px;
            background: var(--surface-muted);
            color: #0f766e;
          }

          .client-summary-label {
            color: var(--text-muted);
            font-size: 12px;
          }

          .client-summary-value {
            display: block;
            margin-top: 3px;
            font-size: 22px;
            font-weight: 800;
          }

          .clients-list {
            display: grid;
            gap: 16px;
          }

          .client-item {
            border: 1px solid var(--border);
            border-radius: 18px;
            background: var(--surface);
            overflow: hidden;
          }

          .client-item-main {
            padding: 19px;
          }

          .client-item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            flex-wrap: wrap;
          }

          .client-company-row {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .client-company-icon {
            width: 43px;
            height: 43px;
            display: grid;
            place-items: center;
            flex-shrink: 0;
            border-radius: 13px;
            background: var(--surface-muted);
            color: #0f766e;
          }

          .client-company-name {
            margin: 0 0 5px;
            font-size: 19px;
          }

          .client-company-industry {
            color: var(--text-muted);
            font-size: 13px;
          }

          .client-item-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .client-action-button {
            min-height: 38px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 11px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: var(--surface);
            color: var(--text);
            cursor: pointer;
            font: inherit;
            font-size: 12px;
            font-weight: 700;
          }

          .client-action-button:hover {
            border-color: #0f766e;
            color: #0f766e;
          }

          .client-delete-button:hover {
            border-color: #dc2626;
            color: #dc2626;
          }

          .client-info-grid {
            display: grid;
            grid-template-columns:
              repeat(auto-fit, minmax(170px, 1fr));
            gap: 11px;
            margin-top: 17px;
          }

          .client-info-box {
            padding: 11px 12px;
            border-radius: 12px;
            background: var(--surface-muted);
          }

          .client-info-label {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
            color: var(--text-muted);
            font-size: 11px;
          }

          .client-info-value {
            font-size: 13px;
            font-weight: 700;
            word-break: break-word;
          }

          .client-stat-grid {
            display: grid;
            grid-template-columns:
              repeat(6, minmax(0, 1fr));
            gap: 10px;
            margin-top: 16px;
          }

          .client-stat-box {
            padding: 11px;
            text-align: center;
            border-radius: 12px;
            background: var(--surface-muted);
          }

          .client-stat-label {
            display: block;
            color: var(--text-muted);
            font-size: 10px;
            margin-bottom: 5px;
          }

          .client-stat-value {
            font-size: 17px;
            font-weight: 800;
          }

          .client-openings {
            padding: 18px;
            border-top: 1px solid var(--border);
            background: var(--surface-muted);
          }

          .client-openings-heading {
            margin: 0 0 14px;
            font-size: 15px;
          }

          .client-opening-list {
            display: grid;
            gap: 11px;
          }

          .client-opening-card {
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: 13px;
            background: var(--surface);
          }

          .client-opening-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            flex-wrap: wrap;
          }

          .client-opening-title {
            margin: 0 0 4px;
            font-size: 15px;
          }

          .client-opening-location {
            display: flex;
            align-items: center;
            gap: 5px;
            color: var(--text-muted);
            font-size: 12px;
          }

          .client-opening-badges {
            display: flex;
            gap: 7px;
            flex-wrap: wrap;
          }

          .client-opening-stats {
            display: grid;
            grid-template-columns:
              repeat(5, minmax(0, 1fr));
            gap: 9px;
            margin-top: 12px;
          }

          .client-opening-stat {
            padding: 9px;
            border-radius: 10px;
            background: var(--surface-muted);
          }

          .client-opening-stat span {
            display: block;
            color: var(--text-muted);
            font-size: 10px;
            margin-bottom: 4px;
          }

          .client-opening-stat strong {
            font-size: 12px;
          }

          @media (max-width: 1050px) {
            .client-form-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }

            .client-summary-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }

            .client-stat-grid {
              grid-template-columns:
                repeat(3, minmax(0, 1fr));
            }
          }

          @media (max-width: 700px) {
            .clients-toolbar,
            .client-form-grid,
            .client-summary-grid,
            .client-opening-stats {
              grid-template-columns: 1fr;
            }

            .client-stat-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }

            .client-item-actions {
              width: 100%;
            }

            .client-action-button {
              flex: 1;
            }
          }
        `}
      </style>

      <div className="clients-header">
        <div>
          <h1 className="page-title">
            Client Management
          </h1>

          <p className="page-subtitle">
            Manage prospects, active clients, former
            clients and their recruitment openings.
          </p>
        </div>

        <div className="clients-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={openAddClientForm}
          >
            <Plus size={17} />
            Add Client
          </button>
        </div>
      </div>

      {message && (
        <div
          className="message message-success"
          style={{ marginBottom: 16 }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          className="message message-error"
          style={{ marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      {showClientForm && (
        <form
          className="card"
          onSubmit={saveClient}
          style={{ marginBottom: 20 }}
        >
          <div className="section-heading">
            <div>
              <h2>
                {editingClientId
                  ? 'Edit Client'
                  : 'Add New Client'}
              </h2>

              <p className="page-subtitle">
                Add company and primary contact
                information.
              </p>
            </div>

            <button
              type="button"
              className="client-action-button"
              onClick={resetClientForm}
            >
              <X size={16} />
              Close
            </button>
          </div>

          <div className="client-form-grid">
            <label className="client-field">
              Company Name

              <input
                type="text"
                value={clientForm.companyName}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    companyName:
                      event.target.value
                  }))
                }
                required
              />
            </label>

            <label className="client-field">
              Industry

              <input
                type="text"
                value={clientForm.industry}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    industry: event.target.value
                  }))
                }
                placeholder="Example: IT Services"
              />
            </label>

            <label className="client-field">
              Website

              <input
                type="url"
                value={clientForm.website}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    website: event.target.value
                  }))
                }
                placeholder="https://company.com"
              />
            </label>

            <label className="client-field">
              Contact Name

              <input
                type="text"
                value={clientForm.contactName}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    contactName:
                      event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Contact Email

              <input
                type="email"
                value={clientForm.contactEmail}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    contactEmail:
                      event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Contact Phone

              <input
                type="text"
                value={clientForm.contactPhone}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    contactPhone:
                      event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Client Status

              <select
                value={clientForm.status}
                onChange={(event) =>
                  setClientForm((current) => ({
                    ...current,
                    status: event.target.value
                  }))
                }
              >
                {clientStatuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status === 'CLOSED'
                      ? 'Former Client'
                      : formatText(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="client-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingClient}
            >
              {savingClient
                ? 'Saving...'
                : editingClientId
                  ? 'Update Client'
                  : 'Save Client'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={resetClientForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showOpeningForm && selectedClient && (
        <form
          className="card"
          onSubmit={saveOpening}
          style={{ marginBottom: 20 }}
        >
          <div className="section-heading">
            <div>
              <h2>Add Client Opening</h2>

              <p className="page-subtitle">
                Adding a requirement for{' '}
                <strong>
                  {selectedClient.company_name}
                </strong>
              </p>
            </div>

            <button
              type="button"
              className="client-action-button"
              onClick={() => {
                setShowOpeningForm(false);
                setOpeningForm(
                  initialOpeningForm
                );
              }}
            >
              <X size={16} />
              Close
            </button>
          </div>

          <div className="client-form-grid">
            <label className="client-field">
              Job Role

              <input
                type="text"
                value={openingForm.title}
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                required
              />
            </label>

            <label className="client-field">
              Number of Positions

              <input
                type="number"
                min="1"
                value={
                  openingForm.openingsCount
                }
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    openingsCount:
                      event.target.value
                  }))
                }
                required
              />
            </label>

            <label className="client-field">
              Location

              <input
                type="text"
                value={openingForm.location}
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    location: event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Minimum Experience

              <input
                type="number"
                min="0"
                step="0.5"
                value={
                  openingForm.experienceMin
                }
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    experienceMin:
                      event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Maximum Experience

              <input
                type="number"
                min="0"
                step="0.5"
                value={
                  openingForm.experienceMax
                }
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    experienceMax:
                      event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Assigned Employee

              <select
                value={
                  openingForm.assignedRecruiterId
                }
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    assignedRecruiterId:
                      event.target.value
                  }))
                }
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
                    {' - '}
                    {employee.employee_id}
                  </option>
                ))}
              </select>
            </label>

            <label className="client-field">
              Priority

              <select
                value={openingForm.priority}
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    priority:
                      event.target.value
                  }))
                }
              >
                {priorities.map((priority) => (
                  <option
                    key={priority}
                    value={priority}
                  >
                    {formatText(priority)}
                  </option>
                ))}
              </select>
            </label>

            <label className="client-field">
              Opening Status

              <select
                value={openingForm.status}
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    status: event.target.value
                  }))
                }
              >
                {openingStatuses.map(
                  (status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {formatText(status)}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="client-field">
              Opened Date

              <input
                type="date"
                value={openingForm.openedDate}
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    openedDate:
                      event.target.value
                  }))
                }
              />
            </label>

            <label className="client-field">
              Target Close Date

              <input
                type="date"
                value={
                  openingForm.targetCloseDate
                }
                onChange={(event) =>
                  setOpeningForm((current) => ({
                    ...current,
                    targetCloseDate:
                      event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="client-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingOpening}
            >
              {savingOpening
                ? 'Creating...'
                : 'Create Opening'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setShowOpeningForm(false)
              }
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="client-summary-grid">
        <div className="client-summary-card">
          <div className="client-summary-icon">
            <Building2 size={21} />
          </div>

          <div>
            <span className="client-summary-label">
              Total Clients
            </span>

            <strong className="client-summary-value">
              {clients.length}
            </strong>
          </div>
        </div>

        <div className="client-summary-card">
          <div className="client-summary-icon">
            <BriefcaseBusiness size={21} />
          </div>

          <div>
            <span className="client-summary-label">
              Active Clients
            </span>

            <strong className="client-summary-value">
              {
                clients.filter(
                  (client) =>
                    client.status === 'ACTIVE'
                ).length
              }
            </strong>
          </div>
        </div>

        <div className="client-summary-card">
          <div className="client-summary-icon">
            <Plus size={21} />
          </div>

          <div>
            <span className="client-summary-label">
              Active Openings
            </span>

            <strong className="client-summary-value">
              {clients.reduce(
                (total, client) =>
                  total +
                  Number(
                    client.active_openings || 0
                  ),
                0
              )}
            </strong>
          </div>
        </div>

        <div className="client-summary-card">
          <div className="client-summary-icon">
            <UserRound size={21} />
          </div>

          <div>
            <span className="client-summary-label">
              Filled Positions
            </span>

            <strong className="client-summary-value">
              {clients.reduce(
                (total, client) =>
                  total +
                  Number(
                    client.filled_positions || 0
                  ),
                0
              )}
            </strong>
          </div>
        </div>
      </div>

      <div className="clients-toolbar">
        <div className="clients-search-wrap">
          <Search size={18} />

          <input
            type="search"
            className="clients-search"
            placeholder="Search company, contact or industry..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <select
          className="clients-filter"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value)
          }
        >
          <option value="">
            All Client Statuses
          </option>

          {clientStatuses.map((status) => (
            <option
              key={status}
              value={status}
            >
              {status === 'CLOSED'
                ? 'Former Client'
                : formatText(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="clients-list">
        {filteredClients.map((client) => {
          const openings =
            clientOpenings[client.id] || [];

          return (
            <article
              className="client-item"
              key={client.id}
            >
              <div className="client-item-main">
                <div className="client-item-header">
                  <div className="client-company-row">
                    <div className="client-company-icon">
                      <Building2 size={21} />
                    </div>

                    <div>
                      <h3 className="client-company-name">
                        {client.company_name}
                      </h3>

                      <div className="client-company-industry">
                        {client.industry ||
                          'Industry not added'}
                      </div>

                      <div
                        style={{
                          marginTop: 8
                        }}
                      >
                        <span
                          className={`badge badge-${String(
                            client.status
                          ).toLowerCase()}`}
                        >
                          {client.status ===
                          'CLOSED'
                            ? 'Former Client'
                            : formatText(
                                client.status
                              )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="client-item-actions">
                    <button
                      type="button"
                      className="client-action-button"
                      onClick={() =>
                        openAddOpeningForm(client)
                      }
                    >
                      <Plus size={15} />
                      Add Opening
                    </button>

                    <button
                      type="button"
                      className="client-action-button"
                      onClick={() =>
                        openEditClientForm(client)
                      }
                    >
                      <Edit3 size={15} />
                      Edit
                    </button>

                    <button
                      type="button"
                      className="client-action-button"
                      onClick={() =>
                        viewClientOpenings(
                          client.id
                        )
                      }
                    >
                      {expandedClientId ===
                      client.id ? (
                        <ChevronUp size={15} />
                      ) : (
                        <ChevronDown size={15} />
                      )}

                      Openings
                    </button>

                    <button
                      type="button"
                      className="client-action-button client-delete-button"
                      onClick={() =>
                        deleteClient(client)
                      }
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="client-info-grid">
                  <div className="client-info-box">
                    <span className="client-info-label">
                      <UserRound size={13} />
                      Contact Person
                    </span>

                    <div className="client-info-value">
                      {client.contact_name ||
                        'Not added'}
                    </div>
                  </div>

                  <div className="client-info-box">
                    <span className="client-info-label">
                      <Mail size={13} />
                      Email
                    </span>

                    <div className="client-info-value">
                      {client.contact_email ||
                        'Not added'}
                    </div>
                  </div>

                  <div className="client-info-box">
                    <span className="client-info-label">
                      <Phone size={13} />
                      Phone
                    </span>

                    <div className="client-info-value">
                      {client.contact_phone ||
                        'Not added'}
                    </div>
                  </div>

                  <div className="client-info-box">
                    <span className="client-info-label">
                      <ExternalLink size={13} />
                      Website
                    </span>

                    <div className="client-info-value">
                      {client.website ? (
                        <a
                          href={client.website}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Visit website
                        </a>
                      ) : (
                        'Not added'
                      )}
                    </div>
                  </div>

                  <div className="client-info-box">
                    <span className="client-info-label">
                      Onboarded By
                    </span>

                    <div className="client-info-value">
                      {client.onboarded_by_name ||
                        'Not available'}
                    </div>
                  </div>

                  <div className="client-info-box">
                    <span className="client-info-label">
                      Added On
                    </span>

                    <div className="client-info-value">
                      {formatDate(
                        client.created_at
                      )}
                    </div>
                  </div>
                </div>

                <div className="client-stat-grid">
                  <div className="client-stat-box">
                    <span className="client-stat-label">
                      Job Roles
                    </span>

                    <strong className="client-stat-value">
                      {client.total_openings || 0}
                    </strong>
                  </div>

                  <div className="client-stat-box">
                    <span className="client-stat-label">
                      Active Roles
                    </span>

                    <strong className="client-stat-value">
                      {client.active_openings || 0}
                    </strong>
                  </div>

                  <div className="client-stat-box">
                    <span className="client-stat-label">
                      Closed Roles
                    </span>

                    <strong className="client-stat-value">
                      {client.closed_openings || 0}
                    </strong>
                  </div>

                  <div className="client-stat-box">
                    <span className="client-stat-label">
                      Total Positions
                    </span>

                    <strong className="client-stat-value">
                      {client.total_positions || 0}
                    </strong>
                  </div>

                  <div className="client-stat-box">
                    <span className="client-stat-label">
                      Filled
                    </span>

                    <strong className="client-stat-value">
                      {client.filled_positions || 0}
                    </strong>
                  </div>

                  <div className="client-stat-box">
                    <span className="client-stat-label">
                      Remaining
                    </span>

                    <strong className="client-stat-value">
                      {client.remaining_positions ||
                        0}
                    </strong>
                  </div>
                </div>
              </div>

              {expandedClientId === client.id && (
                <div className="client-openings">
                  <h4 className="client-openings-heading">
                    Openings for{' '}
                    {client.company_name}
                  </h4>

                  <div className="client-opening-list">
                    {openings.map((opening) => (
                      <div
                        className="client-opening-card"
                        key={opening.id}
                      >
                        <div className="client-opening-header">
                          <div>
                            <h5 className="client-opening-title">
                              {opening.title}
                            </h5>

                            <div className="client-opening-location">
                              <MapPin size={13} />

                              {opening.location ||
                                'Location not added'}
                            </div>
                          </div>

                          <div className="client-opening-badges">
                            <span
                              className={`badge badge-${String(
                                opening.priority ||
                                  'MEDIUM'
                              ).toLowerCase()}`}
                            >
                              {formatText(
                                opening.priority
                              )}
                            </span>

                            <span
                              className={`badge badge-${String(
                                opening.status ||
                                  'OPEN'
                              ).toLowerCase()}`}
                            >
                              {formatText(
                                opening.status
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="client-opening-stats">
                          <div className="client-opening-stat">
                            <span>
                              Total Positions
                            </span>

                            <strong>
                              {opening.openings_count ||
                                0}
                            </strong>
                          </div>

                          <div className="client-opening-stat">
                            <span>Filled</span>

                            <strong>
                              {opening.filled_positions ||
                                0}
                            </strong>
                          </div>

                          <div className="client-opening-stat">
                            <span>Remaining</span>

                            <strong>
                              {opening.remaining_positions ||
                                0}
                            </strong>
                          </div>

                          <div className="client-opening-stat">
                            <span>
                              Assigned Employee
                            </span>

                            <strong>
                              {opening.assigned_recruiter_name ||
                                'Not assigned'}
                            </strong>
                          </div>

                          <div className="client-opening-stat">
                            <span>
                              Target Date
                            </span>

                            <strong>
                              {formatDate(
                                opening.target_close_date
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}

                    {!openings.length && (
                      <div>
                        No openings have been added
                        for this client.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {!filteredClients.length && (
          <div className="card">
            No clients found.
          </div>
        )}
      </div>
    </>
  );
}