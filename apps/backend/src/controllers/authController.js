import { login } from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const loginController = asyncHandler(async (req, res) => {
  const result = await login(req.body.loginId, req.body.password);
  res.json({ success: true, data: result });
});

export const meController = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});