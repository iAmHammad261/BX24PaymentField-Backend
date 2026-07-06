import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

export const updateDeal = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const { dealId, fields } = req.body;

    logger.debug(`updateDeal called with dealId: ${dealId}, fields: ${JSON.stringify(fields)}`);

    if (
      !dealId ||
      !fields ||
      typeof fields !== "object" ||
      Array.isArray(fields) ||
      Object.keys(fields).length === 0
    ) {
      logger.error("Invalid request parameters");
      return res.status(400).json({ error: "dealId and a non-empty fields object are required" });
    }

    const updateResponse = await client.actions.v2.call.make({
      method: "crm.deal.update",
      params: { id: dealId, fields },
    });

    if (!updateResponse.isSuccess) {
      logger.error("Failed to update deal", { response: updateResponse });
      return res.status(500).json({ error: "Failed to update deal", details: updateResponse.getErrorMessages() });
    }

    return res.status(200).json({ success: true, message: "Deal updated successfully" });
  } catch (error) {
    logger.error("Bitrix24 updateDeal error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};