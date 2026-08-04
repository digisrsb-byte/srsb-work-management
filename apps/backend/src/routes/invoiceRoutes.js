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
router.get('/', allowRoles('SUPER_ADMIN'), listInvoices);
router.get('/:id/file', allowRoles('SUPER_ADMIN'), downloadGstFile);
router.get('/:id', allowRoles('SUPER_ADMIN'), getInvoice);
router.post('/', allowRoles('SUPER_ADMIN'), createInvoice);
router.put('/:id', allowRoles('SUPER_ADMIN'), updateInvoice);
router.post('/:id/payments', allowRoles('SUPER_ADMIN'), recordPayment);
router.delete('/:id', allowRoles('SUPER_ADMIN'), deleteInvoice);
export default router;
