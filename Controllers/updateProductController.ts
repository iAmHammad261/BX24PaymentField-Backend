import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

/**
 * Set a product's PROPERTY_99 (status field) to 159 via crm.product.update.
 * Expects the product id in the request body: { productId: number }
 */
export const updateProduct = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    const result = await client.actions.v2.call.make({
      method: "crm.product.update",
      params: {
        id: productId,
        fields: {
          PROPERTY_99: 159,
        },
      },
      requestId: "update-product-status",
    });

    // if () {
    //   logger.error("Bitrix24 crm.product.update failed:", result.getErrors());
    //   return res.status(500).json({
    //     success: false,
    //     message: "Failed to update product status",
    //     error: result.getErrors(),
    //   });
    // }

    logger.info("crm.product.update raw result:", JSON.stringify(result));

    return res.status(200).json({
      success: true,
      data: result.getData(),
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
