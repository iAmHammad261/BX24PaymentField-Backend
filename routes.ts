import { getAllProducts } from "./Controllers/productController.js";
import { updateProduct } from "./Controllers/updateProductController.js";
import { updateDeal } from "./Controllers/updateDealController.js";

export const setupRoutes = (app: any) => {
  app.get("/getAllProducts", getAllProducts);
  app.patch("/updateProduct", updateProduct);
  app.post("/updateDeal", updateDeal);
};
