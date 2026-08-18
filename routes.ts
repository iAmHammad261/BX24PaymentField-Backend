import { getAllProducts } from "./Controllers/productController.js";
import { updateProduct } from "./Controllers/updateProductController.js";
import { updateDeal } from "./Controllers/updateDealController.js";
import { attachProduct } from "./Controllers/attachProductController.js";
import { setDealAmount } from "./Controllers/setDealAmountController.js";
import { setPaymentField } from "./Controllers/setPaymentFieldController.js";

export const setupRoutes = (app: any) => {
  app.get("/getAllProducts", getAllProducts);
  app.patch("/updateProduct", updateProduct);
  app.post("/updateDeal", updateDeal);
  app.post("/attachProduct", attachProduct);
  app.post("/setDealAmount", setDealAmount);
  app.post("/setPaymentField", setPaymentField);
};
