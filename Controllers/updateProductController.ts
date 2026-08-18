import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

const BOOKING_CONFIRMED_FIELD = "UF_CRM_1783017390988";

/**
 * Set a product's PROPERTY_99 (status field) to 159 (Booked) via
 * crm.product.update, then mark the deal itself as booking-confirmed via
 * crm.deal.update — both writes happen in this one request instead of two
 * independent client-side calls that could leave the unit Booked with the
 * deal not reflecting it.
 * Expects { productId, dealId } in the request body.
 */
export const updateProduct = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const { productId, dealId } = req.body;

    logger.debug(`updateProduct called with productId: ${productId}, dealId: ${dealId}`);

    if (!productId || !dealId) {
      return res.status(400).json({
        success: false,
        message: "productId and dealId are required",
      });
    }

    const productUpdateResult = await client.actions.v2.call.make({
      method: "crm.product.update",
      params: {
        id: productId,
        fields: {
          PROPERTY_99: 159,
        },
      },
      requestId: "update-product-status",
    });

    if (!productUpdateResult.isSuccess) {
      logger.error(`crm.product.update failed: ${productUpdateResult.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to update product status",
        error: productUpdateResult.getErrorMessages(),
      });
    }

    const dealUpdateResult = await client.actions.v2.call.make({
      method: "crm.deal.update",
      params: {
        id: dealId,
        fields: {
          [BOOKING_CONFIRMED_FIELD]: "Y",
        },
      },
      requestId: "update-product-deal-flag",
    });

    if (!dealUpdateResult.isSuccess) {
      logger.error(`crm.deal.update (booking flag) failed: ${dealUpdateResult.getErrorMessages().join("; ")}`);
      return res.status(200).json({
        success: true,
        dealFlagUpdated: false,
        message: "Product status updated, but failed to set the deal's booking-confirmed flag",
        error: dealUpdateResult.getErrorMessages(),
      });
    }

    return res.status(200).json({
      success: true,
      dealFlagUpdated: true,
      message: "Product status and deal booking flag updated",
    });
  } catch (error) {
    logger.error("Bitrix24 updateProduct error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product status",
      error: message,
    });
  }
};
