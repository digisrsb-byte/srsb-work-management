import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api.js';
import {
  ASSIGNMENT_STATUS_LABELS,
  AssetStatusBadge,
  CONDITION_LABELS,
  ErrorState,
  InfoItem,
  Modal,
  REPAIR_OUTCOME_LABELS,
  TableSkeleton,
  apiError,
  assetTitle,
  formatDate,
  formatMoney
} from './assetUi.jsx';
import { useAssetActions } from './useAssetActions.jsx';

export default function AssetDetailPanel({
  assetId,
  canManage,
  onClose,
  onChanged,
  onAssign,
  onOpenEmployee
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/assets/${assetId}`);
      setData(res.data.data);
    } catch (err) {
      setError(apiError(err, 'Unable to load asset details.'));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const actions = useAssetActions((message) => {
    setNotice(message);
    onChanged(message);
    load();
  });

  if (actions.dialogs) return actions.dialogs;

  const asset = data?.asset;
  const current = data?.currentAssignment;
  const openRepairs = (data?.services || []).filter(
    (s) => s.status !== 'CLOSED' && ['REPAIR', 'DAMAGE'].includes(s.record_type)
  );
  const item = asset
    ? {
        assetId: asset.id,
        assetTag: asset.asset_tag,
        assetName: asset.asset_name,
        category: asset.category,
        companyId: asset.company_id,
        employeeId: current?.employee_id || null,
        employeeName: current?.full_name || null,
        employeeCode: current?.emp_code || null,
        assignedAt: current?.assigned_at || null
      }
    : null;

  return (
    <Modal
      title={asset ? `${asset.asset_tag} — ${assetTitle(asset)}` : 'Asset details'}
      subtitle={asset ? `${asset.category} · ${asset.company_name}` : undefined}
      onClose={onClose}
      width={900}
    >
      {loading && !data ? <TableSkeleton columns={4} rows={3} /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <div className="message message-success" style={{ marginBottom: 12 }}>{notice}</div> : null}

      {asset ? (
        <div className="grid" style={{ gap: 20 }}>
          <div className="info-grid">
            <InfoItem label="Status"><AssetStatusBadge status={asset.status} /></InfoItem>
            <InfoItem label="Asset tag">{asset.asset_tag}</InfoItem>
            <InfoItem label="Make">{asset.make}</InfoItem>
            <InfoItem label="Model">{asset.model}</InfoItem>
            <InfoItem label="Serial number">{asset.serial_number}</InfoItem>
            <InfoItem label="Condition">{CONDITION_LABELS[asset.condition_label] || asset.condition_label}</InfoItem>
            <InfoItem label="Office / location">{asset.location}</InfoItem>
            <InfoItem label="Purchase date">{asset.purchase_date ? formatDate(asset.purchase_date) : null}</InfoItem>
            <InfoItem label="Purchase cost">{asset.purchase_cost != null ? formatMoney(asset.purchase_cost) : null}</InfoItem>
            <InfoItem label="Warranty expiry">{asset.warranty_expiry ? formatDate(asset.warranty_expiry) : null}</InfoItem>
          </div>
          {asset.notes ? (
            <div className="hint-box" style={{ whiteSpace: 'pre-line' }}>{asset.notes}</div>
          ) : null}

          <div className="card" style={{ background: 'var(--surface-muted)', boxShadow: 'none' }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <h2>Current holder</h2>
            </div>
            {current ? (
              <p style={{ margin: 0 }}>
                Assigned to{' '}
                <button type="button" className="link-button" onClick={() => onOpenEmployee(current.employee_id)}>
                  {current.full_name} ({current.emp_code})
                </button>{' '}
                since {formatDate(current.assigned_at)}
                {current.assigned_by_name ? ` · issued by ${current.assigned_by_name}` : ''}
              </p>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Not assigned to anyone.</p>
            )}

            {canManage ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {current ? (
                  <>
                    <button className="btn btn-primary" type="button" onClick={() => actions.openReturn(item)}>
                      Record return
                    </button>
                    {asset.status === 'ASSIGNED' ? (
                      <button className="btn btn-secondary" type="button" onClick={() => actions.openTransfer(item)}>
                        Transfer to another employee
                      </button>
                    ) : null}
                  </>
                ) : null}
                {asset.status === 'AVAILABLE' ? (
                  <button className="btn btn-primary" type="button" onClick={() => onAssign(asset.id)}>
                    Assign to an employee
                  </button>
                ) : null}
                {['AVAILABLE', 'ASSIGNED'].includes(asset.status) ? (
                  <button className="btn btn-secondary" type="button" onClick={() => actions.openRepair(item)}>
                    Report repair / damage
                  </button>
                ) : null}
                {!current && asset.status !== 'RETIRED' ? (
                  <button className="btn btn-danger" type="button" onClick={() => actions.openRetire(item)}>
                    Retire
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {openRepairs.length ? (
            <div>
              <h3 style={{ marginTop: 0 }}>Open repairs</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Issue date</th>
                      <th>Issue</th>
                      <th>Reported by</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openRepairs.map((s) => (
                      <tr key={s.id}>
                        <td>{formatDate(s.issue_date || s.created_at)}</td>
                        <td>{s.description}</td>
                        <td>{s.reported_by_name || '—'}</td>
                        <td>
                          {canManage ? (
                            <button className="btn btn-primary" type="button" onClick={() => actions.openComplete(s, item)}>
                              Complete repair
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div>
            <h3 style={{ marginTop: 0 }}>Assignment history</h3>
            {data.assignments?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Issued</th>
                      <th>Returned</th>
                      <th>Status</th>
                      <th>Condition (out → in)</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assignments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button type="button" className="link-button" onClick={() => onOpenEmployee(a.employee_id)}>
                            {a.full_name}
                          </button>
                          <div className="helper-text">{a.emp_code}</div>
                        </td>
                        <td>
                          {formatDate(a.assigned_at)}
                          {a.assigned_by_name ? <div className="helper-text">by {a.assigned_by_name}</div> : null}
                        </td>
                        <td>{a.returned_at ? formatDate(a.returned_at) : '—'}</td>
                        <td>{ASSIGNMENT_STATUS_LABELS[a.status] || a.status}</td>
                        <td>
                          {CONDITION_LABELS[a.condition_at_assignment] || a.condition_at_assignment || '—'}
                          {a.return_condition ? ` → ${CONDITION_LABELS[a.return_condition] || a.return_condition}` : ''}
                        </td>
                        <td>{a.return_remarks || a.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="helper-text">This asset has never been assigned.</p>
            )}
          </div>

          <div>
            <h3 style={{ marginTop: 0 }}>Repair, damage and transfer log</h3>
            {data.services?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.map((s) => (
                      <tr key={s.id}>
                        <td>{formatDate(s.issue_date || s.created_at)}</td>
                        <td>{s.record_type}</td>
                        <td>
                          {s.description}
                          {s.resolution_notes ? <div className="helper-text">Resolution: {s.resolution_notes}</div> : null}
                        </td>
                        <td>{s.status === 'CLOSED' ? `Closed ${s.resolved_at ? formatDate(s.resolved_at) : ''}` : 'Open'}</td>
                        <td>{REPAIR_OUTCOME_LABELS[s.outcome] || s.outcome || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="helper-text">No repair or transfer records.</p>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
