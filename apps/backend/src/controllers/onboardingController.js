import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getOnboardingStatus,
  registerCompany,
  validateActivationCode
} from '../services/onboardingService.js';

export const onboardingStatusController = asyncHandler(
  async (req, res) => {
    const data = await getOnboardingStatus(
      req.query.companyCode || req.query.code
    );
    res.json({ success: true, data });
  }
);

export const validateActivationController = asyncHandler(
  async (req, res) => {
    const data = await validateActivationCode(
      req.body.activationCode || req.body.code
    );
    res.json({ success: true, data });
  }
);

export const registerCompanyController = asyncHandler(
  async (req, res) => {
    const data = await registerCompany(req.body);
    res.status(201).json({
      success: true,
      message:
        'Company registered successfully. You can now sign in with your company code.',
      data
    });
  }
);
