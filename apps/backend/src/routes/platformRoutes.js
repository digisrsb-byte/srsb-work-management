import { Router } from 'express';
import { body, param } from 'express-validator';
import { requirePlatformKey } from '../middleware/platformAuth.js';
import { validate } from '../middleware/validate.js';
import {
  createActivationCodeController,
  listActivationCodesController,
  listCompaniesController,
  setCompanyStatusController
} from '../controllers/platformController.js';

const router = Router();

router.use(requirePlatformKey);

router.get('/companies', listCompaniesController);

router.patch(
  '/companies/:code/status',
  [
    param('code').trim().notEmpty(),
    body('status')
      .trim()
      .isIn(['ACTIVE', 'SUSPENDED'])
      .withMessage('Status must be ACTIVE or SUSPENDED.'),
    validate
  ],
  setCompanyStatusController
);

router.get('/activation-codes', listActivationCodesController);

router.post(
  '/activation-codes',
  [
    body('note').optional().trim().isLength({ max: 255 }),
    body('expiresDays').optional().isInt({ min: 1, max: 3650 }),
    body('createdBy').optional().trim().isLength({ max: 160 }),
    validate
  ],
  createActivationCodeController
);

export default router;
