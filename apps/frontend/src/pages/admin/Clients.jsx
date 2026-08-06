import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Globe2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyForm = {
  companyName: '',
  gstNumber: '',
  addressLine: '',
  city: '',
  state: '',
  stateCode: '',
  postalCode: '',
  industry: '',
  website: '',
  companyEmail: '',
  companyPhone: '',
  contactPersonName: '',
  contactPersonEmail: '',
  contactPersonPhone: '',
  status: 'PROSPECT'
};

const statuses = ['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED'];

function valueOrDash(value) {
  return value || '—';
}

export default function Clients() {
  const { user } = useAuth();
  const canDelete = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
  const [clients, setClients] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/clients', {
        params: {
          search: debouncedSearch || undefined,
          status: status || undefined
        }
      });
      const list = response.data.data || [];
      setClients(
        [...list].sort((first, second) =>
          String(first.company_name || '').localeCompare(
            String(second.company_name || ''),
            'en',
            { sensitivity: 'base' }
          )
        )
      );
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load clients.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const visibleCount = useMemo(() => clients.length, [clients]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage('');
    setError('');
  }

  function openEdit(client) {
    setEditing(client);
    setExpandedId(client.id);
    setForm({
      companyName: client.company_name || '',
      gstNumber: client.gst_number || '',
      addressLine: client.address_line || '',
      city: client.city || '',
      state: client.state || '',
      stateCode: client.state_code || '',
      postalCode: client.postal_code || '',
      industry: client.industry || '',
      website: client.website || '',
      companyEmail: client.company_email || client.contact_email || '',
      companyPhone: client.company_phone || client.contact_phone || '',
      contactPersonName: client.contact_person_name || client.contact_name || '',
      contactPersonEmail: client.contact_person_email || client.contact_email || '',
      contactPersonPhone: client.contact_person_phone || client.contact_phone || '',
      status: client.status || 'PROSPECT'
    });
    setShowForm(true);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const response = editing
        ? await api.put(`/clients/${editing.id}`, form)
        : await api.post('/clients', form);
      setMessage(response.data.message);
      closeForm();
      await loadClients();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Client could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(client) {
    if (!window.confirm(`Delete ${client.company_name}?`)) return;
    try {
      const response = await api.delete(`/clients/${client.id}`);
      setMessage(response.data.message);
      if (expandedId === client.id) setExpandedId(null);
      await loadClients();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Client could not be deleted.');
    }
  }

  function toggleClient(id) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Business Relationships</p>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">
            Clients are stacked alphabetically. Click a company name to expand and view all information at once.
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          <Plus size={18} /> Add Client
        </button>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <div className="section-heading">
            <div>
              <h2>{editing ? 'Edit Client' : 'Add Client'}</h2>
              <p className="page-subtitle">
                This information automatically fills Requirements, Placements and Recruitment Invoices.
              </p>
            </div>
            <button className="icon-btn" type="button" onClick={closeForm}>
              <X size={20} />
            </button>
          </div>

          <div className="form-section-title">Company details</div>
          <div className="form-grid form-grid-3">
            <label className="form-group">
              <span>Company Name *</span>
              <input className="input" name="companyName" value={form.companyName} onChange={updateField} required />
            </label>
            <label className="form-group">
              <span>GST Number</span>
              <input
                className="input"
                name="gstNumber"
                value={form.gstNumber}
                onChange={(event) => setForm((current) => ({ ...current, gstNumber: event.target.value.toUpperCase() }))}
                maxLength={15}
                placeholder="15-character GSTIN"
              />
            </label>
            <label className="form-group">
              <span>Industry</span>
              <input className="input" name="industry" value={form.industry} onChange={updateField} />
            </label>
            <label className="form-group form-span-2">
              <span>Registered Address</span>
              <textarea className="input" rows="3" name="addressLine" value={form.addressLine} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>City</span>
              <input className="input" name="city" value={form.city} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>State</span>
              <input className="input" name="state" value={form.state} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>State Code</span>
              <input className="input" name="stateCode" value={form.stateCode} onChange={updateField} placeholder="Example: 29" />
            </label>
            <label className="form-group">
              <span>PIN Code</span>
              <input className="input" name="postalCode" value={form.postalCode} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>Website</span>
              <input className="input" name="website" value={form.website} onChange={updateField} placeholder="https://" />
            </label>
            <label className="form-group">
              <span>Company Email</span>
              <input className="input" type="email" name="companyEmail" value={form.companyEmail} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>Company Phone</span>
              <input className="input" name="companyPhone" value={form.companyPhone} onChange={updateField} />
            </label>
          </div>

          <div className="form-section-title">Primary contact</div>
          <div className="form-grid form-grid-3">
            <label className="form-group">
              <span>Contact Person Name</span>
              <input className="input" name="contactPersonName" value={form.contactPersonName} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>Contact Person Email</span>
              <input className="input" type="email" name="contactPersonEmail" value={form.contactPersonEmail} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>Contact Person Phone</span>
              <input className="input" name="contactPersonPhone" value={form.contactPersonPhone} onChange={updateField} />
            </label>
            <label className="form-group">
              <span>Client Status</span>
              <select className="input" name="status" value={form.status} onChange={updateField}>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={closeForm}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Client' : 'Save Client'}
            </button>
          </div>
        </form>
      )}

      <div className="card client-accordion-card">
        <div className="toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              value={search}
              onInput={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search company, GST, location or contact"
            />
          </div>
          <select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="btn btn-secondary" type="button" onClick={loadClients} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="client-list-heading">
          <strong>{visibleCount} Client{visibleCount === 1 ? '' : 's'}</strong>
          <span>Sorted by company name</span>
        </div>

        {!loading && !clients.length && (
          <div className="empty-state">
            <Building2 size={34} />
            <strong>No clients have been added yet.</strong>
            <span>Add a company first, then it will appear in Requirements and Invoices.</span>
          </div>
        )}

        <div className="client-accordion-list">
          {clients.map((client) => {
            const expanded = expandedId === client.id;
            const address = [client.address_line, client.city, client.state, client.postal_code]
              .filter(Boolean)
              .join(', ');

            return (
              <article className={`client-accordion-item ${expanded ? 'expanded' : ''}`} key={client.id}>
                <button className="client-accordion-trigger" type="button" onClick={() => toggleClient(client.id)}>
                  <span className="client-accordion-arrow">
                    {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </span>
                  <span className="client-accordion-avatar"><Building2 size={20} /></span>
                  <span className="client-accordion-name">
                    <strong>{client.company_name}</strong>
                    <small>{client.industry || 'Industry not provided'}</small>
                  </span>
                  <span className={`badge badge-${String(client.status).toLowerCase()}`}>{client.status}</span>
                </button>

                {expanded && (
                  <div className="client-accordion-content">
                    <div className="client-information-grid">
                      <div><span>Company Name</span><strong>{valueOrDash(client.company_name)}</strong></div>
                      <div><span>Industry</span><strong>{valueOrDash(client.industry)}</strong></div>
                      <div><span>GST Number</span><strong>{valueOrDash(client.gst_number)}</strong></div>
                      <div><span>Client Status</span><strong>{valueOrDash(client.status)}</strong></div>
                      <div className="client-info-wide"><MapPin size={17} /><span>Registered Address</span><strong>{valueOrDash(address)}</strong></div>
                      <div><span>City</span><strong>{valueOrDash(client.city)}</strong></div>
                      <div><span>State</span><strong>{valueOrDash(client.state)}</strong></div>
                      <div><span>State Code</span><strong>{valueOrDash(client.state_code)}</strong></div>
                      <div><span>PIN Code</span><strong>{valueOrDash(client.postal_code)}</strong></div>
                      <div><Mail size={17} /><span>Company Email</span><strong>{valueOrDash(client.company_email)}</strong></div>
                      <div><Phone size={17} /><span>Company Phone</span><strong>{valueOrDash(client.company_phone)}</strong></div>
                      <div><Globe2 size={17} /><span>Website</span><strong>{valueOrDash(client.website)}</strong></div>
                      <div><UserRound size={17} /><span>Contact Person</span><strong>{valueOrDash(client.contact_person_name)}</strong></div>
                      <div><Mail size={17} /><span>Contact Email</span><strong>{valueOrDash(client.contact_person_email)}</strong></div>
                      <div><Phone size={17} /><span>Contact Phone</span><strong>{valueOrDash(client.contact_person_phone)}</strong></div>
                      <div><span>Onboarded By</span><strong>{valueOrDash(client.onboarded_by_name)}</strong></div>
                      <div><span>Created</span><strong>{client.created_at ? new Date(client.created_at).toLocaleDateString('en-IN') : '—'}</strong></div>
                    </div>

                    <div className="client-accordion-metrics">
                      <div><strong>{client.active_openings || 0}</strong><span>Active Requirements</span></div>
                      <div><strong>{client.total_openings || 0}</strong><span>Total Requirements</span></div>
                      <div><strong>{client.filled_positions || 0}</strong><span>Candidates Joined</span></div>
                      <div><strong>{client.invoice_count || 0}</strong><span>Invoices</span></div>
                    </div>

                    <div className="form-actions client-accordion-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => openEdit(client)}>
                        <Pencil size={16} /> Edit Client
                      </button>
                      {canDelete && (
                        <button className="btn btn-danger" type="button" onClick={() => remove(client)}>
                          <Trash2 size={16} /> Delete Client
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
