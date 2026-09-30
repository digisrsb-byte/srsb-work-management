import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../services/api.js';
import {
  AssetStatusBadge,
  EmptyState,
  ErrorState,
  REPAIR_OUTCOME_LABELS,
  TableSkeleton,
  apiError,
  formatDate,
  makeModel,
  useDebouncedValue
} from './assetUi.jsx';
import { itemFromAssetRow, useAssetActions } from './useAssetActions.jsx';

function repairItem(row) {
  return {
    assetId: row.asset_id,
    assetTag: row.asset_tag,
    assetName: row.asset_name,
    category: row.category,
    companyId: row.company_id,
    employeeId: row.assigned_employee_id || null,
    employeeName: row.assigned_to || null,
    employeeCode: row.assigned_employee_code || null
  };
}

export default function RepairsTab({ canManage, refreshKey, onChanged, onOpenAsset, onOpenEmployee }) {
  const [openRepairs, setOpenRepairs] = useState([]);
  const [closedRepairs, setClosedRepairs] = useState([]);
  const [repairsLoading, setRepairsLoading] = useState(true);
  const [repairsError, setRepairsError] = useState('');

  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [assigned, setAssigned] = useState([]);
  const [assignedLoading, setAssignedLoading] = useState(true);
  const [assignedError, setAssignedError] = useState('');

  const loadRepairs = useCallback(async () => {
    setRepairsLoading(true);
    setRepairsError('');
    try {
      const [openRes, closedRes] = await Promise.all([
        api.get('/assets/repairs', { params: { state: 'open' } }),
        api.get('/assets/repairs', { params: { state: 'closed' } })
      ]);
      setOpenRepairs(openRes.data.data || []);
      setClosedRepairs((closedRes.data.data || []).slice(0, 10));
    } catch (err) {
      setRepairsError(apiError(err, 'Unable to load repair records.'));
    } finally {
      setRepairsLoading(false);
    }
  }, []);

  const loadAssigned = useCallback(async () => {
    setAssignedLoading(true);
    setAssignedError('');
    try {
      const res = await api.get('/assets', { params: { search: search || undefined } });
      setAssigned((res.data.data || []).filter((a) => a.active_assignment_id));
    } catch (err) {
      setAssigned([]);
      setAssignedError(apiError(err, 'Unable to load assigned assets.'));
    } finally {
      setAssignedLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadRepairs();
  }, [loadRepairs, refreshKey]);

  useEffect(() => {
    loadAssigned();
  }, [loadAssigned, refreshKey]);

  const actions = useAssetActions((message) => onChanged(message));

  const repairRows = useMemo(
    () => openRepairs.filter((r) => ['REPAIR', 'DAMAGE'].includes(r.record_type)),
    [openRepairs]
  );
  const otherOpen = useMemo(
    () => openRepairs.filter((r) => !['REPAIR', 'DAMAGE'].includes(r.record_type)),
    [openRepairs]
  );

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card">
        <div className="section-heading">
          <div>
            <h2>Open repairs</h2>
            <p className="page-subtitle">
              Items stay Under Repair until you complete the repair and confirm they are usable.
            </p>
          </div>
        </div>
        {repairsError ? <ErrorState message={repairsError} onRetry={loadRepairs} /> : null}
        {repairsLoading ? (
          <TableSkeleton columns={6} rows={3} />
        ) : !repairsError && !repairRows.length && !otherOpen.length ? (
          <EmptyState title="No open repairs">
            <span>Use “Report repair” on an asset or record a damaged return to start one.</span>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Issue</th>
                  <th>Issue date</th>
                  <th>Currently with</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...repairRows, ...otherOpen].map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className="link-button" onClick={() => onOpenAsset(row.asset_id)}>
                        {row.asset_tag}
                      </button>
                      <div className="helper-text">{row.asset_name || row.category}</div>
                    </td>
                    <td>{row.record_type}</td>
                    <td>
                      {row.description}
                      {row.reported_by_name ? <div className="helper-text">Reported by {row.reported_by_name}</div> : null}
                    </td>
                    <td>{formatDate(row.issue_date || row.created_at)}</td>
                    <td>
                      {row.assigned_employee_id ? (
                        <button type="button" className="link-button" onClick={() => onOpenEmployee(row.assigned_employee_id)}>
                          {row.assigned_to}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>In storage</span>
                      )}
                    </td>
                    <td><AssetStatusBadge status={row.asset_status} /></td>
                    <td>
                      {canManage ? (
                        <button className="btn btn-primary" type="button" onClick={() => actions.openComplete(row, repairItem(row))}>
                          {['REPAIR', 'DAMAGE'].includes(row.record_type) ? 'Complete repair' : 'Close request'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-heading">
          <div>
            <h2>Record a return</h2>
            <p className="page-subtitle">Find the item by tag or employee, then record the return date and condition.</p>
          </div>
        </div>
        <div className="toolbar">
          <input
            className="input"
            placeholder="Search asset tag, name, serial or employee"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search assigned assets"
          />
        </div>
        {assignedError ? <ErrorState message={assignedError} onRetry={loadAssigned} /> : null}
        {assignedLoading ? (
          <TableSkeleton columns={6} rows={3} />
        ) : !assignedError && !assigned.length ? (
          <EmptyState title={search ? 'No assigned items match your search' : 'No items are currently assigned'}>
            <span>Only items that are with an employee can be returned.</span>
          </EmptyState>
        ) : assigned.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset tag</th>
                  <th>Item</th>
                  <th>Make / model</th>
                  <th>Assigned to</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((asset) => (
                  <tr key={asset.id}>
                    <td><strong>{asset.asset_tag}</strong></td>
                    <td>
                      {asset.asset_name || '—'}
                      <div className="helper-text">{asset.category}</div>
                    </td>
                    <td>{makeModel(asset)}</td>
                    <td>
                      <button type="button" className="link-button" onClick={() => onOpenEmployee(asset.assigned_employee_id)}>
                        {asset.assigned_to}
                      </button>
                      <div className="helper-text">{asset.assigned_employee_code}</div>
                    </td>
                    <td>{formatDate(asset.assigned_at)}</td>
                    <td><AssetStatusBadge status={asset.status} /></td>
                    <td>
                      {canManage ? (
                        <button className="btn btn-primary" type="button" onClick={() => actions.openReturn(itemFromAssetRow(asset))}>
                          Record return
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="section-heading">
          <h2>Recently closed repairs</h2>
        </div>
        {repairsLoading ? (
          <TableSkeleton columns={5} rows={2} />
        ) : closedRepairs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Issue</th>
                  <th>Issue date</th>
                  <th>Completed</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {closedRepairs.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className="link-button" onClick={() => onOpenAsset(row.asset_id)}>
                        {row.asset_tag}
                      </button>
                      <div className="helper-text">{row.asset_name || row.category}</div>
                    </td>
                    <td>
                      {row.description}
                      {row.resolution_notes ? <div className="helper-text">Resolution: {row.resolution_notes}</div> : null}
                    </td>
                    <td>{formatDate(row.issue_date || row.created_at)}</td>
                    <td>
                      {row.resolved_at ? formatDate(row.resolved_at) : '—'}
                      {row.resolved_by_name ? <div className="helper-text">by {row.resolved_by_name}</div> : null}
                    </td>
                    <td>{REPAIR_OUTCOME_LABELS[row.outcome] || row.outcome || 'Closed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="helper-text" style={{ margin: 0 }}>No closed repairs yet.</p>
        )}
      </div>

      {actions.dialogs}
    </div>
  );
}
