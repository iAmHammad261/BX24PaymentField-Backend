import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";


export const updateDeal = async (req: Request, res: Response) => {
    const client = b24.instance;
    try {
        const {dealId, fieldId, fieldValue} = req.body;

        logger.debug(`updateDeal called with dealId: ${dealId}, fieldId: ${fieldId}, fieldValue: ${fieldValue}`);

        if(!dealId || !fieldId || !fieldValue) {
            logger.error("Invalid request parameters");
            return res.status(400).json({ error: "Request parameters are missing" });
        }

        const updateResponse = await client.actions.v2.call.make({
          method: "crm.deal.update",
            params: {
                id: dealId,
                fields: {
                    [fieldId]: fieldValue
                }
            }
        })

        if(!updateResponse.isSuccess){
            logger.error("Failed to update deal", { response: updateResponse });
            return res.status(500).json({ error: "Failed to update deal", details: updateResponse.getErrorMessages() });
        }

        return res.status(200).json({ message: "Deal updated successfully" });

    }
    catch (error) {
        logger.error("Bitrix24 updateDeal error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }

}