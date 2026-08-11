import { Router } from 'express';
import {
  listInvoices,
  getInvoice,
  getInvoiceReference,
  getInvoiceSettings,
  updateInvoiceSettings,
  createInvoice,
  updateInvoice,
  recordPayment,
  setPaymentOutcome,
  cancelInvoice,
  deleteInvoice
} from '../controllers/invoiceController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, allowRoles('SUPER_ADMIN'));
router.get('/reference', getInvoiceReference);
router.get('/settings', getInvoiceSettings);
router.put('/settings', updateInvoiceSettings);
router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.post('/', createInvoice);
router.put('/:id', updateInvoice);
router.post('/:id/payments', recordPayment);
router.patch('/:id/payment-outcome', setPaymentOutcome);
router.patch('/:id/cancel', cancelInvoice);
router.delete('/:id', deleteInvoice);
export default router;
