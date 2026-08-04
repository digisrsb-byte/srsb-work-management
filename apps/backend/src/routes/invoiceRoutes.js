import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  recordPayment,
  downloadGstFile,
  deleteInvoice
} from '../controllers/invoiceController.js';

const router = Router();
router.use(authenticate);
router.get('/', allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), listInvoices);
router.get('/:id/file', allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), downloadGstFile);
router.get('/:id', allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), getInvoice);
router.post('/', allowRoles('SUPER_ADMIN','ADMIN'), createInvoice);
router.put('/:id', allowRoles('SUPER_ADMIN','ADMIN'), updateInvoice);
router.post('/:id/payments', allowRoles('SUPER_ADMIN','ADMIN'), recordPayment);
router.delete('/:id', allowRoles('SUPER_ADMIN','ADMIN'), deleteInvoice);
export default router;
