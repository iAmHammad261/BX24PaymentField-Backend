import { getAllProducts } from "./Controllers/productController.js";
import { updateProduct } from "./Controllers/updateProductController.js";

export const setupRoutes = (app: any) => {
  app.get("/getAllProducts", getAllProducts);
  app.patch("/updateProduct", updateProduct);
};
