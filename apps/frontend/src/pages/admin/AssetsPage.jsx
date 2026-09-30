import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import OverviewTab from './assets/OverviewTab.jsx';
import InventoryTab from './assets/InventoryTab.jsx';
import AssignAssetsTab from './assets/AssignAssetsTab.jsx';
import EmployeeRecordsTab from './assets/EmployeeRecordsTab.jsx';
import RepairsTab from './assets/RepairsTab.jsx';
import AssetDetailPanel from './assets/AssetDetailPanel.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'inventory', label: 'Asset Inventory' },
  { id: 'assign', label: 'Assign Assets', manageOnly: true },
  { id: 'employees', label: 'Employee Asset Records' },
  { id: 'repairs', label: 'Returns & Repairs' }
];

export default function AssetsPage() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user?.role);
  const canView = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(user?.role);

  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = TABS.filter((t) => !t.manageOnly || canManage);
  const requestedTab = searchParams.get('tab');
  const tab = visibleTabs.some((t) => t.id === requestedTab) ? requestedTab : 'overview';

  const [companies, setCompanies] = useState([]);
  const [companiesError, setCompaniesError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailAssetId, setDetailAssetId] = useState(null);

  useEffect(() => {
    if (!canView) return;
    api
      .get('/access/companies')
      .then((res) => setCompanies(res.data.data || []))
      .catch((err) => {
        setCompanies([]);
        if (err.response?.status !== 403) {
          setCompaniesError(err.response?.data?.message || 'Unable to load your companies.');
        }
      });
  }, [canView]);

  useEffect(() => {
    setNotice('');
  }, [tab]);

  const goTo = useCallback(
    (tabId, params = {}) => {
      setDetailAssetId(null);
      setSearchParams({ tab: tabId, ...params });
    },
    [setSearchParams]
  );

  const handleChanged = useCallback((message) => {
    if (message) setNotice(message);
    setRefreshKey((k) => k + 1);
  }, []);

  const openEmployee = useCallback(
    (employeeId) => goTo('employees', employeeId ? { employee: String(employeeId) } : {}),
    [goTo]
  );
  const assignAsset = useCallback(
    (assetId) => goTo('assign', { asset: String(assetId) }),
    [goTo]
  );

  if (!canView) {
    return (
      <div>
        <div className="section-heading">
          <h1 className="page-title">Asset Management</h1>
        </div>
        <div className="message message-error">
          Your role cannot view the company asset inventory. Open{' '}
          <Link to="/employee/assets">My Assets</Link> for items assigned to you, or{' '}
          <Link to="/admin/access-requests">submit an Access Request</Link>.
        </div>
      </div>
    );
  }

  return (
    <div className="asset-page">
      <div className="section-heading">
        <div>
          <h1 className="page-title">Asset Management</h1>
          <p className="page-subtitle">
            Register each item once, assign items to employees, and track returns and repairs with full history.
          </p>
        </div>
      </div>

      <nav className="asset-tabs" aria-label="Asset management sections">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`asset-tab ${tab === item.id ? 'active' : ''}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => {
              setNotice('');
              goTo(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {!canManage ? (
        <div className="hint-box" style={{ marginBottom: 14 }}>
          You have view-only access. Registering, assigning, returning and repairing assets requires Admin or HR.
        </div>
      ) : null}
      {companiesError ? <div className="message message-error" style={{ marginBottom: 14 }}>{companiesError}</div> : null}
      {notice ? (
        <div className="message message-success" role="status" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice}</span>
          <button type="button" className="link-button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      {tab === 'overview' ? (
        <OverviewTab companies={companies} canManage={canManage} refreshKey={refreshKey} goTo={goTo} />
      ) : null}

      {tab === 'inventory' ? (
        <InventoryTab
          key={searchParams.toString()}
          companies={companies}
          canManage={canManage}
          refreshKey={refreshKey}
          initialFilters={{
            status: searchParams.get('status') || '',
            category: searchParams.get('category') || '',
            companyId: searchParams.get('companyId') || '',
            search: searchParams.get('search') || ''
          }}
          openRegister={searchParams.get('register') === '1'}
          onChanged={handleChanged}
          onOpenAsset={setDetailAssetId}
          onOpenEmployee={openEmployee}
          onAssign={assignAsset}
        />
      ) : null}

      {tab === 'assign' && canManage ? (
        <AssignAssetsTab
          key={searchParams.toString()}
          presetEmployeeId={searchParams.get('employee')}
          presetAssetId={searchParams.get('asset')}
          onAssigned={handleChanged}
          onOpenEmployee={openEmployee}
          goTo={goTo}
        />
      ) : null}

      {tab === 'employees' ? (
        <EmployeeRecordsTab
          companies={companies}
          canManage={canManage}
          refreshKey={refreshKey}
          employeeId={searchParams.get('employee')}
          onOpenEmployee={openEmployee}
          onChanged={handleChanged}
          onOpenAsset={setDetailAssetId}
          goTo={goTo}
        />
      ) : null}

      {tab === 'repairs' ? (
        <RepairsTab
          canManage={canManage}
          refreshKey={refreshKey}
          onChanged={handleChanged}
          onOpenAsset={setDetailAssetId}
          onOpenEmployee={openEmployee}
        />
      ) : null}

      {detailAssetId ? (
        <AssetDetailPanel
          assetId={detailAssetId}
          canManage={canManage}
          onClose={() => setDetailAssetId(null)}
          onChanged={handleChanged}
          onAssign={assignAsset}
          onOpenEmployee={openEmployee}
        />
      ) : null}
    </div>
  );
}
