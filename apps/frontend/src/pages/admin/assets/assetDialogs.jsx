import { useEffect, useRef, useState } from 'react';
import api from '../../../services/api.js';
import {
  CONDITIONS,
  CONDITION_LABELS,
  Modal,
  apiError,
  assetTitle,
  formatDate,
  toDateInput,
  todayInput
} from './assetUi.jsx';

function useSubmitGuard() {
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  async function run(task) {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      await task();
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  return [submitting, run];
}

function AssetLine({ item }) {
  return (
    <div className="hint-box" style={{ marginBottom: 14 }}>
      <strong style={{ color: 'var(--text)' }}>{item.assetTag}</strong> · {assetTitle({
        asset_name: item.assetName,
        category: item.category
      })}
      {item.employeeName ? (
        <div style={{ marginTop: 4 }}>
          Assigned to <strong style={{ color: 'var(--text)' }}>{item.employeeName}</strong>
          {item.employeeCode ? ` (${item.employeeCode})` : ''}
          {item.assignedAt ? ` since ${formatDate(item.assignedAt)}` : ''}
        </div>
      ) : null}
    </div>
  );
}

function OptionCard({ checked, disabled, onSelect, title, description, name }) {
  return (
    <label className={`option-card ${disabled ? 'disabled' : ''} ${checked ? 'selected' : ''}`}>
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span>
        <strong>{title}</strong>
        <span className="helper-text" style={{ display: 'block' }}>
          {description}
        </span>
      </span>
    </label>
  );
}

// item: { assetId, assetTag, assetName, category, employeeId, employeeName, employeeCode, assignedAt }
export function ReturnAssetDialog({ item, onClose, onDone }) {
  const [form, setForm] = useState({
    returnDate: todayInput(),
    conditionLabel: 'GOOD',
    outcome: 'AVAILABLE',
    issueDescription: '',
    remarks: ''
  });
  const [error, setError] = useState('');
  const [submitting, run] = useSubmitGuard();
  const minDate = item.assignedAt ? toDateInput(item.assignedAt) : undefined;

  useEffect(() => {
    if (form.conditionLabel === 'DAMAGED' && form.outcome === 'AVAILABLE') {
      setForm((f) => ({ ...f, outcome: 'REPAIR' }));
    }
  }, [form.conditionLabel, form.outcome]);

  const missing =
    form.outcome === 'REPAIR' && !form.issueDescription.trim()
      ? 'Describe the damage before sending the item to repair.'
      : !form.returnDate
        ? 'Enter the return date.'
        : '';

  function submit(event) {
    event.preventDefault();
    if (missing) return;
    run(async () => {
      setError('');
      try {
        const res = await api.post(`/assets/${item.assetId}/return`, {
          employeeId: item.employeeId,
          returnDate: form.returnDate,
          conditionLabel: form.outcome === 'LOST' ? undefined : form.conditionLabel,
          outcome: form.outcome,
          issueDescription: form.issueDescription.trim() || undefined,
          remarks: form.remarks.trim() || undefined
        });
        onDone(res.data.message);
      } catch (err) {
        setError(apiError(err, 'Unable to record the return.'));
      }
    });
  }

  return (
    <Modal title="Record asset return" subtitle="The assignment is closed and kept in history." onClose={onClose}>
      <AssetLine item={item} />
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="return-date">Return date</label>
            <input
              id="return-date"
              className="input"
              type="date"
              value={form.returnDate}
              min={minDate}
              max={todayInput()}
              onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
              required
            />
          </div>
          {form.outcome !== 'LOST' ? (
            <div className="form-group">
              <label htmlFor="return-condition">Condition on return</label>
              <select
                id="return-condition"
                className="input"
                value={form.conditionLabel}
                onChange={(e) => setForm({ ...form, conditionLabel: e.target.value })}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="form-group">
          <label>What happens to the item?</label>
          <OptionCard
            name="return-outcome"
            checked={form.outcome === 'AVAILABLE'}
            disabled={form.conditionLabel === 'DAMAGED'}
            onSelect={() => setForm({ ...form, outcome: 'AVAILABLE' })}
            title="Usable — back to inventory"
            description={
              form.conditionLabel === 'DAMAGED'
                ? 'Not allowed for damaged items.'
                : 'The item becomes Available for the next assignment.'
            }
          />
          <OptionCard
            name="return-outcome"
            checked={form.outcome === 'REPAIR'}
            onSelect={() => setForm({ ...form, outcome: 'REPAIR' })}
            title="Damaged — send to repair"
            description="The item is marked Under Repair and cannot be assigned until the repair is completed."
          />
          <OptionCard
            name="return-outcome"
            checked={form.outcome === 'LOST'}
            onSelect={() => setForm({ ...form, outcome: 'LOST' })}
            title="Not returned — mark as lost"
            description="Closes the assignment and marks the item Lost."
          />
        </div>

        {form.outcome === 'REPAIR' ? (
          <div className="form-group">
            <label htmlFor="return-issue">Damage / issue description</label>
            <textarea
              id="return-issue"
              className="input"
              rows={3}
              placeholder="e.g. Cracked screen, keyboard keys missing"
              value={form.issueDescription}
              onChange={(e) => setForm({ ...form, issueDescription: e.target.value })}
            />
          </div>
        ) : null}

        <div className="form-group">
          <label htmlFor="return-remarks">Remarks (optional)</label>
          <textarea
            id="return-remarks"
            className="input"
            rows={2}
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
        </div>

        {missing ? <div className="helper-text">{missing}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting || Boolean(missing)}>
            {submitting ? 'Saving…' : 'Record return'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// item: { assetId, assetTag, assetName, category, employeeName?, employeeCode? }
export function ReportRepairDialog({ item, onClose, onDone }) {
  const [form, setForm] = useState({
    recordType: 'REPAIR',
    issueDate: todayInput(),
    description: ''
  });
  const [error, setError] = useState('');
  const [submitting, run] = useSubmitGuard();
  const missing = !form.description.trim() ? 'Describe the issue to continue.' : '';

  function submit(event) {
    event.preventDefault();
    if (missing) return;
    run(async () => {
      setError('');
      try {
        const res = await api.post(`/assets/${item.assetId}/service`, {
          recordType: form.recordType,
          issueDate: form.issueDate,
          description: form.description.trim()
        });
        onDone(res.data.message);
      } catch (err) {
        setError(apiError(err, 'Unable to record the repair.'));
      }
    });
  }

  return (
    <Modal title="Report repair or damage" onClose={onClose}>
      <AssetLine item={item} />
      <p className="helper-text" style={{ marginTop: 0 }}>
        The item is marked Under Repair and cannot be assigned until the repair is completed.
        {item.employeeName ? ' It stays on the employee’s record until you record a return.' : ''}
      </p>
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="repair-type">Type</label>
            <select
              id="repair-type"
              className="input"
              value={form.recordType}
              onChange={(e) => setForm({ ...form, recordType: e.target.value })}
            >
              <option value="REPAIR">Needs repair</option>
              <option value="DAMAGE">Damage report</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="repair-date">Issue date</label>
            <input
              id="repair-date"
              className="input"
              type="date"
              max={todayInput()}
              value={form.issueDate}
              onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="repair-description">Issue description</label>
          <textarea
            id="repair-description"
            className="input"
            rows={3}
            placeholder="e.g. Battery not charging"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        {missing ? <div className="helper-text">{missing}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting || Boolean(missing)}>
            {submitting ? 'Saving…' : 'Mark under repair'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// service: repair record row; item: { assetId, assetTag, assetName, category, employeeName? }
export function CompleteRepairDialog({ service, item, onClose, onDone }) {
  const [form, setForm] = useState({
    outcome: 'REPAIRED',
    conditionLabel: 'GOOD',
    resolvedDate: todayInput(),
    notes: ''
  });
  const [error, setError] = useState('');
  const [submitting, run] = useSubmitGuard();
  const isHeld = Boolean(item.employeeName);
  const minDate = service.issue_date ? toDateInput(service.issue_date) : undefined;

  function submit(event) {
    event.preventDefault();
    run(async () => {
      setError('');
      try {
        const res = await api.patch(`/assets/${item.assetId}/service/${service.id}/resolve`, {
          outcome: form.outcome,
          conditionLabel: form.outcome === 'REPAIRED' ? form.conditionLabel : undefined,
          resolvedDate: form.resolvedDate,
          notes: form.notes.trim() || undefined
        });
        onDone(res.data.message);
      } catch (err) {
        setError(apiError(err, 'Unable to close the repair.'));
      }
    });
  }

  return (
    <Modal title="Complete repair" onClose={onClose}>
      <AssetLine item={item} />
      <div className="hint-box" style={{ marginBottom: 14 }}>
        Issue reported {formatDate(service.issue_date || service.created_at)}: {service.description}
      </div>
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
        <div className="form-group">
          <label>Repair outcome</label>
          <OptionCard
            name="repair-outcome"
            checked={form.outcome === 'REPAIRED'}
            onSelect={() => setForm({ ...form, outcome: 'REPAIRED' })}
            title="Repaired — item is usable"
            description={
              isHeld
                ? `The item goes back to Assigned (still with ${item.employeeName}).`
                : 'The item becomes Available once no other repairs are open.'
            }
          />
          <OptionCard
            name="repair-outcome"
            checked={form.outcome === 'NOT_REPAIRABLE'}
            disabled={isHeld}
            onSelect={() => setForm({ ...form, outcome: 'NOT_REPAIRABLE' })}
            title="Not repairable — retire item"
            description={
              isHeld
                ? `Record the return from ${item.employeeName} first.`
                : 'The item is marked Retired. Its history is kept.'
            }
          />
        </div>
        <div className="form-grid">
          {form.outcome === 'REPAIRED' ? (
            <div className="form-group">
              <label htmlFor="repair-condition">Condition after repair</label>
              <select
                id="repair-condition"
                className="input"
                value={form.conditionLabel}
                onChange={(e) => setForm({ ...form, conditionLabel: e.target.value })}
              >
                {CONDITIONS.filter((c) => c !== 'DAMAGED').map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="form-group">
            <label htmlFor="repair-resolved">Completion date</label>
            <input
              id="repair-resolved"
              className="input"
              type="date"
              min={minDate}
              max={todayInput()}
              value={form.resolvedDate}
              onChange={(e) => setForm({ ...form, resolvedDate: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="repair-notes">Repair notes (optional)</label>
          <textarea
            id="repair-notes"
            className="input"
            rows={2}
            placeholder="e.g. Screen replaced by vendor"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Close repair'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// item: { assetId, assetTag, assetName, category, companyId, employeeId, employeeName, employeeCode }
export function TransferAssetDialog({ item, onClose, onDone }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toEmployeeId, setToEmployeeId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, run] = useSubmitGuard();

  useEffect(() => {
    let cancelled = false;
    api
      .get('/assets/employee-records', {
        params: { activeOnly: 1, companyId: item.companyId }
      })
      .then((res) => {
        if (cancelled) return;
        setEmployees(
          (res.data.data || []).filter((e) => Number(e.id) !== Number(item.employeeId))
        );
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiError(err, 'Unable to load employees.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.companyId, item.employeeId]);

  const target = employees.find((e) => String(e.id) === String(toEmployeeId));

  function submit(event) {
    event.preventDefault();
    if (!toEmployeeId) return;
    run(async () => {
      setError('');
      try {
        const res = await api.post(`/assets/${item.assetId}/transfer`, {
          employeeId: Number(toEmployeeId),
          reason: reason.trim() || undefined
        });
        onDone(res.data.message);
      } catch (err) {
        setError(apiError(err, 'Unable to transfer the asset.'));
      }
    });
  }

  return (
    <Modal title="Transfer asset" subtitle="Closes the current assignment and opens a new one. Both stay in history." onClose={onClose}>
      <AssetLine item={item} />
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {loadError ? <div className="message message-error" style={{ marginBottom: 12 }}>{loadError}</div> : null}
      <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
        <div className="form-group">
          <label htmlFor="transfer-to">Transfer to</label>
          <select
            id="transfer-to"
            className="input"
            value={toEmployeeId}
            disabled={loading}
            onChange={(e) => setToEmployeeId(e.target.value)}
          >
            <option value="">{loading ? 'Loading employees…' : 'Select an active employee'}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name} ({e.employee_id}){e.department_name ? ` · ${e.department_name}` : ''}
              </option>
            ))}
          </select>
          <span className="helper-text">Only active employees of the same company are listed.</span>
        </div>
        <div className="form-group">
          <label htmlFor="transfer-reason">Reason (optional)</label>
          <input
            id="transfer-reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {target ? (
          <div className="hint-box">
            {item.assetTag} will move from <strong>{item.employeeName}</strong> to{' '}
            <strong>{target.full_name}</strong>.
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting || !toEmployeeId}>
            {submitting ? 'Transferring…' : 'Confirm transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RetireAssetDialog({ item, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, run] = useSubmitGuard();

  function submit(event) {
    event.preventDefault();
    run(async () => {
      setError('');
      try {
        const res = await api.post(`/assets/${item.assetId}/retire`, {
          reason: reason.trim() || undefined
        });
        onDone(res.data.message);
      } catch (err) {
        setError(apiError(err, 'Unable to retire the asset.'));
      }
    });
  }

  return (
    <Modal title="Retire asset" subtitle="Retired items can no longer be assigned. History is kept." onClose={onClose} width={520}>
      <AssetLine item={item} />
      {error ? <div className="message message-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
        <div className="form-group">
          <label htmlFor="retire-reason">Reason</label>
          <input
            id="retire-reason"
            className="input"
            placeholder="e.g. End of life, beyond economical repair"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" type="submit" disabled={submitting}>
            {submitting ? 'Retiring…' : 'Retire asset'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
