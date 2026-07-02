import { b24 } from "../Auth/bitrix24AuthUtil.js";

const client = b24.instance;

/**
 * Fetch all CRM products.
 * Uses callList.make to auto-paginate crm.product.list.
 */
export const getAllProducts = async () => {
  try {
    const filter = { ">ID": 0 };

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

    return products;
  } catch (error) {
    console.error("Bitrix24 getAllProducts error:", error);
    throw error;
  }
};
