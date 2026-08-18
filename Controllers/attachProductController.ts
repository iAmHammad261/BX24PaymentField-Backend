import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

const AVAILABLE_STATUS_LABEL = "Available";
const REQUIRED_STAGE_NAME = "Sales Booking";

/**
 * Bitrix wraps list results under varying keys depending on the API
 * namespace (legacy crm.* returns a flat array, catalog.* nests it under
 * an entity-named key) — pull out whichever array is actually present.
 */
const extractList = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const arr = Object.values(data).find((v) => Array.isArray(v));
    if (arr) return arr as any[];
  }
  return [];
};

const getCallErrors = (result: any) => result?.errors ?? result?.["_errors"] ?? {};

/**
 * Attach a unit (catalog product) to a deal's product rows, server-side,
 * so the availability/stage checks and the write happen in one place
 * instead of racing against other users' browsers.
 *
 * Expects { dealId, productId } in the request body.
 */
export const attachProduct = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const { dealId, productId } = req.body;

    logger.debug(`attachProduct called with dealId: ${dealId}, productId: ${productId}`);

    if (!dealId || !productId) {
      return res.status(400).json({
        success: false,
        message: "dealId and productId are required",
      });
    }

    // 1) Load the unit and the deal's current product rows.
    const productResult = await client.actions.v2.call.make({
      method: "crm.product.get",
      params: { id: productId },
      requestId: "attach-product-get",
    });

    if (Object.keys(getCallErrors(productResult)).length > 0) {
      logger.error(`crm.product.get failed: ${JSON.stringify(getCallErrors(productResult))}`);
      return res.status(500).json({
        success: false,
        message: "Failed to load unit",
        error: getCallErrors(productResult),
      });
    }

    const product: any = productResult.getData();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }

    const rowsResult = await client.actions.v2.call.make({
      method: "crm.deal.productrows.get",
      params: { id: dealId },
      requestId: "attach-product-rows-get",
    });

    if (Object.keys(getCallErrors(rowsResult)).length > 0) {
      logger.error(`crm.deal.productrows.get failed: ${JSON.stringify(getCallErrors(rowsResult))}`);
      return res.status(500).json({
        success: false,
        message: "Failed to load deal's product rows",
        error: getCallErrors(rowsResult),
      });
    }

    const currentRows = extractList(rowsResult.getData());
    const alreadyAttachedToThisDeal = currentRows.some(
      (row: any) => String(row.PRODUCT_ID) === String(productId),
    );

    // 2) Re-check availability, unless the unit is already on this deal
    // (idempotent re-attach shouldn't fail just because a prior attach
    // already moved its status off "Available").
    if (!alreadyAttachedToThisDeal) {
      const enumResult = await client.actions.v2.call.make({
        method: "catalog.productPropertyEnum.list",
        params: { filter: { propertyId: 99 } },
        requestId: "attach-product-enum-list",
      });

      if (Object.keys(getCallErrors(enumResult)).length > 0) {
        logger.error(`catalog.productPropertyEnum.list failed: ${JSON.stringify(getCallErrors(enumResult))}`);
        return res.status(500).json({
          success: false,
          message: "Failed to resolve unit status",
          error: getCallErrors(enumResult),
        });
      }

      const statusEnums = extractList(enumResult.getData());
      const currentStatusEnum = statusEnums.find(
        (e: any) => String(e.id) === String(product.PROPERTY_99),
      );
      const currentStatusLabel = currentStatusEnum?.value;

      if (currentStatusLabel !== AVAILABLE_STATUS_LABEL) {
        return res.status(409).json({
          success: false,
          message: "Unit is no longer available",
        });
      }
    }

    // 3) Confirm the deal is at the "Sales Booking" stage.
    const dealResult = await client.actions.v2.call.make({
      method: "crm.deal.get",
      params: { id: dealId },
      requestId: "attach-product-deal-get",
    });

    if (Object.keys(getCallErrors(dealResult)).length > 0) {
      logger.error(`crm.deal.get failed: ${JSON.stringify(getCallErrors(dealResult))}`);
      return res.status(500).json({
        success: false,
        message: "Failed to load deal",
        error: getCallErrors(dealResult),
      });
    }

    const deal: any = dealResult.getData();

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Deal not found",
      });
    }

    const categoryId = deal.CATEGORY_ID ?? 0;

    const stageListResult = await client.actions.v2.call.make({
      method: "crm.status.list",
      params: { filter: { ENTITY_ID: `DEAL_STAGE_${categoryId}` } },
      requestId: "attach-product-stage-list",
    });

    if (Object.keys(getCallErrors(stageListResult)).length > 0) {
      logger.error(`crm.status.list failed: ${JSON.stringify(getCallErrors(stageListResult))}`);
      return res.status(500).json({
        success: false,
        message: "Failed to resolve deal stage",
        error: getCallErrors(stageListResult),
      });
    }

    const stages = extractList(stageListResult.getData());
    const currentStage = stages.find((s: any) => s.STATUS_ID === deal.STAGE_ID);
    const currentStageName = currentStage?.NAME;

    if (currentStageName !== REQUIRED_STAGE_NAME) {
      return res.status(409).json({
        success: false,
        message: "Deal is not at Sales Booking stage",
      });
    }

    // 4) All checks passed — attach the unit, replacing any existing rows.
    const setResult = await client.actions.v2.call.make({
      method: "crm.deal.productrows.set",
      params: {
        id: dealId,
        rows: [{ PRODUCT_ID: productId, QUANTITY: 1 }],
      },
      requestId: "attach-product-rows-set",
    });

    if (Object.keys(getCallErrors(setResult)).length > 0) {
      logger.error(`crm.deal.productrows.set failed: ${JSON.stringify(getCallErrors(setResult))}`);
      return res.status(500).json({
        success: false,
        message: "Failed to attach unit to deal",
        error: getCallErrors(setResult),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Unit attached to deal",
    });
  } catch (error) {
    logger.error("Bitrix24 attachProduct error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      message: "Failed to attach unit to deal",
      error: message,
    });
  }
};
