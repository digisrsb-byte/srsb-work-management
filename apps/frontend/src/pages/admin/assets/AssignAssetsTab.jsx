import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../services/api.js';
import { ASSET_CATEGORIES } from '../../../constants/assetCategories.js';
import {
  AssetStatusBadge,
  EmptyState,
  ErrorState,
  InfoItem,
  TableSkeleton,
  apiError,
  formatDate,
  itemCountLabel,
  makeModel,
  todayInput
} from './assetUi.jsx';

const STEPS = ['Choose employee', 'Add assets', 'Review & confirm'];

function StepIndicator({ step }) {
  return (
    <ol className="steps" aria-label="Assignment steps">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const state = number === step ? 'active' : number < step ? 'done' : '';
        return (
          <li key={label} className={`step ${state}`} aria-current={number === step ? 'step' : undefined}>
            <span className="step-num">{number < step ? '✓' : number}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function EmployeeSummary({ employee }) {
  return (
    <div className="info-grid">
      <InfoItem label="Employee">{employee.full_name}</InfoItem>
      <InfoItem label="Employee ID">{employee.employee_id}</InfoItem>
      <InfoItem label="Department">{employee.department_name}</InfoItem>
      <InfoItem label="Designation">{employee.designation}</InfoItem>
      <InfoItem label="Location">{employee.work_location}</InfoItem>
      <InfoItem label="Company">{employee.company_name}</InfoItem>
      <InfoItem label="Currently holds">{itemCountLabel(employee.active_count || 0)}</InfoItem>
    </div>
  );
}

function matches(text, query) {
  return String(text || '').toLowerCase().includes(query);
}

export default function AssignAssetsTab({
  presetEmployeeId,
  presetAssetId,
  onAssigned,
  onOpenEmployee,
  goTo
}) {
  const [step, setStep] = useState(1);

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employee, setEmployee] = useState(null);
  const [presetNotice, setPresetNotice] = useState('');

  const [available, setAvailable] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [assetCategory, setAssetCategory] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const [details, setDetails] = useState({
    assignedAt: todayInput(),
    expectedReturnDate: '',
    remarks: ''
  });
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const busy = useRef(false);
  const pendingPresetAsset = useRef(presetAssetId ? Number(presetAssetId) : null);
  const lastEmployeeId = useRef(null);

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    setEmployeesError('');
    try {
      const res = await api.get('/assets/employee-records', { params: { activeOnly: 1 } });
      const rows = res.data.data || [];
      setEmployees(rows);
      return rows;
    } catch (err) {
      setEmployeesError(apiError(err, 'Unable to load employees.'));
      return [];
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees().then((rows) => {
      if (!presetEmployeeId) return;
      const match = rows.find((e) => String(e.id) === String(presetEmployeeId));
      if (match) {
        lastEmployeeId.current = match.id;
        setEmployee(match);
        setStep(2);
      } else {
        setPresetNotice('That employee is not active or not in your company scope. Choose another employee.');
      }
    });
  }, [loadEmployees, presetEmployeeId]);

  const loadAvailable = useCallback(async (emp) => {
    if (!emp) return [];
    setAssetsLoading(true);
    setAssetsError('');
    try {
      const res = await api.get('/assets', {
        params: { status: 'AVAILABLE', companyId: emp.company_id }
      });
      const rows = res.data.data || [];
      setAvailable(rows);
      return rows;
    } catch (err) {
      setAvailable([]);
      setAssetsError(apiError(err, 'Unable to load available assets.'));
      return null;
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!employee) return;
    loadAvailable(employee).then((rows) => {
      const presetId = pendingPresetAsset.current;
      if (!presetId || !rows) return;
      pendingPresetAsset.current = null;
      if (rows.some((a) => a.id === presetId)) {
        setSelectedIds((ids) => (ids.includes(presetId) ? ids : [...ids, presetId]));
      } else {
        setPresetNotice(
          "The asset you picked from the inventory isn't available for this employee's company, so it was not added."
        );
      }
    });
  }, [employee, loadAvailable]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        matches(e.full_name, q) ||
        matches(e.employee_id, q) ||
        matches(e.department_name, q) ||
        matches(e.designation, q) ||
        matches(e.work_location, q)
    );
  }, [employees, employeeQuery]);

  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    return available.filter(
      (a) =>
        (!assetCategory || a.category === assetCategory) &&
        (!q ||
          matches(a.asset_tag, q) ||
          matches(a.asset_name, q) ||
          matches(a.serial_number, q) ||
          matches(a.make, q) ||
          matches(a.model, q))
    );
  }, [available, assetQuery, assetCategory]);

  const selectedAssets = useMemo(
    () => available.filter((a) => selectedIds.includes(a.id)),
    [available, selectedIds]
  );
  const count = selectedAssets.length;

  function chooseEmployee(emp) {
    if (lastEmployeeId.current !== emp.id) {
      setSelectedIds([]);
      setConfirmed(false);
    }
    lastEmployeeId.current = emp.id;
    setEmployee(emp);
    setPresetNotice('');
  }

  function toggleAsset(asset) {
    if (asset.status !== 'AVAILABLE') return;
    setConfirmed(false);
    setSelectedIds((ids) =>
      ids.includes(asset.id) ? ids.filter((id) => id !== asset.id) : [...ids, asset.id]
    );
  }

  const allShownSelected =
    filteredAssets.length > 0 && filteredAssets.every((a) => selectedIds.includes(a.id));

  function toggleAllShown() {
    setConfirmed(false);
    if (allShownSelected) {
      const shown = new Set(filteredAssets.map((a) => a.id));
      setSelectedIds((ids) => ids.filter((id) => !shown.has(id)));
    } else {
      setSelectedIds((ids) => [...new Set([...ids, ...filteredAssets.map((a) => a.id)])]);
    }
  }

  function reset() {
    setStep(1);
    lastEmployeeId.current = null;
    setEmployee(null);
    setEmployeeQuery('');
    setSelectedIds([]);
    setAvailable([]);
    setAssetQuery('');
    setAssetCategory('');
    setDetails({ assignedAt: todayInput(), expectedReturnDate: '', remarks: '' });
    setConfirmed(false);
    setSubmitError('');
    setResult(null);
    setPresetNotice('');
    loadEmployees();
  }

  const step1Missing = !employee ? 'Select an employee to continue.' : '';
  const step2Missing = !count ? 'Select at least one available asset to continue.' : '';
  const step3Missing = !details.assignedAt
    ? 'Enter the issue date.'
    : details.expectedReturnDate && details.expectedReturnDate < details.assignedAt
      ? 'Expected return date cannot be before the issue date.'
      : !confirmed
        ? 'Tick the confirmation box to assign.'
        : '';

  async function submit() {
    if (busy.current || step3Missing || step2Missing || step1Missing) return;
    busy.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.post('/assets/assign-bulk', {
        employeeId: employee.id,
        assetIds: selectedAssets.map((a) => a.id),
        assignedAt: details.assignedAt,
        expectedReturnDate: details.expectedReturnDate || undefined,
        remarks: details.remarks.trim() || undefined
      });
      setResult({
        message: res.data.message,
        employee,
        assets: selectedAssets,
        assignedAt: details.assignedAt
      });
      onAssigned();
    } catch (err) {
      const message = apiError(err, 'Unable to assign the selected assets.');
      if (err.response?.status === 409 || err.response?.status === 400) {
        const fresh = await loadAvailable(employee);
        if (fresh) {
          const stillAvailable = new Set(fresh.map((a) => a.id));
          const dropped = selectedAssets.filter((a) => !stillAvailable.has(a.id));
          if (dropped.length) {
            setSelectedIds((ids) => ids.filter((id) => stillAvailable.has(id)));
            setConfirmed(false);
            setStep(2);
            setSubmitError(
              `${message} Removed from your selection because they are no longer available: ${dropped
                .map((a) => a.asset_tag)
                .join(', ')}. Nothing was assigned.`
            );
            return;
          }
        }
      }
      setSubmitError(`${message} Nothing was assigned.`);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="card">
        <div className="message message-success" style={{ marginBottom: 14 }}>
          {result.message}
        </div>
        <p style={{ marginTop: 0 }}>
          Issued on {formatDate(result.assignedAt)} to <strong>{result.employee.full_name}</strong> (
          {result.employee.employee_id}). They have been notified to acknowledge receipt in My Assets.
        </p>
        <ul>
          {result.assets.map((a) => (
            <li key={a.id}>
              <strong>{a.asset_tag}</strong> — {a.asset_name || a.category}
              {a.serial_number ? ` · SN ${a.serial_number}` : ''}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="button" onClick={() => onOpenEmployee(result.employee.id)}>
            View {result.employee.full_name}'s asset record
          </button>
          <button className="btn btn-secondary" type="button" onClick={reset}>
            Assign assets to another employee
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-heading" style={{ marginBottom: 6 }}>
        <div>
          <h2>Assign assets</h2>
          <p className="page-subtitle">Pick the employee first, then add one or more available items.</p>
        </div>
      </div>
      <StepIndicator step={step} />
      {presetNotice ? <div className="message message-error" style={{ marginBottom: 12 }}>{presetNotice}</div> : null}

      {step === 1 ? (
        <div className="grid" style={{ gap: 14 }}>
          {employee ? (
            <div className="card" style={{ background: 'var(--surface-muted)', boxShadow: 'none' }}>
              <div className="section-heading" style={{ marginBottom: 10 }}>
                <h2>Selected employee</h2>
                <button className="btn btn-secondary" type="button" onClick={() => setEmployee(null)}>
                  Change
                </button>
              </div>
              <EmployeeSummary employee={employee} />
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Search by name, employee ID, department or location"
                value={employeeQuery}
                onChange={(e) => setEmployeeQuery(e.target.value)}
                aria-label="Search employees"
                autoFocus
              />
              {employeesError ? <ErrorState message={employeesError} onRetry={loadEmployees} /> : null}
              {employeesLoading ? (
                <TableSkeleton columns={5} rows={4} />
              ) : !employeesError && !filteredEmployees.length ? (
                <EmptyState title={employees.length ? 'No employees match your search' : 'No active employees found'}>
                  <span>
                    {employees.length
                      ? 'Try a different name or ID.'
                      : 'Only active employees in your company scope can receive assets.'}
                  </span>
                </EmptyState>
              ) : filteredEmployees.length ? (
                <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Location</th>
                        <th>Items held</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>{e.full_name}</strong>
                            <div className="helper-text">
                              {e.employee_id}
                              {e.designation ? ` · ${e.designation}` : ''}
                            </div>
                          </td>
                          <td>{e.department_name || '—'}</td>
                          <td>{e.work_location || '—'}</td>
                          <td>{itemCountLabel(e.active_count)}</td>
                          <td>
                            <button className="btn btn-primary" type="button" onClick={() => chooseEmployee(e)}>
                              Select
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" disabled={Boolean(step1Missing)} onClick={() => setStep(2)}>
              Continue
            </button>
            {step1Missing ? <span className="helper-text">{step1Missing}</span> : null}
          </div>
        </div>
      ) : null}

      {step === 2 && employee ? (
        <div className="grid" style={{ gap: 14 }}>
          <div className="hint-box">
            Assigning to <strong style={{ color: 'var(--text)' }}>{employee.full_name}</strong> ({employee.employee_id})
            {employee.department_name ? ` · ${employee.department_name}` : ''}
            {employee.work_location ? ` · ${employee.work_location}` : ''}. Only available items from{' '}
            {employee.company_name || 'the employee’s company'} are listed.
          </div>
          {submitError ? <div className="message message-error">{submitError}</div> : null}

          <div className="selection-layout">
            <div>
              <div className="toolbar">
                <input
                  className="input"
                  placeholder="Search asset tag, name or serial"
                  value={assetQuery}
                  onChange={(e) => setAssetQuery(e.target.value)}
                  aria-label="Search available assets"
                />
                <select
                  className="input"
                  value={assetCategory}
                  onChange={(e) => setAssetCategory(e.target.value)}
                  aria-label="Filter by type"
                >
                  <option value="">All types</option>
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" type="button" onClick={() => loadAvailable(employee)} disabled={assetsLoading}>
                  Refresh
                </button>
              </div>

              {assetsError ? <ErrorState message={assetsError} onRetry={() => loadAvailable(employee)} /> : null}
              {assetsLoading ? (
                <TableSkeleton columns={6} rows={5} />
              ) : !assetsError && !available.length ? (
                <EmptyState title="No available assets">
                  <span style={{ display: 'block', marginBottom: 10 }}>
                    Every item in this company is assigned, under repair or retired. Register a new asset, or record a
                    return to put an item back into inventory.
                  </span>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" type="button" onClick={() => goTo('inventory', { register: '1' })}>
                      Register asset
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => goTo('repairs')}>
                      Go to Returns &amp; Repairs
                    </button>
                  </div>
                </EmptyState>
              ) : !assetsError && !filteredAssets.length ? (
                <EmptyState title="No available assets match your search">
                  <span>Clear the search or type filter to see all {itemCountLabel(available.length)}.</span>
                </EmptyState>
              ) : filteredAssets.length ? (
                <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input
                            type="checkbox"
                            aria-label="Select all shown assets"
                            checked={allShownSelected}
                            onChange={toggleAllShown}
                          />
                        </th>
                        <th>Asset tag</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Make / model</th>
                        <th>Serial number</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.map((a) => {
                        const checked = selectedIds.includes(a.id);
                        return (
                          <tr
                            key={a.id}
                            className={checked ? 'row-selected' : ''}
                            onClick={() => toggleAsset(a)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select ${a.asset_tag}`}
                                checked={checked}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleAsset(a)}
                              />
                            </td>
                            <td><strong>{a.asset_tag}</strong></td>
                            <td>{a.asset_name || '—'}</td>
                            <td>{a.category}</td>
                            <td>{makeModel(a)}</td>
                            <td>{a.serial_number || '—'}</td>
                            <td><AssetStatusBadge status={a.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <aside className="card selected-panel" style={{ boxShadow: 'none' }} aria-live="polite">
              <h3 style={{ marginTop: 0 }}>{itemCountLabel(count)} selected</h3>
              {count ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {selectedAssets.map((a) => (
                    <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span>
                        <strong>{a.asset_tag}</strong>
                        <span className="helper-text" style={{ display: 'block' }}>
                          {a.asset_name || a.category}
                        </span>
                      </span>
                      <button className="btn btn-secondary" type="button" style={{ padding: '6px 10px' }} onClick={() => toggleAsset(a)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="helper-text" style={{ margin: 0 }}>
                  Tick items in the list. You can mix types, e.g. a laptop, charger and ID card.
                </p>
              )}
            </aside>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={Boolean(step2Missing)}
              onClick={() => {
                setSubmitError('');
                setStep(3);
              }}
            >
              Continue
            </button>
            {step2Missing ? <span className="helper-text">{step2Missing}</span> : null}
          </div>
        </div>
      ) : null}

      {step === 3 && employee ? (
        <div className="grid" style={{ gap: 16 }}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="assign-date">Issue date</label>
              <input
                id="assign-date"
                className="input"
                type="date"
                max={todayInput()}
                value={details.assignedAt}
                onChange={(e) => {
                  setConfirmed(false);
                  setDetails({ ...details, assignedAt: e.target.value });
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="assign-return">Expected return date (optional)</label>
              <input
                id="assign-return"
                className="input"
                type="date"
                min={details.assignedAt || undefined}
                value={details.expectedReturnDate}
                onChange={(e) => setDetails({ ...details, expectedReturnDate: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="assign-notes">Notes (optional)</label>
            <textarea
              id="assign-notes"
              className="input"
              rows={2}
              placeholder="e.g. Issued for onboarding"
              value={details.remarks}
              onChange={(e) => setDetails({ ...details, remarks: e.target.value })}
            />
            <span className="helper-text">
              The employee is notified after saving and can acknowledge receipt in My Assets.
            </span>
          </div>

          <div className="card" style={{ background: 'var(--surface-muted)', boxShadow: 'none' }}>
            <h3 style={{ marginTop: 0 }}>Review</h3>
            <EmployeeSummary employee={employee} />
            <p style={{ margin: '16px 0 8px' }}>
              <strong>{itemCountLabel(count)}</strong> to be issued on{' '}
              <strong>{details.assignedAt ? formatDate(details.assignedAt) : '—'}</strong>
              {details.expectedReturnDate ? `, expected back ${formatDate(details.expectedReturnDate)}` : ''}.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset tag</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Make / model</th>
                    <th>Serial number</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAssets.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.asset_tag}</strong></td>
                      <td>{a.asset_name || '—'}</td>
                      <td>{a.category}</td>
                      <td>{makeModel(a)}</td>
                      <td>{a.serial_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginBottom: 0 }}>
              <span className="helper-text">Notes: </span>
              {details.remarks.trim() || '—'}
            </p>
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I confirm {itemCountLabel(count)} {count === 1 ? 'is' : 'are'} being handed over to{' '}
              <strong>{employee.full_name}</strong> ({employee.employee_id}) on{' '}
              {details.assignedAt ? formatDate(details.assignedAt) : '—'}.
            </span>
          </label>

          {submitError ? <div className="message message-error">{submitError}</div> : null}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="button" disabled={submitting} onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={submitting || Boolean(step3Missing)}
              onClick={submit}
            >
              {submitting ? 'Assigning…' : `Assign ${itemCountLabel(count)} to ${employee.full_name}`}
            </button>
            {step3Missing && !submitting ? <span className="helper-text">{step3Missing}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
