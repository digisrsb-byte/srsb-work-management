import { useRef, useState } from 'react';
import api from '../../../services/api.js';
import { ASSET_CATEGORIES } from '../../../constants/assetCategories.js';
import { CONDITIONS, CONDITION_LABELS, Modal, apiError, todayInput } from './assetUi.jsx';

const REGISTRATION_STATUSES = [
  { value: 'AVAILABLE', label: 'Available — ready to assign' },
  { value: 'REPAIR', label: 'Under Repair' },
  { value: 'RETIRED', label: 'Retired' }
];

function blankForm(companyId = '', category = ASSET_CATEGORIES[0]) {
  return {
    companyId,
    category,
    assetName: '',
    assetTag: '',
    make: '',
    model: '',
    serialNumber: '',
    purchaseDate: '',
    purchaseCost: '',
    warrantyExpiry: '',
    conditionLabel: 'GOOD',
    location: '',
    notes: '',
    status: 'AVAILABLE'
  };
}

export default function RegisterAssetForm({ companies, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    blankForm(companies.length === 1 ? String(companies[0].id) : '')
  );
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const conditionConflict =
    form.status === 'AVAILABLE' && form.conditionLabel === 'DAMAGED'
      ? 'Damaged items cannot be Available. Choose Under Repair or Retired.'
      : '';

  async function save(addAnother) {
    if (busy.current) return;
    setError('');
    setSavedNotice('');
    if (!form.companyId || !form.category || !form.assetName.trim() || !form.assetTag.trim()) {
      setError('Company, type, asset name and asset tag are required.');
      return;
    }
    if (conditionConflict) {
      setError(conditionConflict);
      return;
    }
    busy.current = true;
    setSubmitting(true);
    try {
      const res = await api.post('/assets', {
        ...form,
        companyId: Number(form.companyId),
        assetName: form.assetName.trim(),
        assetTag: form.assetTag.trim()
      });
      onSaved(res.data.message);
      if (addAnother) {
        setSavedNotice(`${res.data.message} Enter the next item below.`);
        setForm((f) => ({
          ...blankForm(f.companyId, f.category),
          make: f.make,
          model: f.model,
          location: f.location,
          purchaseDate: f.purchaseDate
        }));
      } else {
        onClose();
      }
    } catch (err) {
      setError(apiError(err, 'Unable to register the asset.'));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Register asset"
      subtitle="Register each physical item once, with its own unique asset tag. Assigning it later links to this record."
      onClose={onClose}
      width={760}
    >
      {savedNotice ? <div className="message message-success" style={{ marginBottom: 12 }}>{savedNotice}</div> : null}
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
        className="grid"
        style={{ gap: 14 }}
      >
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="reg-company">Company *</label>
            <select id="reg-company" className="input" value={form.companyId} onChange={set('companyId')} required>
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="reg-category">Type *</label>
            <select id="reg-category" className="input" value={form.category} onChange={set('category')} required>
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="reg-name">Asset name *</label>
            <input id="reg-name" className="input" placeholder="e.g. Dell Latitude 5440" value={form.assetName} onChange={set('assetName')} required />
          </div>
          <div className="form-group">
            <label htmlFor="reg-tag">Asset tag *</label>
            <input id="reg-tag" className="input" placeholder="e.g. SRSB-LAP-001" value={form.assetTag} onChange={set('assetTag')} required />
            <span className="helper-text">Must be unique within the company. Use the label on the item.</span>
          </div>
          <div className="form-group">
            <label htmlFor="reg-make">Make</label>
            <input id="reg-make" className="input" placeholder="e.g. Dell" value={form.make} onChange={set('make')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-model">Model</label>
            <input id="reg-model" className="input" placeholder="e.g. Latitude 5440" value={form.model} onChange={set('model')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-serial">Serial number</label>
            <input id="reg-serial" className="input" value={form.serialNumber} onChange={set('serialNumber')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-location">Office / location</label>
            <input id="reg-location" className="input" placeholder="e.g. Bengaluru HQ" value={form.location} onChange={set('location')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-purchase-date">Purchase date</label>
            <input id="reg-purchase-date" className="input" type="date" max={todayInput()} value={form.purchaseDate} onChange={set('purchaseDate')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-cost">Purchase cost (₹)</label>
            <input id="reg-cost" className="input" type="number" min="0" step="0.01" value={form.purchaseCost} onChange={set('purchaseCost')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-warranty">Warranty expiry</label>
            <input id="reg-warranty" className="input" type="date" value={form.warrantyExpiry} onChange={set('warrantyExpiry')} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-condition">Condition</label>
            <select id="reg-condition" className="input" value={form.conditionLabel} onChange={set('conditionLabel')}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="reg-status">Status</label>
            <select id="reg-status" className="input" value={form.status} onChange={set('status')}>
              {REGISTRATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="helper-text">"Assigned" is set automatically when you assign the item.</span>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="reg-notes">Notes</label>
          <textarea id="reg-notes" className="input" rows={2} value={form.notes} onChange={set('notes')} />
        </div>
        {conditionConflict ? <div className="helper-text" style={{ color: 'var(--danger)' }}>{conditionConflict}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-secondary" type="button" disabled={submitting} onClick={() => save(true)}>
            Save &amp; add another
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save asset'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
