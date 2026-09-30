import { asyncHandler } from '../utils/asyncHandler.js';
import { withTenantByCompanyCode } from '../services/authService.js';
import {
  acceptInvitation,
  verifyInvitationToken
} from '../services/invitationService.js';

// Activation links are opened before sign-in, so the company code in the
// link selects which company database holds the invitation.
export const verifyInvitation = asyncHandler(async (req, res) => {
  const data = await withTenantByCompanyCode(req.body.companyCode, () =>
    verifyInvitationToken(req.body.token)
  );
  res.json({ success: true, data });
});

export const completeInvitation = asyncHandler(async (req, res) => {
  const result = await withTenantByCompanyCode(req.body.companyCode, () =>
    acceptInvitation({
      token: req.body.token,
      password: req.body.password,
      ipAddress: req.ip
    })
  );

  res.json({
    success: true,
    message: `Your account is active. Sign in with Employee ID ${result.employeeCode} and your new password.`,
    data: result
  });
});
