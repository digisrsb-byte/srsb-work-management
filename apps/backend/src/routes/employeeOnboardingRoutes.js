import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, allowRoles, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { onboardingUpload, uploadErrorMessage } from '../middleware/upload.js';
import {
  listOnboardingCases,
  getMyOnboarding,
  initiateOnboarding,
  getChecklist,
  listCaseDocuments,
  uploadDocument,
  uploadDocumentException,
  reviewDocument,
  submitDocuments,
  withdrawDocument,
  markNotApplicable,
  downloadDocument,
  getDocumentHistory,
  activateEmployee,
  resendInvitation,
  getActivationStatus,
  getChecklistTemplate,
  getDemoStatus,
  seedDemoCases,
  clearDemoCases
} from '../controllers/employeeOnboardingController.js';
import {
  downloadBankProof,
  getBankDetails,
  getBankHistory,
  reviewBankDetails,
  saveBankDraft,
  submitBankDetails
} from '../controllers/bankDetailsController.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const router = Router();
const reviewerRoles = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
const documentVerifierRoles = ['SUPER_ADMIN', 'ADMIN'];

function demoModeOrSuperAdmin(req, res, next) {
  if (env.demoMode || req.user.role === 'SUPER_ADMIN') return next();
  next(new AppError('Demo mode is disabled in this environment.', 403));
}

function acceptSingleFile(req, res, next) {
  onboardingUpload.single('file')(req, res, (err) => {
    if (err) {
      return next(new AppError(uploadErrorMessage(err), 400));
    }
    next();
  });
}

router.use(authenticate);

router.get('/', listOnboardingCases);
router.get('/my', getMyOnboarding);

router.post(
  '/initiate',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'),
  [
    body('candidateId').isInt({ min: 1 }),
    body('companyId').optional({ nullable: true }).isInt({ min: 1 })
  ],
  validate,
  initiateOnboarding
);

router.get('/checklist-template', allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'), getChecklistTemplate);

router.get('/demo/status', allowRoles(...reviewerRoles), getDemoStatus);

router.post(
  '/demo/seed',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'),
  [body('companyId').optional({ nullable: true }).isInt({ min: 1 })],
  validate,
  seedDemoCases
);

router.delete(
  '/demo',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'),
  demoModeOrSuperAdmin,
  clearDemoCases
);

router.get(
  '/:caseId/checklist',
  [param('caseId').isInt({ min: 1 })],
  validate,
  getChecklist
);

router.get(
  '/:caseId/documents',
  [param('caseId').isInt({ min: 1 })],
  validate,
  listCaseDocuments
);

// Normal flow: the employee uploads their own document.
router.post(
  '/:caseId/documents',
  [param('caseId').isInt({ min: 1 })],
  validate,
  acceptSingleFile,
  uploadDocument
);

// The employee sends their uploaded documents to Admin / Super Admin for verification.
router.post(
  '/:caseId/submit',
  [param('caseId').isInt({ min: 1 })],
  validate,
  submitDocuments
);

// Exceptional administrative upload with a recorded reason.
router.post(
  '/:caseId/documents/exception',
  allowRoles('SUPER_ADMIN', 'ADMIN'),
  [param('caseId').isInt({ min: 1 })],
  validate,
  acceptSingleFile,
  uploadDocumentException
);

// Bank details: a separate onboarding section from the document checklist.
// Sensitive fields are validated in the controller so their values never appear in error details.
router.get(
  '/:caseId/bank-details',
  [param('caseId').isInt({ min: 1 })],
  validate,
  getBankDetails
);

// Save Draft (employee only; POST so onboarding-only sessions can use it). Optional proof file.
router.post(
  '/:caseId/bank-details',
  [param('caseId').isInt({ min: 1 })],
  validate,
  acceptSingleFile,
  saveBankDraft
);

router.post(
  '/:caseId/bank-details/submit',
  [param('caseId').isInt({ min: 1 })],
  validate,
  submitBankDetails
);

router.patch(
  '/:caseId/bank-details/review',
  allowRoles(...documentVerifierRoles),
  requirePermission('onboarding', 'approve'),
  [param('caseId').isInt({ min: 1 })],
  validate,
  reviewBankDetails
);

router.get(
  '/:caseId/bank-details/history',
  [param('caseId').isInt({ min: 1 })],
  validate,
  getBankHistory
);

router.get(
  '/:caseId/bank-details/proofs/:proofId/download',
  [param('caseId').isInt({ min: 1 }), param('proofId').isInt({ min: 1 })],
  validate,
  downloadBankProof
);

router.patch(
  '/documents/:documentId/review',
  allowRoles(...documentVerifierRoles),
  requirePermission('onboarding', 'approve'),
  [
    param('documentId').isInt({ min: 1 }),
    body('decision').isIn(['VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED']),
    body('versionId').optional({ nullable: true }).isInt({ min: 1 })
  ],
  validate,
  reviewDocument
);

// The employee removes their own submitted document before it is reviewed.
router.post(
  '/documents/:documentId/withdraw',
  [param('documentId').isInt({ min: 1 })],
  validate,
  withdrawDocument
);

router.get(
  '/documents/:documentId/history',
  [param('documentId').isInt({ min: 1 })],
  validate,
  getDocumentHistory
);

router.get(
  '/versions/:versionId/download',
  [param('versionId').isInt({ min: 1 })],
  validate,
  downloadDocument
);

router.post(
  '/checklist-items/:id/na',
  [param('id').isInt({ min: 1 })],
  validate,
  markNotApplicable
);

router.post(
  '/:caseId/invitation/resend',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'),
  [
    param('caseId').isInt({ min: 1 }),
    body('email').optional({ nullable: true }).isString().isLength({ max: 160 })
  ],
  validate,
  resendInvitation
);

router.post(
  '/:caseId/activate',
  allowRoles('SUPER_ADMIN', 'ADMIN', 'HR'),
  [param('caseId').isInt({ min: 1 })],
  validate,
  activateEmployee
);

router.get(
  '/activation/:employeeId',
  allowRoles(...reviewerRoles),
  [param('employeeId').isInt({ min: 1 })],
  validate,
  getActivationStatus
);

export default router;
