import { getAllProducts } from "./Controllers/productController.js";

export const setupRoutes = (app: any) => {
  app.get("/getAllProducts", getAllProducts);
};
