import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireSrsbHeadAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createActivationCodeController,
  listActivationCodesController
} from '../controllers/platformController.js';

const router = Router();

router.use(authenticate, requireSrsbHeadAdmin);

router.get('/', listActivationCodesController);

router.post(
  '/',
  [
    body('note').optional().trim().isLength({ max: 255 }),
    body('expiresDays').optional().isInt({ min: 1, max: 3650 }),
    validate
  ],
  (req, _res, next) => {
    // Attribute generated codes to the signed-in head admin.
    if (!req.body.createdBy && req.user?.email) {
      req.body.createdBy = req.user.email;
    }
    next();
  },
  createActivationCodeController
);

export default router;
