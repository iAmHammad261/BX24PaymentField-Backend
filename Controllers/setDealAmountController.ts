import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

/**
 * Write a pre-computed deal amount straight through to crm.deal.update.
 * No calculation happens here — the frontend sends the final amount.
 * Expects { dealId, amount } in the request body.
 */
export const setDealAmount = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const { dealId, amount } = req.body;

    logger.debug(`setDealAmount called with dealId: ${dealId}, amount: ${amount}`);

    if (!dealId || typeof amount !== "number" || !Number.isFinite(amount)) {
      return res.status(400).json({
        success: false,
        message: "dealId and a finite amount are required",
      });
    }

    const result = await client.actions.v2.call.make({
      method: "crm.deal.update",
      params: {
        id: dealId,
        fields: {
          OPPORTUNITY: amount,
          IS_MANUAL_OPPORTUNITY: "Y",
        },
      },
      requestId: "set-deal-amount",
    });

    if (!result.isSuccess) {
      logger.error(`crm.deal.update (amount) failed: ${result.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to update deal amount",
        error: result.getErrorMessages(),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Deal amount updated",
    });
  } catch (error) {
    logger.error("Bitrix24 setDealAmount error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      message: "Failed to update deal amount",
      error: message,
    });
  }
};
