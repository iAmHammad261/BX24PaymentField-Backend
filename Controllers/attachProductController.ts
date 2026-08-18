import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

// catalog.product.get exposes the PROPERTY_99 status field as
// property99: { value, valueEnum, valueId } — `value` is the enum option id
// ("155" = Available), `valueId` is just this binding row's own id.
const AVAILABLE_PROPERTY_VALUE_ID = "155";
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
      method: "catalog.product.get",
      params: { id: productId },
      requestId: "attach-product-get",
    });

    if (!productResult.isSuccess) {
      logger.error(`catalog.product.get failed: ${productResult.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to load unit",
        error: productResult.getErrorMessages(),
      });
    }

    const product: any = (productResult.getData()?.result as any)?.product;

    logger.info(`attachProduct: catalog.product.get raw result: ${JSON.stringify(productResult.getData()?.result)}`);

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

    if (!rowsResult.isSuccess) {
      logger.error(`crm.deal.productrows.get failed: ${rowsResult.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to load deal's product rows",
        error: rowsResult.getErrorMessages(),
      });
    }

    const currentRows = extractList(rowsResult.getData()?.result);
    const alreadyAttachedToThisDeal = currentRows.some(
      (row: any) => String(row.PRODUCT_ID) === String(productId),
    );

    logger.info(`attachProduct: currentRows: ${JSON.stringify(currentRows)}, alreadyAttachedToThisDeal: ${alreadyAttachedToThisDeal}`);

    // 2) Re-check availability, unless the unit is already on this deal
    // (idempotent re-attach shouldn't fail just because a prior attach
    // already moved its status off "Available").
    if (!alreadyAttachedToThisDeal) {
      const statusValueId = product.property99?.value;

      logger.info(`attachProduct: product.property99: ${JSON.stringify(product.property99)}, statusValueId: ${statusValueId}, expected: ${AVAILABLE_PROPERTY_VALUE_ID}`);

      if (String(statusValueId) !== AVAILABLE_PROPERTY_VALUE_ID) {
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

    if (!dealResult.isSuccess) {
      logger.error(`crm.deal.get failed: ${dealResult.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to load deal",
        error: dealResult.getErrorMessages(),
      });
    }

    const deal: any = dealResult.getData()?.result;

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

    if (!stageListResult.isSuccess) {
      logger.error(`crm.status.list failed: ${stageListResult.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to resolve deal stage",
        error: stageListResult.getErrorMessages(),
      });
    }

    const stages = extractList(stageListResult.getData()?.result);
    const currentStage = stages.find((s: any) => s.STATUS_ID === deal.STAGE_ID);
    const currentStageName = currentStage?.NAME;

    logger.info(`attachProduct: deal.STAGE_ID: ${deal.STAGE_ID}, categoryId: ${categoryId}, stages: ${JSON.stringify(stages)}, currentStageName: ${currentStageName}`);

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

    if (!setResult.isSuccess) {
      logger.error(`crm.deal.productrows.set failed: ${setResult.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to attach unit to deal",
        error: setResult.getErrorMessages(),
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
