import { login } from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const loginController = asyncHandler(async (req, res) => {
  const result = await login(
    req.body.loginId,
    req.body.password,
    req.body.companyCode || req.body.company_code
  );
  res.json({ success: true, data: result });
});

export const meController = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      employeeId: req.user.employeeId,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      accountType: req.user.accountType,
      fullName: req.user.fullName,
      companyId: req.user.companyId,
      companyCode: req.user.companyCode,
      dbName: req.user.dbName
    }
  });
});
