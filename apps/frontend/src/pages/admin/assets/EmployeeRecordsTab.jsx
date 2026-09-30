import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api.js';
import {
  ASSIGNMENT_STATUS_LABELS,
  AssetStatusBadge,
  CONDITION_LABELS,
  EmptyState,
  ErrorState,
  InfoItem,
  TableSkeleton,
  apiError,
  formatDate,
  itemCountLabel,
  makeModel,
  useDebouncedValue
} from './assetUi.jsx';
import { useAssetActions } from './useAssetActions.jsx';

function EmployeeList({ companies, refreshKey, onOpen }) {
  const [query, setQuery] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [holdersOnly, setHoldersOnly] = useState(false);
  const search = useDebouncedValue(query);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/assets/employee-records', {
        params: {
          search: search || undefined,
          companyId: companyId || undefined,
          withAssets: holdersOnly ? 1 : undefined
        }
      });
      setRows(res.data.data || []);
    } catch (err) {
      setRows([]);
      setError(apiError(err, 'Unable to load employee asset records.'));
    } finally {
      setLoading(false);
    }
  }, [search, companyId, holdersOnly]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="card">
      <div className="section-heading">
        <div>
          <h2>Employee asset records</h2>
          <p className="page-subtitle">See what each employee currently holds and everything they have held before.</p>
        </div>
      </div>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search by name, employee ID or department"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search employees"
        />
        {companies.length > 1 ? (
          <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={holdersOnly} onChange={(e) => setHoldersOnly(e.target.checked)} />
          Only employees holding items
        </label>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : !error && !rows.length ? (
        <EmptyState title={holdersOnly ? 'No employees currently hold assets' : 'No employees found'}>
          <span>{search ? 'Try a different search.' : 'Assigned items will appear here.'}</span>
        </EmptyState>
      ) : rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Items currently assigned</th>
                <th>Most recent assignment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.full_name}</strong>
                    <div className="helper-text">
                      {e.employee_id}
                      {e.status !== 'ACTIVE' ? ` · ${e.status}` : ''}
                    </div>
                  </td>
                  <td>{e.department_name || '—'}</td>
                  <td>
                    {e.active_count ? (
                      <strong>{itemCountLabel(e.active_count)}</strong>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>None</span>
                    )}
                  </td>
                  <td>{e.last_assigned_at ? formatDate(e.last_assigned_at) : '—'}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => onOpen(e.id)}>
                      View assets
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function EmployeeRecord({ employeeId, canManage, refreshKey, onBack, onChanged, onOpenAsset, goTo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/assets/employee/${employeeId}`, { params: { history: 1 } });
      setData(res.data.data);
    } catch (err) {
      setData(null);
      setError(apiError(err, 'Unable to load this employee’s assets.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const actions = useAssetActions((message) => {
    onChanged(message);
  });

  const employee = data?.employee;
  const current = (data?.assets || []).filter((row) => row.assignment_status === 'ACTIVE');
  const history = (data?.assets || []).filter((row) => row.assignment_status !== 'ACTIVE');

  function itemFor(row) {
    return {
      assetId: row.asset_id,
      assetTag: row.asset_tag,
      assetName: row.asset_name,
      category: row.category,
      companyId: employee.company_id,
      employeeId: employee.id,
      employeeName: employee.full_name,
      employeeCode: employee.employee_id,
      assignedAt: row.assigned_at
    };
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div>
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          ← All employees
        </button>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading && !data ? <TableSkeleton columns={4} rows={3} /> : null}

      {employee ? (
        <>
          <div className="card">
            <div className="section-heading">
              <div>
                <h2>{employee.full_name}</h2>
                <p className="page-subtitle">
                  {employee.employee_id}
                  {employee.status !== 'ACTIVE' ? ` · ${employee.status}` : ''}
                </p>
              </div>
              {canManage && employee.status === 'ACTIVE' ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => goTo('assign', { employee: String(employee.id) })}
                >
                  Assign more items
                </button>
              ) : null}
            </div>
            <div className="info-grid">
              <InfoItem label="Currently assigned">
                <span style={{ fontSize: 20, fontWeight: 800 }}>{itemCountLabel(current.length)}</span>
              </InfoItem>
              <InfoItem label="Department">{employee.department_name}</InfoItem>
              <InfoItem label="Designation">{employee.designation}</InfoItem>
              <InfoItem label="Location">{employee.work_location}</InfoItem>
              <InfoItem label="Company">{employee.company_name}</InfoItem>
            </div>
          </div>

          <div className="card">
            <div className="section-heading">
              <h2>Currently assigned assets</h2>
            </div>
            {current.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Asset tag</th>
                      <th>Item</th>
                      <th>Make / model</th>
                      <th>Serial number</th>
                      <th>Issue date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.map((row) => (
                      <tr key={row.assignment_id}>
                        <td><strong>{row.asset_tag}</strong></td>
                        <td>
                          {row.asset_name || '—'}
                          <div className="helper-text">{row.category}</div>
                        </td>
                        <td>{makeModel(row)}</td>
                        <td>{row.serial_number || '—'}</td>
                        <td>
                          {formatDate(row.assigned_at)}
                          {row.assigned_by_name ? <div className="helper-text">by {row.assigned_by_name}</div> : null}
                        </td>
                        <td>
                          <AssetStatusBadge status={row.asset_status} />
                          <div className="helper-text">
                            {Number(row.acknowledged) > 0 ? 'Acknowledged' : 'Not yet acknowledged'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" type="button" onClick={() => onOpenAsset(row.asset_id)}>
                              Details &amp; history
                            </button>
                            {canManage ? (
                              <>
                                <button className="btn btn-primary" type="button" onClick={() => actions.openReturn(itemFor(row))}>
                                  Return
                                </button>
                                {row.asset_status === 'ASSIGNED' ? (
                                  <button className="btn btn-secondary" type="button" onClick={() => actions.openRepair(itemFor(row))}>
                                    Report repair
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No items currently assigned">
                {canManage && employee.status === 'ACTIVE' ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    style={{ marginTop: 10 }}
                    onClick={() => goTo('assign', { employee: String(employee.id) })}
                  >
                    Assign assets to {employee.full_name}
                  </button>
                ) : null}
              </EmptyState>
            )}
          </div>

          <div className="card">
            <div className="section-heading">
              <div>
                <h2>Assignment history</h2>
                <p className="page-subtitle">Items previously assigned and returned, transferred or lost. Records are never deleted.</p>
              </div>
            </div>
            {history.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Asset tag</th>
                      <th>Item</th>
                      <th>Issued</th>
                      <th>Returned</th>
                      <th>Outcome</th>
                      <th>Return condition</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.assignment_id}>
                        <td>
                          <button type="button" className="link-button" onClick={() => onOpenAsset(row.asset_id)}>
                            {row.asset_tag}
                          </button>
                        </td>
                        <td>
                          {row.asset_name || '—'}
                          <div className="helper-text">{row.category}</div>
                        </td>
                        <td>{formatDate(row.assigned_at)}</td>
                        <td>{row.returned_at ? formatDate(row.returned_at) : '—'}</td>
                        <td>
                          {ASSIGNMENT_STATUS_LABELS[row.assignment_status] || row.assignment_status}
                          {row.return_status === 'DAMAGED' ? <div className="helper-text">Sent to repair</div> : null}
                        </td>
                        <td>{CONDITION_LABELS[row.return_condition] || row.return_condition || '—'}</td>
                        <td>{row.return_remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="helper-text" style={{ margin: 0 }}>No previous assignments.</p>
            )}
          </div>
        </>
      ) : null}

      {actions.dialogs}
    </div>
  );
}

export default function EmployeeRecordsTab({
  companies,
  canManage,
  refreshKey,
  employeeId,
  onOpenEmployee,
  onChanged,
  onOpenAsset,
  goTo
}) {
  if (employeeId) {
    return (
      <EmployeeRecord
        employeeId={employeeId}
        canManage={canManage}
        refreshKey={refreshKey}
        onBack={() => onOpenEmployee(null)}
        onChanged={onChanged}
        onOpenAsset={onOpenAsset}
        goTo={goTo}
      />
    );
  }
  return <EmployeeList companies={companies} refreshKey={refreshKey} onOpen={onOpenEmployee} />;
}
