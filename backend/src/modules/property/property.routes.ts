// SPDX-License-Identifier: MIT

import { Router } from "express";
import { createCreatePropertyController, createListPropertiesController, createUpdatePropertyController } from "./property.controller";
import { getPropertyManagementService } from "../../composition/property.composition";

/**
 * Trách nhiệm:
 * Khai báo route HTTP cho module property (`GET`/`POST /properties`,
 * `PATCH /properties/:propertyId`, mounted dưới `/api/v1` bởi `app.ts`).
 *
 * Important invariant — truyền HÀM factory, KHÔNG gọi nó ở đây: cùng lý
 * do với `invoice.routes.ts` — `getPropertyManagementService` được
 * truyền NGUYÊN VẸN cho Controller factory, Controller tự quyết định
 * khi nào gọi nó (chỉ sau khi validate request xong).
 */
const propertyRoutes = Router();

propertyRoutes.get("/properties", createListPropertiesController(getPropertyManagementService));
propertyRoutes.post("/properties", createCreatePropertyController(getPropertyManagementService));
propertyRoutes.patch("/properties/:propertyId", createUpdatePropertyController(getPropertyManagementService));

export default propertyRoutes;
