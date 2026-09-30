import { useState } from 'react';
import {
  CompleteRepairDialog,
  ReportRepairDialog,
  RetireAssetDialog,
  ReturnAssetDialog,
  TransferAssetDialog
} from './assetDialogs.jsx';

export function useAssetActions(onChanged) {
  const [dialog, setDialog] = useState(null);

  const close = () => setDialog(null);
  const done = (message) => {
    setDialog(null);
    onChanged(message);
  };

  let element = null;
  if (dialog?.type === 'return') {
    element = <ReturnAssetDialog item={dialog.item} onClose={close} onDone={done} />;
  } else if (dialog?.type === 'repair') {
    element = <ReportRepairDialog item={dialog.item} onClose={close} onDone={done} />;
  } else if (dialog?.type === 'complete') {
    element = (
      <CompleteRepairDialog
        service={dialog.service}
        item={dialog.item}
        onClose={close}
        onDone={done}
      />
    );
  } else if (dialog?.type === 'transfer') {
    element = <TransferAssetDialog item={dialog.item} onClose={close} onDone={done} />;
  } else if (dialog?.type === 'retire') {
    element = <RetireAssetDialog item={dialog.item} onClose={close} onDone={done} />;
  }

  return {
    openReturn: (item) => setDialog({ type: 'return', item }),
    openRepair: (item) => setDialog({ type: 'repair', item }),
    openComplete: (service, item) => setDialog({ type: 'complete', service, item }),
    openTransfer: (item) => setDialog({ type: 'transfer', item }),
    openRetire: (item) => setDialog({ type: 'retire', item }),
    dialogs: element
  };
}

export function itemFromAssetRow(asset) {
  return {
    assetId: asset.id,
    assetTag: asset.asset_tag,
    assetName: asset.asset_name,
    category: asset.category,
    companyId: asset.company_id,
    employeeId: asset.assigned_employee_id || null,
    employeeName: asset.assigned_to || null,
    employeeCode: asset.assigned_employee_code || null,
    assignedAt: asset.assigned_at || null
  };
}
