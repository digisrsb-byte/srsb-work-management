import { Router } from 'express';
import { body } from 'express-validator';
import {
  listCandidates,
  getCandidateReferenceData,
  listCandidatePlacements,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  linkCandidateApplication,
  updateCandidateStage,
  deleteCandidateApplication,
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
router.get('/reference-data', allowRoles(...candidateRoles), getCandidateReferenceData);
router.get('/placements', allowRoles(...candidateRoles), listCandidatePlacements);
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
router.delete('/:id', allowRoles('SUPER_ADMIN','ADMIN','HR'), deleteCandidate);
router.post('/:id/applications', allowRoles(...candidateRoles), linkCandidateApplication);
router.put('/applications/:applicationId/stage', allowRoles(...candidateRoles), updateCandidateStage);
router.delete('/:id/applications/:applicationId', allowRoles('SUPER_ADMIN','ADMIN','HR','MANAGER'), deleteCandidateApplication);
router.get('/:id/history', allowRoles(...candidateRoles), getCandidateHistory);
router.post('/:id/history', allowRoles(...candidateRoles), createCandidateHistory);
router.put('/:id/history/:historyId', allowRoles(...candidateRoles), updateCandidateHistory);
router.delete('/:id/history/:historyId', allowRoles('SUPER_ADMIN','ADMIN','HR'), deleteCandidateHistory);

export default router;

