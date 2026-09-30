import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api.js';
import { ASSET_CATEGORIES } from '../../../constants/assetCategories.js';
import {
  ASSET_STATUS_LABELS,
  AssetStatusBadge,
  EmptyState,
  ErrorState,
  TableSkeleton,
  apiError,
  makeModel,
  useDebouncedValue
} from './assetUi.jsx';
import RegisterAssetForm from './RegisterAssetForm.jsx';

export default function InventoryTab({
  companies,
  canManage,
  refreshKey,
  initialFilters,
  openRegister,
  onChanged,
  onOpenAsset,
  onOpenEmployee,
  onAssign
}) {
  const [filters, setFilters] = useState({
    search: initialFilters.search || '',
    companyId: initialFilters.companyId || '',
    category: initialFilters.category || '',
    status: initialFilters.status || ''
  });
  const search = useDebouncedValue(filters.search);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRegister, setShowRegister] = useState(Boolean(openRegister && canManage));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/assets', {
        params: {
          search: search || undefined,
          companyId: filters.companyId || undefined,
          category: filters.category || undefined,
          status: filters.status || undefined
        }
      });
      setAssets(res.data.data || []);
    } catch (err) {
      setAssets([]);
      setError(apiError(err, 'Unable to load the asset inventory.'));
    } finally {
      setLoading(false);
    }
  }, [search, filters.companyId, filters.category, filters.status]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const hasFilters = Boolean(filters.search || filters.companyId || filters.category || filters.status);

  return (
    <div className="card">
      <div className="section-heading">
        <div>
          <h2>Asset inventory</h2>
          <p className="page-subtitle">
            One row per physical item.{' '}
            {!loading && !error ? `${assets.length} asset${assets.length === 1 ? '' : 's'} shown.` : ''}
          </p>
        </div>
        {canManage ? (
          <button className="btn btn-primary" type="button" onClick={() => setShowRegister(true)}>
            Register asset
          </button>
        ) : null}
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search tag, name, serial or employee"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          aria-label="Search assets"
        />
        {companies.length > 1 ? (
          <select
            className="input"
            value={filters.companyId}
            onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}
            aria-label="Company"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="input"
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          aria-label="Type"
        >
          <option value="">All types</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {hasFilters ? (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setFilters({ search: '', companyId: '', category: '', status: '' })}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {loading ? (
        <TableSkeleton columns={7} rows={5} />
      ) : !error && !assets.length ? (
        hasFilters ? (
          <EmptyState title="No assets match these filters">
            <span>Try a different search or clear the filters.</span>
          </EmptyState>
        ) : (
          <EmptyState title="No assets registered yet">
            {canManage ? (
              <button className="btn btn-primary" type="button" style={{ marginTop: 10 }} onClick={() => setShowRegister(true)}>
                Register the first asset
              </button>
            ) : (
              <span>Ask Admin/HR to register company assets.</span>
            )}
          </EmptyState>
        )
      ) : assets.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset tag</th>
                <th>Asset name / type</th>
                <th>Make / model</th>
                <th>Serial number</th>
                <th>Assigned employee</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td><strong>{asset.asset_tag}</strong></td>
                  <td>
                    {asset.asset_name || '—'}
                    <div className="helper-text">{asset.category}</div>
                  </td>
                  <td>{makeModel(asset)}</td>
                  <td>{asset.serial_number || '—'}</td>
                  <td>
                    {asset.assigned_employee_id ? (
                      <>
                        <button type="button" className="link-button" onClick={() => onOpenEmployee(asset.assigned_employee_id)}>
                          {asset.assigned_to}
                        </button>
                        <div className="helper-text">{asset.assigned_employee_code}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not assigned</span>
                    )}
                  </td>
                  <td>
                    <AssetStatusBadge status={asset.status} />
                    {Number(asset.open_repairs) > 0 ? (
                      <div className="helper-text">{asset.open_repairs} open repair</div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" type="button" onClick={() => onOpenAsset(asset.id)}>
                        View
                      </button>
                      {canManage && asset.status === 'AVAILABLE' ? (
                        <button className="btn btn-primary" type="button" onClick={() => onAssign(asset.id)}>
                          Assign
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showRegister ? (
        <RegisterAssetForm
          companies={companies}
          onClose={() => setShowRegister(false)}
          onSaved={(message) => onChanged(message)}
        />
      ) : null}
    </div>
  );
}
