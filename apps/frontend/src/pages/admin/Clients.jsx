import { useCallback, useEffect, useState } from 'react';
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyForm = {
  companyName: '',
  gstNumber: '',
  addressLine: '',
  city: '',
  state: '',
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

export default function Clients() {
  const { user } = useAuth();
  const canDelete = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
  const [clients, setClients] = useState([]);
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
      setClients(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load clients.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

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
    setForm({
      companyName: client.company_name || '',
      gstNumber: client.gst_number || '',
      addressLine: client.address_line || '',
      city: client.city || '',
      state: client.state || '',
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
      await loadClients();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Client could not be deleted.');
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Business Relationships</p>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Maintain company, GST, address and contact-person information in one place.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={18} /> Add Client</button>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <div className="section-heading">
            <div><h2>{editing ? 'Edit Client' : 'Add Client'}</h2><p className="page-subtitle">This company will be selectable in Requirements, Candidate History and Invoices.</p></div>
            <button className="icon-btn" type="button" onClick={closeForm}><X size={20} /></button>
          </div>

          <div className="form-section-title">Company details</div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Company Name *</span><input className="input" name="companyName" value={form.companyName} onChange={updateField} required /></label>
            <label className="form-group"><span>GST Number</span><input className="input" name="gstNumber" value={form.gstNumber} onChange={(event) => setForm((current) => ({ ...current, gstNumber: event.target.value.toUpperCase() }))} maxLength={15} placeholder="15-character GSTIN" /></label>
            <label className="form-group"><span>Industry</span><input className="input" name="industry" value={form.industry} onChange={updateField} /></label>
            <label className="form-group form-span-2"><span>Registered Address</span><textarea className="input" rows="3" name="addressLine" value={form.addressLine} onChange={updateField} /></label>
            <label className="form-group"><span>City</span><input className="input" name="city" value={form.city} onChange={updateField} /></label>
            <label className="form-group"><span>State</span><input className="input" name="state" value={form.state} onChange={updateField} /></label>
            <label className="form-group"><span>PIN Code</span><input className="input" name="postalCode" value={form.postalCode} onChange={updateField} /></label>
            <label className="form-group"><span>Website</span><input className="input" name="website" value={form.website} onChange={updateField} placeholder="https://" /></label>
            <label className="form-group"><span>Company Email</span><input className="input" type="email" name="companyEmail" value={form.companyEmail} onChange={updateField} /></label>
            <label className="form-group"><span>Company Phone</span><input className="input" name="companyPhone" value={form.companyPhone} onChange={updateField} /></label>
          </div>

          <div className="form-section-title">Primary contact</div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Contact Person Name</span><input className="input" name="contactPersonName" value={form.contactPersonName} onChange={updateField} /></label>
            <label className="form-group"><span>Contact Person Email</span><input className="input" type="email" name="contactPersonEmail" value={form.contactPersonEmail} onChange={updateField} /></label>
            <label className="form-group"><span>Contact Person Phone</span><input className="input" name="contactPersonPhone" value={form.contactPersonPhone} onChange={updateField} /></label>
            <label className="form-group"><span>Client Status</span><select className="input" name="status" value={form.status} onChange={updateField}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>

          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={closeForm}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Client' : 'Save Client'}</button></div>
        </form>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="search-box"><Search size={18} /><input value={search} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Search company, GST, location or contact" /></div>
          <select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button className="btn btn-secondary" type="button" onClick={loadClients} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>

        {!loading && !clients.length && <div className="empty-state"><Building2 size={34} /><strong>No clients have been added yet.</strong><span>Add a company first, then it will appear in the Client / Brand dropdown.</span></div>}
        <div className="client-grid">
          {clients.map((client) => (
            <article className="client-card-modern" key={client.id}>
              <div className="client-card-top"><div className="client-avatar"><Building2 size={22} /></div><div><h3>{client.company_name}</h3><p>{client.industry || 'Industry not provided'}</p></div><span className={`badge badge-${String(client.status).toLowerCase()}`}>{client.status}</span></div>
              <div className="client-detail-list">
                <div><span>GST</span><strong>{client.gst_number || 'Not added'}</strong></div>
                <div><MapPin size={16} /><span>{[client.address_line, client.city, client.state, client.postal_code].filter(Boolean).join(', ') || 'Address not added'}</span></div>
                <div><Mail size={16} /><span>{client.company_email || 'Company email not added'}</span></div>
                <div><Phone size={16} /><span>{client.company_phone || 'Company phone not added'}</span></div>
                <div><UserRound size={16} /><span>{client.contact_person_name || 'Contact person not added'}</span></div>
              </div>
              <div className="client-metrics"><div><strong>{client.active_openings}</strong><span>Active requirements</span></div><div><strong>{client.filled_positions}</strong><span>Joined</span></div><div><strong>{client.invoice_count}</strong><span>Invoices</span></div></div>
              <div className="card-actions"><button className="btn btn-secondary" type="button" onClick={() => openEdit(client)}><Pencil size={16} /> Edit</button>{canDelete && <button className="icon-btn danger" type="button" onClick={() => remove(client)}><Trash2 size={17} /></button>}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
