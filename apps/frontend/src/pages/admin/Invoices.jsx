import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  IndianRupee,
  Pencil,
  Plus,
  Search,
  Trash2,
  WalletCards,
  X
} from 'lucide-react';
import api from '../../services/api.js';
import { indiaDateValue } from '../../utils/indiaTime.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import {
  downloadInvoicePdf,
  invoiceHtml
} from '../../utils/invoicePdf.js';
import { useCompany } from '../../context/CompanyContext.jsx';

const emptyForm = {
  clientId: '',
  invoiceNumber: '',
  invoiceDate: indiaDateValue(),
  gstType: 'IGST',
  cgstRate: '9',
  sgstRate: '9',
  igstRate: '18',
  status: 'PENDING',
  items: []
};

const newPaymentForm = () => ({
  amount: '',
  paymentDate: indiaDateValue(),
  paymentMethod: 'Bank Transfer',
  referenceNumber: ''
});

const statuses = ['DRAFT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'SUCCESS', 'RECEIVED', 'FAILED', 'CANCELLED'];

const label = (value) => {
  const raw = String(value || '').toUpperCase();
  if (raw === 'PAID' || raw === 'SUCCESS' || raw === 'RECEIVED') return 'Received';
  if (raw === 'FAILED') return 'Failed';
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
}).format(Number(value || 0));

const dateOnly = (value) => value ? String(value).slice(0, 10) : '';

function normaliseItem(placement) {
  return {
    placementHistoryId: placement.placement_history_id,
    candidateId: placement.candidate_id,
    candidateName: placement.candidate_name || '',
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
  return Number(item.annualCtc || 0) * Number(item.feeRate || 0) / 100;
}

export default function Invoices() {
  const { invoiceProfile } = useCompany();
  const [invoices, setInvoices] = useState([]);
  const [reference, setReference] = useState({ nextInvoiceNumber: '' });
  const [clients, setClients] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState(newPaymentForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/invoices', {
        params: {
          search: debouncedSearch || undefined,
          status: status || undefined
        }
      });
      setInvoices(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load invoices.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  const loadReference = useCallback(async () => {
    const [invoiceReference, clientsResponse] = await Promise.all([
      api.get('/invoices/reference'),
      api.get('/clients')
    ]);
    setReference(invoiceReference.data.data || { nextInvoiceNumber: '' });
    setClients(
      [...(clientsResponse.data.data || [])].sort((first, second) =>
        String(first.company_name || '').localeCompare(String(second.company_name || ''), 'en', { sensitivity: 'base' })
      )
    );
  }, []);

  useEffect(() => {
    Promise.all([loadInvoices(), loadReference()]).catch((requestError) => {
      setError(requestError.response?.data?.message || 'Unable to load invoice information.');
    });
  }, [loadInvoices, loadReference]);

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === String(form.clientId)) || null,
    [clients, form.clientId]
  );

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + itemTaxable(item), 0);
    const cgst = form.gstType === 'CGST_SGST'
      ? subtotal * Number(form.cgstRate || 0) / 100
      : 0;
    const sgst = form.gstType === 'CGST_SGST'
      ? subtotal * Number(form.sgstRate || 0) / 100
      : 0;
    const igst = form.gstType === 'IGST'
      ? subtotal * Number(form.igstRate || 0) / 100
      : 0;
    return {
      subtotal,
      cgst,
      sgst,
      igst,
      total: subtotal + cgst + sgst + igst
    };
  }, [form.items, form.gstType, form.cgstRate, form.sgstRate, form.igstRate]);

  const summary = useMemo(() => ({
    invoiced: invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
    received: invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0),
    outstanding: invoices.reduce((sum, invoice) => sum + Number(invoice.pending_amount || 0), 0)
  }), [invoices]);

  const editingPaymentSummary = useMemo(() => {
    if (!editing) return null;

    const invoiceTotal = Number(editing.total_amount || 0);
    const alreadyPaid = Number(editing.paid_amount || 0);
    const outstanding = Math.max(invoiceTotal - alreadyPaid, 0);
    const amountNow = Math.max(Number(paymentForm.amount || 0), 0);
    const afterPaid = Math.min(alreadyPaid + amountNow, invoiceTotal);
    const afterOutstanding = Math.max(invoiceTotal - afterPaid, 0);

    return {
      invoiceTotal,
      alreadyPaid,
      outstanding,
      afterPaid,
      afterOutstanding,
      afterStatus:
        amountNow <= 0
          ? label(editing.status)
          : afterOutstanding <= 0
            ? 'Received'
            : 'Partially Paid'
    };
  }, [editing, paymentForm.amount]);

  function setField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function openCreate() {
    setEditing(null);
    setPaymentForm(newPaymentForm());
    setPlacements([]);
    setForm({
      ...emptyForm,
      invoiceNumber: reference.nextInvoiceNumber || '',
      invoiceDate: indiaDateValue()
    });
    setShowForm(true);
    setMessage('');
    setError('');
  }

  async function chooseClient(clientId) {
    setForm((current) => ({ ...current, clientId, items: [] }));
    setPlacements([]);
    if (!clientId) return;
    try {
      const response = await api.get('/candidates/placements', {
        params: { clientId }
      });
      setPlacements(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Placed candidates could not be loaded.');
    }
  }

  function togglePlacement(placement) {
    setForm((current) => {
      const exists = current.items.some(
        (item) => Number(item.placementHistoryId) === Number(placement.placement_history_id)
      );
      return {
        ...current,
        items: exists
          ? current.items.filter(
              (item) => Number(item.placementHistoryId) !== Number(placement.placement_history_id)
            )
          : [...current.items, normaliseItem(placement)]
      };
    });
  }

  function updateItem(index, name, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [name]: value } : item
      )
    }));
  }

  async function openEdit(invoice) {
    try {
      setError('');
      const response = await api.get(`/invoices/${invoice.id}`);
      const detail = response.data.data;
      setEditing(detail);
      setPaymentForm(newPaymentForm());
      setForm({
        clientId: String(detail.client_id || ''),
        invoiceNumber: detail.invoice_number || '',
        invoiceDate: dateOnly(detail.invoice_date),
        gstType: detail.gst_type || 'IGST',
        cgstRate: String(detail.cgst_rate ?? 9),
        sgstRate: String(detail.sgst_rate ?? 9),
        igstRate: String(detail.igst_rate ?? 18),
        status: detail.status || 'PENDING',
        items: (detail.items || []).map((item) => ({
          placementHistoryId: item.placement_history_id,
          candidateId: item.candidate_id,
          candidateName: item.candidate_name_snapshot || '',
          designation: item.designation_snapshot || '',
          location: item.location_snapshot || '',
          joiningDate: dateOnly(item.joining_date),
          annualCtc: item.annual_ctc || '',
          grossSalary: item.gross_salary || '',
          feeType: 'PERCENTAGE_CTC',
          feeRate: item.fee_rate || '8.33',
          taxableAmount: item.taxable_amount || ''
        }))
      });
      const placementsResponse = await api.get('/candidates/placements', {
        params: { clientId: detail.client_id }
      });
      setPlacements(placementsResponse.data.data || []);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice could not be opened for editing.');
    }
  }

  async function saveInvoice(event) {
    event.preventDefault();
    if (!form.items.length) {
      setError('Select at least one placed candidate.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        ...form,
        sacCode: invoiceProfile.sacCode,
        placeOfSupply: '',
        notes: '',
        items: form.items.map((item) => ({
          ...item,
          feeType: 'PERCENTAGE_CTC',
          taxableAmount: itemTaxable(item)
        }))
      };
      const response = editing
        ? await api.put(`/invoices/${editing.id}`, payload)
        : await api.post('/invoices', payload);
      setMessage(response.data.message);
      setShowForm(false);
      setEditing(null);
      await Promise.all([loadInvoices(), loadReference()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function loadDetail(invoice) {
    const response = await api.get(`/invoices/${invoice.id}`);
    return response.data.data;
  }

  async function recordInvoicePayment() {
    if (!editing || !editingPaymentSummary) return;

    const amount = Number(paymentForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an Amount Received greater than zero.');
      return;
    }
    if (amount > editingPaymentSummary.outstanding) {
      setError(
        `Amount Received cannot exceed the outstanding amount of ${money(
          editingPaymentSummary.outstanding
        )}.`
      );
      return;
    }
    if (!paymentForm.paymentDate) {
      setError('Payment Date is required.');
      return;
    }

    try {
      setPaymentSaving(true);
      setError('');

      const response = await api.post(`/invoices/${editing.id}/payments`, {
        amount,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        referenceNumber: paymentForm.referenceNumber
      });

      const refreshed = await api.get(`/invoices/${editing.id}`);
      const detail = refreshed.data.data;
      setEditing(detail);
      setForm((current) => ({ ...current, status: detail.status || current.status }));
      setPaymentForm(newPaymentForm());
      setMessage(response.data.message || 'Payment recorded successfully.');
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Payment could not be recorded.');
    } finally {
      setPaymentSaving(false);
    }
  }

  async function previewInvoice(invoice) {
    try {
      setPreview(await loadDetail(invoice));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice preview could not be loaded.');
    }
  }

  async function download(invoice) {
    try {
      await downloadInvoicePdf(await loadDetail(invoice), invoiceProfile);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice PDF could not be downloaded.');
    }
  }
function previewDraft() {
    const client = selectedClient || {};
    setPreview({
      invoice_number: form.invoiceNumber,
      invoice_date: form.invoiceDate,
      company_name: client.company_name,
      client_gst_number: client.gst_number,
      address_line: client.address_line,
      city: client.city,
      state: client.state,
      state_code: invoiceProfile.stateCode,
      postal_code: client.postal_code,
      sac_code: invoiceProfile.sacCode,
      gst_type: form.gstType,
      cgst_rate: Number(form.cgstRate || 0),
      sgst_rate: Number(form.sgstRate || 0),
      igst_rate: Number(form.igstRate || 0),
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      igst_amount: totals.igst,
      total_amount: totals.total,
      items: form.items.map((item) => ({
        candidate_name_snapshot: item.candidateName,
        designation_snapshot: item.designation,
        location_snapshot: item.location,
        joining_date: item.joiningDate,
        annual_ctc: item.annualCtc,
        fee_rate: item.feeRate,
        taxable_amount: itemTaxable(item)
      }))
    });
  }

  async function downloadPreview() {
    try {
      await downloadInvoicePdf(preview, invoiceProfile);
    } catch {
      setError('Invoice PDF could not be downloaded.');
    }
  }

  function isPaymentReceivedStatus(status) {
    return ['RECEIVED', 'SUCCESS', 'PAID'].includes(String(status || '').toUpperCase());
  }

  async function togglePaymentStatus(invoice) {
    const received = isPaymentReceivedStatus(invoice.status);
    const confirmed = received
      ? window.confirm(
          `Payment still pending for invoice ${invoice.invoice_number}?\n\nClick OK to set the status back to Pending.`
        )
      : window.confirm(
          `Mark payment as Received for invoice ${invoice.invoice_number}?`
        );
    if (!confirmed) return;

    try {
      setSaving(true);
      setError('');
      const response = await api.patch(
        `/invoices/${invoice.id}/payment-outcome`,
        { outcome: received ? 'PENDING' : 'RECEIVED' }
      );
      setMessage(
        response.data.message ||
          (received
            ? 'Payment marked as Pending.'
            : 'Payment marked as Received.')
      );
      await loadInvoices();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Payment status could not be updated.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancel(invoice) {
    if (!window.confirm(`Cancel invoice ${invoice.invoice_number}?`)) return;
    try {
      const response = await api.patch(`/invoices/${invoice.id}/cancel`);
      setMessage(response.data.message);
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invoice could not be cancelled.');
    }
  }

  async function remove(invoice) {
    const receivedPayment = Number(invoice.paid_amount || 0) > 0;
    const warning = receivedPayment
      ? `Delete invoice ${invoice.invoice_number}?\n\nThis invoice has received payment. Deleting it will also permanently delete its payment history.`
      : `Delete invoice ${invoice.invoice_number}?`;
    if (!window.confirm(warning)) return;
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
        <div>
          <p className="eyebrow">Recruitment Finance</p>
          <h1 className="page-title">Recruitment Invoices</h1>
          <p className="page-subtitle">
            Create tax invoices, preview them and download PDF.
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          <Plus size={18} /> Create Invoice
        </button>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      <div className="invoice-summary-grid">
        <div className="card"><FileText size={22} /><span>Total Invoiced</span><strong>{money(summary.invoiced)}</strong></div>
        <div className="card"><WalletCards size={22} /><span>Payment Received</span><strong>{money(summary.received)}</strong></div>
        <div className="card"><IndianRupee size={22} /><span>Outstanding</span><strong>{money(summary.outstanding)}</strong></div>
      </div>

      {showForm && (
        <form className="card form-card invoice-form" onSubmit={saveInvoice}>
          <div className="section-heading">
            <div>
              <h2>{editing ? 'Edit Recruitment Invoice' : 'Create Recruitment Invoice'}</h2>
              <p className="page-subtitle">
                Company GST, SAC, state code, bank and signature details come from company settings.
              </p>
            </div>
            <button className="icon-btn" type="button" onClick={() => setShowForm(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="invoice-fixed-details">
            <div><span>GST</span><strong>{invoiceProfile.gstNumber}</strong></div>
            <div><span>SAC Code</span><strong>{invoiceProfile.sacCode}</strong></div>
            <div><span>State Code</span><strong>{invoiceProfile.stateCode}</strong></div>
            <div><span>Bank</span><strong>{invoiceProfile.bankName}</strong></div>
          </div>

          <div className="form-grid form-grid-3">
            <label className="form-group">
              <span>To / Client Name *</span>
              <select
                className="input"
                value={form.clientId}
                onChange={(event) => chooseClient(event.target.value)}
                required
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.company_name}</option>
                ))}
              </select>
            </label>
            <label className="form-group">
              <span>Invoice Number *</span>
              <input className="input" name="invoiceNumber" value={form.invoiceNumber} onChange={setField} required />
            </label>
            <label className="form-group">
              <span>Invoice Date *</span>
              <input className="input" type="date" name="invoiceDate" value={form.invoiceDate} onChange={setField} required />
            </label>
          </div>

          {selectedClient && (
            <div className="invoice-client-preview">
              <div><span>Client</span><strong>{selectedClient.company_name}</strong></div>
              <div><span>Address</span><strong>{[selectedClient.address_line, selectedClient.city, selectedClient.state, selectedClient.postal_code].filter(Boolean).join(', ') || '—'}</strong></div>
              <div><span>Client GST Number</span><strong>{selectedClient.gst_number || '—'}</strong></div>
            </div>
          )}

          <div className="form-grid form-grid-3">
            <label className="form-group">
              <span>GST Type</span>
              <select className="input" name="gstType" value={form.gstType} onChange={setField}>
                <option value="NONE">No GST</option>
                <option value="IGST">IGST</option>
                <option value="CGST_SGST">CGST + SGST</option>
              </select>
            </label>
            {form.gstType === 'IGST' && (
              <label className="form-group">
                <span>IGST %</span>
                <input className="input" type="number" min="0" max="100" step="0.001" name="igstRate" value={form.igstRate} onChange={setField} />
              </label>
            )}
            {form.gstType === 'CGST_SGST' && (
              <>
                <label className="form-group">
                  <span>CGST %</span>
                  <input className="input" type="number" min="0" max="100" step="0.001" name="cgstRate" value={form.cgstRate} onChange={setField} />
                </label>
                <label className="form-group">
                  <span>SGST %</span>
                  <input className="input" type="number" min="0" max="100" step="0.001" name="sgstRate" value={form.sgstRate} onChange={setField} />
                </label>
              </>
            )}
          </div>

          <div className="invoice-fixed-description">
            {invoiceProfile.recruitmentDescription}
          </div>

          <div className="invoice-placement-picker">
            <h3>Placed Candidates</h3>
            {!form.clientId ? (
              <p className="empty-copy">Select a client to load candidates placed with that client.</p>
            ) : placements.length === 0 ? (
              <p className="empty-copy">No joined/active placement is recorded for this client.</p>
            ) : (
              placements.map((placement) => (
                <label className="placement-option" key={placement.placement_history_id}>
                  <input
                    type="checkbox"
                    checked={form.items.some(
                      (item) => Number(item.placementHistoryId) === Number(placement.placement_history_id)
                    )}
                    onChange={() => togglePlacement(placement)}
                  />
                  <span>
                    <strong>{placement.candidate_name}</strong>
                    <small>
                      {placement.position || 'Designation not added'} · Joined {dateOnly(placement.joining_date) || '—'} · {money(placement.offered_ctc || placement.ctc)}
                    </small>
                  </span>
                </label>
              ))
            )}
          </div>

          {form.items.length > 0 && (
            <div className="invoice-items-editor">
              <h3>Candidate and Duty-Rate Details</h3>
              {form.items.map((item, index) => (
                <div className="invoice-candidate-editor" key={item.placementHistoryId || index}>
                  <div className="invoice-candidate-heading">
                    <strong>Candidate {index + 1}</strong>
                    <span>Service Value: {money(itemTaxable(item))}</span>
                  </div>
                  <div className="form-grid form-grid-3">
                    <label className="form-group">
                      <span>Name of Candidate</span>
                      <input className="input" value={item.candidateName} onChange={(event) => updateItem(index, 'candidateName', event.target.value)} required />
                    </label>
                    <label className="form-group">
                      <span>Location & Grade</span>
                      <input className="input" value={item.location} onChange={(event) => updateItem(index, 'location', event.target.value)} />
                    </label>
                    <label className="form-group">
                      <span>Date of Joining</span>
                      <input className="input" type="date" value={item.joiningDate} onChange={(event) => updateItem(index, 'joiningDate', event.target.value)} />
                    </label>
                    <label className="form-group">
                      <span>Designation</span>
                      <input className="input" value={item.designation} onChange={(event) => updateItem(index, 'designation', event.target.value)} />
                    </label>
                    <label className="form-group">
                      <span>Billing CTC</span>
                      <input className="input" type="number" min="0" step="0.01" value={item.annualCtc} onChange={(event) => updateItem(index, 'annualCtc', event.target.value)} required />
                    </label>
                    <label className="form-group">
                      <span>Duty Rate %</span>
                      <input className="input" type="number" min="0" max="100" step="0.001" value={item.feeRate} onChange={(event) => updateItem(index, 'feeRate', event.target.value)} required />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="invoice-calculation">
            <div><span>A — Value of Service Rendered</span><strong>{money(totals.subtotal)}</strong></div>
            {form.gstType === 'IGST' && <div><span>B — IGST</span><strong>{money(totals.igst)}</strong></div>}
            {form.gstType === 'CGST_SGST' && (
              <>
                <div><span>B — CGST</span><strong>{money(totals.cgst)}</strong></div>
                <div><span>C — SGST</span><strong>{money(totals.sgst)}</strong></div>
              </>
            )}
            <div className="invoice-total"><span>Grand Total</span><strong>{money(totals.total)}</strong></div>
          </div>

          {editing && editingPaymentSummary && (
            <section className="invoice-payment-panel">
              <div className="invoice-payment-heading">
                <div>
                  <span className="invoice-payment-eyebrow">Payment Details</span>
                  <h3>Record Client Payment</h3>
                  <p>
                    Record partial or full payments. Paid, Outstanding and Status
                    are updated automatically.
                  </p>
                </div>
                <WalletCards size={24} />
              </div>

              <div className="invoice-payment-summary">
                <div>
                  <span>Invoice Total</span>
                  <strong>{money(editingPaymentSummary.invoiceTotal)}</strong>
                </div>
                <div>
                  <span>Already Paid</span>
                  <strong>{money(editingPaymentSummary.alreadyPaid)}</strong>
                </div>
                <div>
                  <span>Outstanding</span>
                  <strong>{money(editingPaymentSummary.outstanding)}</strong>
                </div>
                <div>
                  <span>Current Status</span>
                  <strong>{label(editing.status)}</strong>
                </div>
              </div>

              {Math.abs(
                Number(totals.total || 0) -
                  Number(editingPaymentSummary.invoiceTotal || 0)
              ) > 0.009 && (
                <div className="invoice-payment-notice">
                  Invoice values have been changed in this form. Click
                  <strong> Update Invoice </strong>
                  first, then reopen it before recording payment.
                </div>
              )}

              {editingPaymentSummary.outstanding > 0 ? (
                <>
                  <div className="form-grid invoice-payment-fields">
                    <label className="form-group">
                      <span>Amount Received Now *</span>
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        max={editingPaymentSummary.outstanding}
                        step="0.01"
                        value={paymentForm.amount}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            amount: event.target.value
                          }))
                        }
                        placeholder="Enter received amount"
                      />
                    </label>

                    <label className="form-group">
                      <span>Payment Date *</span>
                      <input
                        className="input"
                        type="date"
                        value={paymentForm.paymentDate}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            paymentDate: event.target.value
                          }))
                        }
                      />
                    </label>

                    <label className="form-group">
                      <span>Payment Method</span>
                      <select
                        className="input"
                        value={paymentForm.paymentMethod}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            paymentMethod: event.target.value
                          }))
                        }
                      >
                        <option>Bank Transfer</option>
                        <option>NEFT</option>
                        <option>RTGS</option>
                        <option>IMPS</option>
                        <option>UPI</option>
                        <option>Cheque</option>
                        <option>Cash</option>
                        <option>Other</option>
                      </select>
                    </label>

                    <label className="form-group">
                      <span>UTR / Reference Number</span>
                      <input
                        className="input"
                        value={paymentForm.referenceNumber}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            referenceNumber: event.target.value
                          }))
                        }
                        placeholder="Optional reference"
                      />
                    </label>
                  </div>

                  <div className="invoice-payment-after">
                    <span>After this payment</span>
                    <div>
                      <strong>Paid: {money(editingPaymentSummary.afterPaid)}</strong>
                      <strong>
                        Outstanding: {money(editingPaymentSummary.afterOutstanding)}
                      </strong>
                      <strong>Status: {editingPaymentSummary.afterStatus}</strong>
                    </div>
                  </div>

                  <div className="invoice-payment-actions">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={recordInvoicePayment}
                      disabled={
                        paymentSaving ||
                        !paymentForm.amount ||
                        Number(paymentForm.amount || 0) <= 0 ||
                        Number(paymentForm.amount || 0) > editingPaymentSummary.outstanding ||
                        Math.abs(
                          Number(totals.total || 0) -
                            Number(editingPaymentSummary.invoiceTotal || 0)
                        ) > 0.009
                      }
                    >
                      <WalletCards size={17} />
                      {paymentSaving ? 'Recording…' : 'Record Payment'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="invoice-payment-complete">
                  This invoice is fully received. Outstanding amount is ₹0.
                </div>
              )}

              <div className="invoice-payment-history">
                <div className="invoice-payment-history-head">
                  <h4>Payment History</h4>
                  <span>
                    {(editing.payments || []).length} payment
                    {(editing.payments || []).length === 1 ? '' : 's'}
                  </span>
                </div>

                {(editing.payments || []).length ? (
                  <div className="invoice-payment-history-list">
                    {(editing.payments || []).map((payment) => (
                      <div className="invoice-payment-history-row" key={payment.id}>
                        <div>
                          <strong>{money(payment.amount)}</strong>
                          <span>{dateOnly(payment.payment_date)}</span>
                        </div>
                        <div>
                          <strong>{payment.payment_method || 'Not specified'}</strong>
                          <span>{payment.reference_number || 'No reference number'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="invoice-payment-empty">
                    No payment has been recorded for this invoice yet.
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" disabled={saving || form.items.length === 0}>
              {saving ? 'Saving…' : editing ? 'Update Invoice' : 'Save Invoice'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!form.clientId || !form.invoiceNumber || form.items.length === 0}
              onClick={previewDraft}
            >
              <Eye size={17} /> Preview Invoice
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card toolbar">
        <div className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, client or candidate" />
        </div>
        <select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All Statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
      </div>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Candidates</th>
              <th>Date</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9">Loading invoices…</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan="9">No invoices found.</td></tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.invoice_number}</strong>
                  </td>
                  <td><strong>{invoice.company_name}</strong></td>
                  <td>{invoice.candidate_names || '—'}</td>
                  <td>{dateOnly(invoice.invoice_date)}</td>
                  <td>{money(invoice.total_amount)}</td>
                  <td>{money(invoice.paid_amount)}</td>
                  <td>{money(invoice.pending_amount)}</td>
                  <td>
                    <span className={`status-badge status-${String(invoice.status).toLowerCase()}`}>
                      {label(invoice.status)}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="Preview" onClick={() => previewInvoice(invoice)}><Eye size={16} /></button>
                      <button className="icon-btn" title="Download PDF" onClick={() => download(invoice)}><Download size={16} /></button>
                      {invoice.status !== 'CANCELLED' && (
                        <button className="icon-btn" title="Edit" onClick={() => openEdit(invoice)}><Pencil size={16} /></button>
                      )}
                      {invoice.status !== 'CANCELLED' && (
                        <button
                          className="btn btn-secondary btn-small"
                          disabled={saving}
                          onClick={() => togglePaymentStatus(invoice)}
                        >
                          Payment
                        </button>
                      )}
                      {invoice.status !== 'CANCELLED' && (
                        <button className="icon-btn danger" title="Delete" onClick={() => remove(invoice)}><Trash2 size={16} /></button>
                      )}
                      {Number(invoice.paid_amount || 0) === 0 && invoice.status !== 'CANCELLED' && (
                        <button className="btn btn-secondary btn-small" onClick={() => cancel(invoice)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="modal-overlay">
          <div className="modal-card invoice-preview-modal">
            <div className="section-heading">
              <div>
                <h2>Invoice Preview</h2>
                <p className="page-subtitle">The downloaded PDF uses this same invoice format.</p>
              </div>
              <button className="icon-btn" onClick={() => setPreview(null)}><X size={20} /></button>
            </div>
            <iframe className="invoice-preview-frame" title="Invoice preview" srcDoc={invoiceHtml(preview, invoiceProfile)} />
            <div className="form-actions">
              <button className="btn btn-primary" onClick={downloadPreview}><Download size={17} /> Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
