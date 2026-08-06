import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, IndianRupee, Pencil, Plus, Printer, Search, Settings2, Trash2, WalletCards, X } from 'lucide-react';
import api from '../../services/api.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { downloadInvoicePdf, invoiceHtml, printInvoice } from '../../utils/invoicePdf.js';

const emptyForm = {
  clientId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), sacCode: '998616', placeOfSupply: '',
  gstType: 'CGST_SGST', cgstRate: '9', sgstRate: '9', igstRate: '18', status: 'PENDING', notes: '', items: []
};
const emptyPayment = { amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Bank Transfer', referenceNumber: '' };
const feeTypes = ['PERCENTAGE_CTC','PERCENTAGE_GROSS','FIXED','CUSTOM'];
const statuses = ['DRAFT','PENDING','PARTIALLY_PAID','PAID','CANCELLED'];
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const dateOnly = (value) => value ? String(value).slice(0, 10) : '';

function normaliseItem(placement) {
  return {
    placementHistoryId: placement.placement_history_id,
    candidateId: placement.candidate_id,
    candidateName: placement.candidate_name,
    designation: placement.position || '',
    location: placement.location || '',
    joiningDate: dateOnly(placement.joining_date),
    annualCtc: placement.offered_ctc || placement.ctc || '',
    grossSalary: placement.gross_salary || '',
    feeType: 'PERCENTAGE_CTC',
    feeRate: '8.33',
    taxableAmount: ''
  };
}

function itemTaxable(item) {
  if (item.feeType === 'PERCENTAGE_CTC') return Number(item.annualCtc || 0) * Number(item.feeRate || 0) / 100;
  if (item.feeType === 'PERCENTAGE_GROSS') return Number(item.grossSalary || 0) * Number(item.feeRate || 0) / 100;
  return Number(item.taxableAmount || 0);
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [reference, setReference] = useState({ settings: null, nextInvoiceNumber: '' });
  const [clients, setClients] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
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
      const response = await api.get('/invoices', { params: { search: debouncedSearch || undefined, status: status || undefined } });
      setInvoices(response.data.data || []);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load invoices.'); }
    finally { setLoading(false); }
  }, [debouncedSearch, status]);

  const loadReference = useCallback(async () => {
    const [invoiceReference, clientsResponse] = await Promise.all([api.get('/invoices/reference'), api.get('/clients')]);
    const data = invoiceReference.data.data || {};
    setReference(data); setSettings(data.settings || null); setClients(clientsResponse.data.data || []);
  }, []);

  useEffect(() => { Promise.all([loadInvoices(), loadReference()]).catch((requestError) => setError(requestError.response?.data?.message || 'Unable to load invoice information.')); }, [loadInvoices, loadReference]);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + itemTaxable(item), 0);
    const cgst = form.gstType === 'CGST_SGST' ? subtotal * Number(form.cgstRate || 0) / 100 : 0;
    const sgst = form.gstType === 'CGST_SGST' ? subtotal * Number(form.sgstRate || 0) / 100 : 0;
    const igst = form.gstType === 'IGST' ? subtotal * Number(form.igstRate || 0) / 100 : 0;
    return { subtotal, cgst, sgst, igst, total: subtotal + cgst + sgst + igst };
  }, [form]);

  const summary = useMemo(() => ({
    total: invoices.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    paid: invoices.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
    pending: invoices.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0)
  }), [invoices]);

  function setField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function openCreate() {
    const defaults = reference.settings || settings || {};
    setEditing(null);
    setForm({
      ...emptyForm,
      invoiceNumber: reference.nextInvoiceNumber || '',
      sacCode: defaults.default_sac_code || '998616',
      cgstRate: defaults.default_cgst_rate ?? 9,
      sgstRate: defaults.default_sgst_rate ?? 9,
      igstRate: defaults.default_igst_rate ?? 18
    });
    setPlacements([]); setShowForm(true); setError(''); setMessage('');
  }

  async function chooseClient(clientId) {
    const client = clients.find((item) => String(item.id) === String(clientId));
    setForm((current) => ({ ...current, clientId, placeOfSupply: current.placeOfSupply || client?.state || '' , items: [] }));
    if (!clientId) { setPlacements([]); return; }
    try {
      const response = await api.get('/candidates/placements', { params: { clientId } });
      setPlacements(response.data.data || []);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Placed candidates could not be loaded.'); }
  }

  function togglePlacement(placement) {
    setForm((current) => {
      const exists = current.items.some((item) => Number(item.placementHistoryId) === Number(placement.placement_history_id));
      return { ...current, items: exists ? current.items.filter((item) => Number(item.placementHistoryId) !== Number(placement.placement_history_id)) : [...current.items, normaliseItem(placement)] };
    });
  }

  function updateItem(index, name, value) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [name]: value } : item) }));
  }

  async function openEdit(invoice) {
    try {
      const response = await api.get(`/invoices/${invoice.id}`);
      const detail = response.data.data;
      setEditing(detail);
      setForm({
        clientId: detail.client_id, invoiceNumber: detail.invoice_number, invoiceDate: dateOnly(detail.invoice_date),
        sacCode: detail.sac_code || '998616', placeOfSupply: detail.place_of_supply || '', gstType: detail.gst_type || 'NONE',
        cgstRate: detail.cgst_rate ?? 0, sgstRate: detail.sgst_rate ?? 0, igstRate: detail.igst_rate ?? 0,
        status: detail.status || 'PENDING', notes: detail.notes || '',
        items: (detail.items || []).map((item) => ({
          placementHistoryId: item.placement_history_id, candidateId: item.candidate_id,
          candidateName: item.candidate_name_snapshot, designation: item.designation_snapshot || '',
          location: item.location_snapshot || '', joiningDate: dateOnly(item.joining_date),
          annualCtc: item.annual_ctc ?? '', grossSalary: item.gross_salary ?? '', feeType: item.fee_type,
          feeRate: item.fee_rate ?? '', taxableAmount: item.taxable_amount ?? ''
        }))
      });
      const placementsResponse = await api.get('/candidates/placements', { params: { clientId: detail.client_id } });
      setPlacements(placementsResponse.data.data || []); setShowForm(true);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Invoice could not be loaded.'); }
  }

  async function saveInvoice(event) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      const payload = { ...form, items: form.items.map((item) => ({ ...item, taxableAmount: itemTaxable(item) })) };
      const response = editing ? await api.put(`/invoices/${editing.id}`, payload) : await api.post('/invoices', payload);
      setMessage(response.data.message); setShowForm(false); setEditing(null); await Promise.all([loadInvoices(), loadReference()]);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Invoice could not be saved.'); }
    finally { setSaving(false); }
  }

  async function loadDetail(invoice) {
    const response = await api.get(`/invoices/${invoice.id}`);
    return response.data.data;
  }

  async function previewInvoice(invoice) {
    try { setPreview(await loadDetail(invoice)); } catch (requestError) { setError(requestError.response?.data?.message || 'Invoice preview could not be opened.'); }
  }
  async function download(invoice) {
    try { await downloadInvoicePdf(await loadDetail(invoice)); } catch (requestError) { setError(requestError.response?.data?.message || requestError.message || 'PDF could not be downloaded.'); }
  }
  async function print(invoice) {
    try { printInvoice(await loadDetail(invoice)); } catch (requestError) { setError(requestError.response?.data?.message || requestError.message || 'Invoice could not be printed.'); }
  }

  function previewDraft() {
    const client = clients.find((item) => String(item.id) === String(form.clientId)) || {};
    const draft = {
      invoice_number: form.invoiceNumber || 'DRAFT',
      invoice_date: form.invoiceDate,
      sac_code: form.sacCode,
      place_of_supply: form.placeOfSupply,
      gst_type: form.gstType,
      cgst_rate: Number(form.cgstRate || 0),
      sgst_rate: Number(form.sgstRate || 0),
      igst_rate: Number(form.igstRate || 0),
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      igst_amount: totals.igst,
      gst_amount: totals.cgst + totals.sgst + totals.igst,
      total_amount: totals.total,
      notes: form.notes,
      company_name: client.company_name || '',
      client_gst_number: client.gst_number || '',
      address_line: client.address_line || '',
      city: client.city || '',
      state: client.state || '',
      state_code: client.state_code || '',
      postal_code: client.postal_code || '',
      settings: reference.settings || settings || {},
      items: form.items.map((item) => ({
        candidate_name_snapshot: item.candidateName,
        designation_snapshot: item.designation,
        location_snapshot: item.location,
        joining_date: item.joiningDate,
        annual_ctc: Number(item.annualCtc || 0),
        gross_salary: Number(item.grossSalary || 0),
        fee_type: item.feeType,
        fee_rate: Number(item.feeRate || 0),
        taxable_amount: itemTaxable(item)
      }))
    };
    setPreview(draft);
  }

  async function downloadPreview() {
    try {
      await downloadInvoicePdf(preview);
    } catch (requestError) {
      setError(requestError.message || 'PDF could not be downloaded.');
    }
  }

  async function recordPayment(event) {
    event.preventDefault();
    try {
      setSaving(true); const response = await api.post(`/invoices/${paymentInvoice.id}/payments`, paymentForm);
      setMessage(response.data.message); setPaymentInvoice(null); setPaymentForm(emptyPayment); await loadInvoices();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Payment could not be recorded.'); }
    finally { setSaving(false); }
  }

  async function saveSettings(event) {
    event.preventDefault();
    try {
      setSaving(true); const payload = Object.fromEntries(Object.entries(settings).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
      const response = await api.put('/invoices/settings', payload); setSettings(response.data.data); setMessage(response.data.message); setShowSettings(false); await loadReference();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Invoice settings could not be saved.'); }
    finally { setSaving(false); }
  }

  async function cancel(invoice) {
    if (!window.confirm(`Cancel invoice ${invoice.invoice_number}?`)) return;
    try { const response = await api.patch(`/invoices/${invoice.id}/cancel`); setMessage(response.data.message); await loadInvoices(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Invoice could not be cancelled.'); }
  }
  async function remove(invoice) {
    if (!window.confirm(`Delete invoice ${invoice.invoice_number}?`)) return;
    try { const response = await api.delete(`/invoices/${invoice.id}`); setMessage(response.data.message); await loadInvoices(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Invoice could not be deleted.'); }
  }

  return <div className="module-page">
    <div className="page-heading-row"><div><p className="eyebrow">Recruitment Billing</p><h1 className="page-title">Recruitment Invoices</h1><p className="page-subtitle">Generate, preview, download and print candidate-placement tax invoices.</p></div><div className="row-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowSettings(true)}><Settings2 size={18}/> Invoice Settings</button><button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={18}/> Create Invoice</button></div></div>
    {message && <div className="message message-success">{message}</div>}{error && <div className="message message-error">{error}</div>}
    <div className="summary-grid summary-grid-3"><div className="summary-card"><FileText size={20}/><span>Total Invoiced</span><strong>{money(summary.total)}</strong></div><div className="summary-card success"><WalletCards size={20}/><span>Received</span><strong>{money(summary.paid)}</strong></div><div className="summary-card warning"><IndianRupee size={20}/><span>Outstanding</span><strong>{money(summary.pending)}</strong></div></div>

    {showForm && <form className="card form-card" onSubmit={saveInvoice}><div className="section-heading"><div><h2>{editing ? 'Edit Recruitment Invoice' : 'Create Recruitment Invoice'}</h2><p className="page-subtitle">Select the client first, then choose one or more candidates placed with that client.</p></div><button className="icon-btn" type="button" onClick={() => setShowForm(false)}><X size={20}/></button></div>
      <div className="form-grid form-grid-3"><label className="form-group"><span>Client Company *</span><select className="input" value={form.clientId} onChange={(event) => chooseClient(event.target.value)} required><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></label><label className="form-group"><span>Invoice Number *</span><input className="input" name="invoiceNumber" value={form.invoiceNumber} onChange={setField} required /></label><label className="form-group"><span>Invoice Date *</span><input className="input" type="date" name="invoiceDate" value={form.invoiceDate} onChange={setField} required /></label><label className="form-group"><span>SAC Code</span><input className="input" name="sacCode" value={form.sacCode} onChange={setField} /></label><label className="form-group"><span>Place of Supply</span><input className="input" name="placeOfSupply" value={form.placeOfSupply} onChange={setField} /></label><label className="form-group"><span>GST Type</span><select className="input" name="gstType" value={form.gstType} onChange={setField}><option value="NONE">No GST</option><option value="CGST_SGST">CGST + SGST</option><option value="IGST">IGST</option></select></label>{form.gstType === 'CGST_SGST' && <><label className="form-group"><span>CGST %</span><input className="input" type="number" step="0.001" name="cgstRate" value={form.cgstRate} onChange={setField} /></label><label className="form-group"><span>SGST %</span><input className="input" type="number" step="0.001" name="sgstRate" value={form.sgstRate} onChange={setField} /></label></>}{form.gstType === 'IGST' && <label className="form-group"><span>IGST %</span><input className="input" type="number" step="0.001" name="igstRate" value={form.igstRate} onChange={setField} /></label>}<label className="form-group"><span>Status</span><select className="input" name="status" value={form.status} onChange={setField}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label></div>
      <div className="invoice-placement-picker"><h3>Placed Candidates</h3>{!form.clientId ? <p className="empty-copy">Select a client to load placed candidates.</p> : placements.length === 0 ? <p className="empty-copy">No joined/active placement is recorded for this client. Add placement history first.</p> : placements.map((placement) => <label className="placement-option" key={placement.placement_history_id}><input type="checkbox" checked={form.items.some((item) => Number(item.placementHistoryId) === Number(placement.placement_history_id))} onChange={() => togglePlacement(placement)} /><span><strong>{placement.candidate_name}</strong><small>{placement.position} · Joined {dateOnly(placement.joining_date) || '—'} · {money(placement.offered_ctc || placement.ctc)}</small></span></label>)}</div>
      {form.items.length > 0 && <div className="invoice-items-editor"><h3>Recruitment Fee Calculation</h3>{form.items.map((item, index) => <div className="invoice-item-row" key={item.placementHistoryId || index}><div><strong>{item.candidateName}</strong><small>{item.designation} · {item.location}</small></div><select className="input" value={item.feeType} onChange={(event) => updateItem(index, 'feeType', event.target.value)}>{feeTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select>{item.feeType.startsWith('PERCENTAGE') ? <input className="input" type="number" step="0.001" value={item.feeRate} onChange={(event) => updateItem(index, 'feeRate', event.target.value)} placeholder="Fee %" /> : <input className="input" type="number" min="0" value={item.taxableAmount} onChange={(event) => updateItem(index, 'taxableAmount', event.target.value)} placeholder="Fee amount" />}<strong>{money(itemTaxable(item))}</strong></div>)}</div>}
      <label className="form-group"><span>Notes / Replacement Terms</span><textarea className="input" name="notes" value={form.notes} onChange={setField} rows="3" /></label>
      <div className="invoice-calculation"><div><span>Recruitment Service Value</span><strong>{money(totals.subtotal)}</strong></div>{form.gstType === 'CGST_SGST' && <><div><span>CGST</span><strong>{money(totals.cgst)}</strong></div><div><span>SGST</span><strong>{money(totals.sgst)}</strong></div></>}{form.gstType === 'IGST' && <div><span>IGST</span><strong>{money(totals.igst)}</strong></div>}<div className="invoice-total"><span>Grand Total</span><strong>{money(totals.total)}</strong></div></div>
      <div className="form-actions"><button className="btn btn-primary" disabled={saving || form.items.length === 0}>{saving ? 'Saving...' : 'Save Invoice'}</button><button className="btn btn-secondary" type="button" disabled={!form.clientId || !form.invoiceNumber || form.items.length === 0} onClick={previewDraft}><Eye size={17}/> Preview Invoice</button><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
    </form>}

    <div className="card toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, client or candidate" /></div><select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All Statuses</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>
    <div className="card table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Client / Candidates</th><th>Date</th><th>Total</th><th>Paid / Pending</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan="7">Loading invoices...</td></tr> : invoices.length === 0 ? <tr><td colSpan="7">No invoices found.</td></tr> : invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number}</strong><small>SAC {invoice.sac_code}</small></td><td><strong>{invoice.company_name}</strong><small>{invoice.candidate_names || 'No candidates'}</small></td><td>{dateOnly(invoice.invoice_date)}</td><td>{money(invoice.total_amount)}</td><td>{money(invoice.paid_amount)} / {money(invoice.pending_amount)}</td><td><span className={`status-badge status-${String(invoice.status).toLowerCase()}`}>{label(invoice.status)}</span></td><td><div className="row-actions"><button className="icon-btn" title="Preview" onClick={() => previewInvoice(invoice)}><Eye size={16}/></button><button className="icon-btn" title="Download PDF" onClick={() => download(invoice)}><Download size={16}/></button><button className="icon-btn" title="Print" onClick={() => print(invoice)}><Printer size={16}/></button>{!['PAID','CANCELLED'].includes(invoice.status) && <button className="icon-btn" title="Edit" onClick={() => openEdit(invoice)}><Pencil size={16}/></button>}{Number(invoice.pending_amount) > 0 && invoice.status !== 'CANCELLED' && <button className="btn btn-secondary btn-small" onClick={() => { setPaymentInvoice(invoice); setPaymentForm({ ...emptyPayment, amount: invoice.pending_amount }); }}>Payment</button>}{Number(invoice.paid_amount || 0) === 0 && invoice.status !== 'CANCELLED' && <button className="icon-btn danger" title="Delete" onClick={() => remove(invoice)}><Trash2 size={16}/></button>}{Number(invoice.paid_amount || 0) === 0 && invoice.status !== 'CANCELLED' && <button className="btn btn-secondary btn-small" onClick={() => cancel(invoice)}>Cancel</button>}</div></td></tr>)}</tbody></table></div>

    {preview && <div className="modal-overlay"><div className="modal-card invoice-preview-modal"><div className="section-heading"><h2>Invoice Preview</h2><button className="icon-btn" onClick={() => setPreview(null)}><X size={20}/></button></div><iframe className="invoice-preview-frame" title="Invoice preview" srcDoc={invoiceHtml(preview)} /><div className="form-actions"><button className="btn btn-primary" onClick={downloadPreview}><Download size={17}/> Download PDF</button><button className="btn btn-secondary" onClick={() => printInvoice(preview)}><Printer size={17}/> Print</button></div></div></div>}

    {paymentInvoice && <div className="modal-overlay"><form className="modal-card" onSubmit={recordPayment}><div className="section-heading"><h2>Record Payment</h2><button className="icon-btn" type="button" onClick={() => setPaymentInvoice(null)}><X size={20}/></button></div><p>{paymentInvoice.invoice_number} · Pending {money(paymentInvoice.pending_amount)}</p><label className="form-group"><span>Amount</span><input className="input" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} required /></label><label className="form-group"><span>Payment Date</span><input className="input" type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} required /></label><label className="form-group"><span>Method</span><input className="input" value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentMethod: event.target.value }))} /></label><label className="form-group"><span>Reference Number</span><input className="input" value={paymentForm.referenceNumber} onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNumber: event.target.value }))} /></label><button className="btn btn-primary" disabled={saving}>Save Payment</button></form></div>}

    {showSettings && settings && <div className="modal-overlay"><form className="modal-card modal-wide" onSubmit={saveSettings}><div className="section-heading"><div><h2>Invoice Company & Bank Settings</h2><p className="page-subtitle">These details appear on every downloaded and printed invoice.</p></div><button className="icon-btn" type="button" onClick={() => setShowSettings(false)}><X size={20}/></button></div><div className="form-grid form-grid-3">{[['legal_name','Company Legal Name'],['gst_number','SRSB GST Number'],['email','Email'],['phone','Phone'],['default_sac_code','Default SAC'],['default_cgst_rate','Default CGST %'],['default_sgst_rate','Default SGST %'],['default_igst_rate','Default IGST %'],['invoice_prefix','Invoice Prefix'],['bank_account_name','Bank Account Name'],['bank_account_number','Bank Account Number'],['bank_ifsc','IFSC'],['bank_name','Bank Name'],['bank_branch','Branch'],['authorised_signatory','Authorised Signatory']].map(([key, title]) => <label className="form-group" key={key}><span>{title}</span><input className="input" value={settings[key] || ''} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label className="form-group form-span-3"><span>Registered Address</span><textarea className="input" rows="3" value={settings.registered_address || ''} onChange={(event) => setSettings((current) => ({ ...current, registered_address: event.target.value }))} /></label></div><button className="btn btn-primary" disabled={saving}>Save Invoice Settings</button></form></div>}
  </div>;
}
