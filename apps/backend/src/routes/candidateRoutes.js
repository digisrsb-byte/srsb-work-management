import { Router } from 'express';
import { body } from 'express-validator';
import {
  listCandidates,
  createCandidate,
  updateCandidate,
  updateCandidateStage,
  getCandidateHistory,
  createCandidateHistory,
  updateCandidateHistory,
  deleteCandidateHistory
} from '../controllers/candidateController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const candidateRoles = ['SUPER_ADMIN','ADMIN','HR','MANAGER','RECRUITER','EMPLOYEE'];

router.use(authenticate);
router.get('/', allowRoles(...candidateRoles), listCandidates);
router.post(
  '/',
  allowRoles(...candidateRoles),
  [
    body('fullName').trim().notEmpty().withMessage('Candidate name is required.'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address.'),
    body('openingId').optional({ checkFalsy: true }).isInt({ min: 1 }),
    validate
  ],
  createCandidate
);
router.put('/:id', allowRoles(...candidateRoles), updateCandidate);
router.put('/applications/:applicationId/stage', allowRoles(...candidateRoles), updateCandidateStage);
router.get('/:id/history', allowRoles(...candidateRoles), getCandidateHistory);
router.post('/:id/history', allowRoles(...candidateRoles), createCandidateHistory);
router.put('/:id/history/:historyId', allowRoles(...candidateRoles), updateCandidateHistory);
router.delete('/:id/history/:historyId', allowRoles('SUPER_ADMIN','ADMIN','HR'), deleteCandidateHistory);

export default router;
