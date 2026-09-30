import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Package, UserCheck, Wrench } from 'lucide-react';
import api from '../../../services/api.js';
import StatCard from '../../../components/StatCard.jsx';
import { EmptyState, ErrorState, TableSkeleton, apiError } from './assetUi.jsx';

function inventoryLink(params) {
  const search = new URLSearchParams({ tab: 'inventory', ...params });
  return `/admin/assets?${search.toString()}`;
}

export default function OverviewTab({ companies, canManage, refreshKey, goTo }) {
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/assets/summary', {
        params: { companyId: companyId || undefined }
      });
      setData(res.data.data);
    } catch (err) {
      setError(apiError(err, 'Unable to load the asset overview.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const scoped = companyId ? { companyId } : {};
  const totals = data?.totals;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        {companies.length > 1 ? (
          <select
            className="input"
            style={{ maxWidth: 280 }}
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            aria-label="Company"
          >
            <option value="">All my companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        {canManage ? (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="button" onClick={() => goTo('inventory', { register: '1' })}>
              Register asset
            </button>
            <button className="btn btn-primary" type="button" onClick={() => goTo('assign')}>
              Assign assets
            </button>
          </div>
        ) : null}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {loading && !data ? (
        <div className="grid stats-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ width: '50%' }} />
              <div className="skeleton" style={{ width: '30%', height: 26, marginTop: 12 }} />
            </div>
          ))}
        </div>
      ) : null}

      {totals ? (
        <>
          <div className="grid stats-grid">
            <StatCard
              label="Total assets"
              value={totals.total}
              icon={Package}
              hint={`${totals.retired} retired · ${totals.lost} lost`}
              to={inventoryLink(scoped)}
            />
            <StatCard
              label="Available assets"
              value={totals.available}
              icon={CheckCircle2}
              hint="Ready to assign"
              to={inventoryLink({ ...scoped, status: 'AVAILABLE' })}
            />
            <StatCard
              label="Currently assigned"
              value={totals.assigned}
              icon={UserCheck}
              hint={`Held by ${data.employeesWithAssets} employee${data.employeesWithAssets === 1 ? '' : 's'}`}
              to={inventoryLink({ ...scoped, status: 'ASSIGNED' })}
            />
            <StatCard
              label="Under repair"
              value={totals.underRepair}
              icon={Wrench}
              hint={`${data.openRepairs} open repair record${data.openRepairs === 1 ? '' : 's'}`}
              to={inventoryLink({ ...scoped, status: 'REPAIR' })}
            />
          </div>

          <div className="card">
            <div className="section-heading">
              <div>
                <h2>Assets by type</h2>
                <p className="page-subtitle">Click a type to open it in the inventory.</p>
              </div>
            </div>
            {loading ? (
              <TableSkeleton columns={5} rows={3} />
            ) : data.byCategory.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Total</th>
                      <th>Available</th>
                      <th>Assigned</th>
                      <th>Under repair</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((row) => (
                      <tr key={row.category}>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => goTo('inventory', { ...scoped, category: row.category })}
                          >
                            {row.category}
                          </button>
                        </td>
                        <td>{row.total}</td>
                        <td>{row.available}</td>
                        <td>{row.assigned}</td>
                        <td>{row.underRepair}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No assets registered yet">
                {canManage ? (
                  <button className="btn btn-primary" type="button" style={{ marginTop: 10 }} onClick={() => goTo('inventory', { register: '1' })}>
                    Register the first asset
                  </button>
                ) : (
                  <span>Ask Admin/HR to register company assets.</span>
                )}
              </EmptyState>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
