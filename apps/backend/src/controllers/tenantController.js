import {
  getTenantBrandingByCode,
  getTenantBrandingById,
  updateTenantBranding
} from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const getPublicTenantBranding =
  asyncHandler(
    async (req, res) => {
      const branding =
        await getTenantBrandingByCode(
          req.params.tenantCode
        );

      if (!branding) {
        throw new AppError(
          'Company workspace was not found.',
          404
        );
      }

      res.json({
        success: true,
        data: branding
      });
    }
  );

export const getMyTenantSettings =
  asyncHandler(
    async (req, res) => {
      const branding =
        await getTenantBrandingById(
          req.user.tenantId
        );

      if (!branding) {
        throw new AppError(
          'Company workspace was not found.',
          404
        );
      }

      res.json({
        success: true,
        data: branding
      });
    }
  );

export const updateMyTenantSettings =
  asyncHandler(
    async (req, res) => {
      let branding;

      try {
        branding =
          await updateTenantBranding(
            req.user.tenantId,
            {
              companyName:
                req.body.companyName,
              legalName:
                req.body.legalName,
              invoiceEmail:
                req.body.invoiceEmail,
              logoDataUrl:
                req.body.logoDataUrl,
              primaryColor:
                req.body.primaryColor,
              secondaryColor:
                req.body.secondaryColor
            }
          );
      } catch (error) {
        throw new AppError(
          error.message,
          400
        );
      }

      res.json({
        success: true,
        message:
          'Company branding updated successfully.',
        data: branding
      });
    }
  );
