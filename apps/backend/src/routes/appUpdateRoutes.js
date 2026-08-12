import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getLatestAppUpdate,
  downloadLatestAppUpdate
} from '../controllers/appUpdateController.js';

const router = Router();

const updateCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

const updateDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/latest', updateCheckLimiter, getLatestAppUpdate);
router.get('/download/:assetId', updateDownloadLimiter, downloadLatestAppUpdate);

export default router;
