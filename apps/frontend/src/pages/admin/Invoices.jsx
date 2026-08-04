import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, IndianRupee, Pencil, Plus, Search, Trash2, WalletCards, X } from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyForm = {
  clientId: '',
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  serviceCharges: '',
  gstType: 'NONE',
  igstAmount: '',
  cgstAmount: '',
  sgstAmount: '',
  paymentReleased: false,
  paidAmount: '',
  paymentDate: '',
  paymentMethod: '',
  referenceNumber: '',
  status: 'PENDING',
  notes: '',
  gstFile: null
};

const statuses = ['DRAFT','PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'];

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN') : '—';
}

async function fileToPayload(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error('GST file must be 5 MB or smaller.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, data };
}

export default function Invoices() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Bank Transfer', referenceNumber: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/invoices', { params: { search: debouncedSearch || undefined, status: status || undefined } });
      setInvoices(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load invoices.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  const loadClients = useCallback(async () => {
    const response = await api.get('/clients');
    setClients(response.data.data || []);
  }, []);

  useEffect(() => {
    Promise.all([loadInvoices(), loadClients()]).catch((requestError) => setError(requestError.response?.data?.message || 'Unable to load invoice information.'));
  }, [loadInvoices, loadClients]);

  const totals = useMemo(() => {
    const service = Number(form.serviceCharges || 0);
    const igst = form.gstType === 'IGST' ? Number(form.igstAmount || 0) : 0;
    const cgst = form.gstType === 'CGST_SGST' ? Number(form.cgstAmount || 0) : 0;
    const sgst = form.gstType === 'CGST_SGST' ? Number(form.sgstAmount || 0) : 0;
    return { service, tax: igst + cgst + sgst, total: service + igst + cgst + sgst };
  }, [form]);

  const summary = useMemo(() => ({
    total: invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
    paid: invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0),
    pending: invoices.reduce((sum, invoice) => sum + Number(invoice.pending_amount || 0), 0)
  }), [invoices]);

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, invoiceNumber: `SRSB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}` });
    setShowForm(true);
    setMessage('');
    setError('');
  }

  async function openEdit(invoice) {
    try {
      const response = await api.get(`/invoices/${invoice.id}`);
      const detail = response.data.data;
      setEditing(detail);
      setForm({
        clientId: detail.client_id || '',
        invoiceNumber: detail.invoice_number || '',
        invoiceDate: detail.invoice_date ? String(detail.invoice_date).slice(0, 10) : '',
        dueDate: detail.due_date ? String(detail.due_date).slice(0, 10) : '',
        serviceCharges: detail.service_charges ?? detail.subtotal ?? '',
        gstType: detail.gst_type || 'NONE',
        igstAmount: detail.igst_amount ?? '',
        cgstAmount: detail.cgst_amount ?? '',
        sgstAmount: detail.sgst_amount ?? '',
        paymentReleased: Boolean(detail.payment_released),
        paidAmount: detail.paid_amount ?? '',
        paymentDate: detail.payment_date ? String(detail.payment_date).slice(0, 10) : '',
        paymentMethod: '',
        referenceNumber: '',
        status: detail.status || 'PENDING',
        notes: detail.notes || '',
        gstFile: null
      });
      setShowForm(true);
      setError('');
      setMessage('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice details could not be loaded.');
    }
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const gstFile = await fileToPayload(form.gstFile);
      const payload = { ...form, gstFile };
      const response = editing
        ? await api.put(`/invoices/${editing.id}`, payload)
        : await api.post('/invoices', payload);
      setMessage(response.data.message);
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Invoice could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment(event) {
    event.preventDefault();
    try {
      setSaving(true);
      const response = await api.post(`/invoices/${paymentInvoice.id}/payments`, paymentForm);
      setMessage(response.data.message);
      setPaymentInvoice(null);
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Payment could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  async function downloadFile(invoice) {
    try {
      const response = await api.get(`/invoices/${invoice.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = invoice.gst_file_name || `invoice-${invoice.invoice_number}-gst-file`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'GST file could not be downloaded.');
    }
  }

  async function remove(invoice) {
    if (!window.confirm(`Delete invoice ${invoice.invoice_number}?`)) return;
    try {
      const response = await api.delete(`/invoices/${invoice.id}`);
      setMessage(response.data.message);
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice could not be deleted.');
    }
  }

  return (
    <div className="module-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">Finance & Billing</p><h1 className="page-title">Invoices</h1><p className="page-subtitle">Create GST invoices, record released payments and track outstanding service charges.</p></div>
        {canManage && <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={18} /> Create Invoice</button>}
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      <div className="summary-grid summary-grid-3">
        <div className="summary-card"><FileText size={20} /><span>Total Invoiced</span><strong>{formatMoney(summary.total)}</strong></div>
        <div className="summary-card success"><WalletCards size={20} /><span>Payment Received</span><strong>{formatMoney(summary.paid)}</strong></div>
        <div className="summary-card warning"><IndianRupee size={20} /><span>Outstanding</span><strong>{formatMoney(summary.pending)}</strong></div>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <div className="section-heading"><div><h2>{editing ? 'Edit Invoice' : 'Create Invoice'}</h2><p className="page-subtitle">Use either IGST or CGST + SGST. Both systems cannot be applied together.</p></div><button className="icon-btn" type="button" onClick={() => setShowForm(false)}><X size={20} /></button></div>
          <div className="form-grid form-grid-3">
            <label className="form-group"><span>Company *</span><select className="input" name="clientId" value={form.clientId} onChange={updateField} required><option value="">Select company</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}{client.gst_number ? ` — ${client.gst_number}` : ''}</option>)}</select></label>
            <label className="form-group"><span>Invoice Number *</span><input className="input" name="invoiceNumber" value={form.invoiceNumber} onChange={updateField} required /></label>
            <label className="form-group"><span>Invoice Date *</span><input className="input" type="date" name="invoiceDate" value={form.invoiceDate} onChange={updateField} required /></label>
            <label className="form-group"><span>Due Date</span><input className="input" type="date" name="dueDate" value={form.dueDate} onChange={updateField} /></label>
            <label className="form-group"><span>Service Charges *</span><input className="input" type="number" min="0" step="0.01" name="serviceCharges" value={form.serviceCharges} onChange={updateField} required /></label>
            <label className="form-group"><span>GST Type</span><select className="input" name="gstType" value={form.gstType} onChange={updateField}><option value="NONE">No GST</option><option value="IGST">IGST</option><option value="CGST_SGST">CGST + SGST</option></select></label>
            {form.gstType === 'IGST' && <label className="form-group"><span>IGST Amount</span><input className="input" type="number" min="0" step="0.01" name="igstAmount" value={form.igstAmount} onChange={updateField} /></label>}
            {form.gstType === 'CGST_SGST' && <><label className="form-group"><span>CGST Amount</span><input className="input" type="number" min="0" step="0.01" name="cgstAmount" value={form.cgstAmount} onChange={updateField} /></label><label className="form-group"><span>SGST Amount</span><input className="input" type="number" min="0" step="0.01" name="sgstAmount" value={form.sgstAmount} onChange={updateField} /></label></>}
            <label className="form-group"><span>GST / Supporting File</span><input className="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(event) => setForm((current) => ({ ...current, gstFile: event.target.files?.[0] || null }))} /></label>
            {!editing && <label className="form-group checkbox-field"><input type="checkbox" name="paymentReleased" checked={form.paymentReleased} onChange={updateField} /><span>Initial payment received</span></label>}
            {!editing && form.paymentReleased && <><label className="form-group"><span>Paid Amount</span><input className="input" type="number" min="0" max={totals.total || undefined} step="0.01" name="paidAmount" value={form.paidAmount} onChange={updateField} required /></label><label className="form-group"><span>Payment Date</span><input className="input" type="date" name="paymentDate" value={form.paymentDate} onChange={updateField} required /></label></>}
            {editing && <div className="form-group form-span-2"><span>Payment Tracking</span><div className="field-help">Use the wallet button in the invoice table to record payments. Existing payment history is protected from direct editing.</div></div>}
            <label className="form-group form-span-2"><span>Notes</span><textarea className="input" rows="3" name="notes" value={form.notes} onChange={updateField} /></label>
          </div>
          <div className="invoice-calculation"><div><span>Service Charges</span><strong>{formatMoney(totals.service)}</strong></div><div><span>Total GST</span><strong>{formatMoney(totals.tax)}</strong></div><div className="invoice-total"><span>Invoice Total</span><strong>{formatMoney(totals.total)}</strong></div></div>
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Invoice' : 'Create Invoice'}</button></div>
        </form>
      )}

      <div className="card">
        <div className="toolbar"><div className="search-box"><Search size={18} /><input value={search} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Search invoice number, company or GST" /></div><select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select><button className="btn btn-secondary" type="button" onClick={loadInvoices} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
        <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Company</th><th>Date</th><th>Tax</th><th>Total</th><th>Paid</th><th>Pending</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {!loading && !invoices.length && <tr><td colSpan="9"><div className="empty-state">No invoices found.</div></td></tr>}
          {invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number}</strong>{invoice.gst_file_name && <div className="cell-muted">File: {invoice.gst_file_name}</div>}</td><td>{invoice.company_name}<div className="cell-muted">{invoice.gst_number || 'GST not added'}</div></td><td>{formatDate(invoice.invoice_date)}</td><td>{invoice.gst_type?.replaceAll('_', ' + ')}</td><td>{formatMoney(invoice.total_amount)}</td><td>{formatMoney(invoice.paid_amount)}</td><td>{formatMoney(invoice.pending_amount)}</td><td><span className={`badge badge-${String(invoice.status).toLowerCase()}`}>{invoice.status.replaceAll('_', ' ')}</span></td><td><div className="row-actions">{canManage && <button className="icon-btn" type="button" onClick={() => openEdit(invoice)} title="Edit"><Pencil size={16} /></button>}{canManage && <button className="icon-btn" type="button" onClick={() => { setPaymentInvoice(invoice); setPaymentForm((current) => ({ ...current, amount: invoice.pending_amount || '' })); }} title="Record payment"><WalletCards size={16} /></button>}{invoice.has_gst_file && <button className="icon-btn" type="button" onClick={() => downloadFile(invoice)} title="Download GST file"><Download size={16} /></button>}{canManage && <button className="icon-btn danger" type="button" onClick={() => remove(invoice)} title="Delete"><Trash2 size={16} /></button>}</div></td></tr>)}
        </tbody></table></div>
      </div>

      {paymentInvoice && <div className="modal-overlay"><form className="modal-card" onSubmit={recordPayment}><div className="section-heading"><div><h2>Record Payment</h2><p className="page-subtitle">{paymentInvoice.invoice_number} · {paymentInvoice.company_name}</p></div><button className="icon-btn" type="button" onClick={() => setPaymentInvoice(null)}><X size={20} /></button></div><label className="form-group"><span>Amount *</span><input className="input" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} required /></label><label className="form-group"><span>Payment Date *</span><input className="input" type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} required /></label><label className="form-group"><span>Payment Method</span><input className="input" value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentMethod: event.target.value }))} /></label><label className="form-group"><span>Reference Number</span><input className="input" value={paymentForm.referenceNumber} onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNumber: event.target.value }))} /></label><div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setPaymentInvoice(null)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button></div></form></div>}
    </div>
  );
}
