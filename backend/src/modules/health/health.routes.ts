// SPDX-License-Identifier: MIT

import { Router } from "express";
import { getHealth } from "./health.controller";

/**
 * Responsibility:
 * Khai báo route HTTP cho module health và gắn Controller tương ứng.
 *
 * Does NOT:
 * - xử lý logic của request (đó là việc của Controller)
 *
 * Reason:
 * Route được tách khỏi app.ts để mỗi module tự quản lý route của
 * chính nó; app.ts chỉ cần mount router này theo prefix /api/v1.
 */
const healthRoutes = Router();

healthRoutes.get("/health", getHealth);

export default healthRoutes;
