import { b24 } from "../Auth/bitrix24AuthUtil.js";
import type { Request, Response } from "express";
import { logger } from "../Utils/logger.js";

interface FileContent {
  fileName: string;
  fileContent: string; // base64-encoded
}

const isFileContent = (value: unknown): value is FileContent =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as any).fileName === "string" &&
  typeof (value as any).fileContent === "string";

/**
 * Generic write to any deal custom field (payment field), regardless of the
 * field's underlying type. Bitrix keys fields by field code (e.g.
 * UF_CRM_xxxx), so text/number values pass straight through, while file
 * fields need the [fileName, base64Content] tuple Bitrix expects.
 * Expects { dealId, fieldId, content } in the request body.
 */
export const setPaymentField = async (req: Request, res: Response) => {
  const client = b24.instance;
  try {
    const { dealId, fieldId, content } = req.body;

    logger.debug(
      `setPaymentField called with dealId: ${dealId}, fieldId: ${fieldId}, content: ${
        isFileContent(content) ? `[file: ${content.fileName}]` : JSON.stringify(content)
      }`,
    );

    if (!dealId || !fieldId || content === undefined || content === null || content === "") {
      return res.status(400).json({
        success: false,
        message: "dealId, fieldId and content are required",
      });
    }

    const fieldValue = isFileContent(content) ? [content.fileName, content.fileContent] : content;

    const result = await client.actions.v2.call.make({
      method: "crm.deal.update",
      params: {
        id: dealId,
        fields: {
          [fieldId]: fieldValue,
        },
      },
      requestId: "set-payment-field",
    });

    if (!result.isSuccess) {
      logger.error(`crm.deal.update (payment field) failed: ${result.getErrorMessages().join("; ")}`);
      return res.status(500).json({
        success: false,
        message: "Failed to update payment field",
        error: result.getErrorMessages(),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment field updated",
    });
  } catch (error) {
    logger.error("Bitrix24 setPaymentField error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment field",
      error: message,
    });
  }
};
