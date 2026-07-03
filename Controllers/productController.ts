import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

/**
 * Fetch all CRM products.
 * Uses callList.make to auto-paginate crm.product.list.
 */
export const getAllProducts = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const filter = {"!PROPERTY_99": [null, 159, 157, 163] };
    const products = await client.actions.v2.callList.make({
      method: "crm.product.list",
      params: {
        filter,
        select: ["*"],
        // NOTE: `order` is not supported by callList.make — it's stripped
        // from the params type. Sorting isn't guaranteed for full-list pulls.
      },
      idKey: "ID",
      requestId: "get-all-products",
    });

    const filteredProducts = (products.getData() || []).filter(
      (p: any) =>
        p.PROPERTY_99 !== null &&
        p.PROPERTY_99 !== undefined &&
        p.PROPERTY_99 !== "",
    );

    return res.status(200).json({
      success: true,
      data: filteredProducts,
    });
  } catch (error) {
    logger.error("Bitrix24 getAllProducts error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: message,
    });
  }
};
