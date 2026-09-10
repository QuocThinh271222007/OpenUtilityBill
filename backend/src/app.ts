// SPDX-License-Identifier: MIT

import express, { Express } from "express";
import healthRoutes from "./modules/health/health.routes";

/**
 * Responsibility:
 * Cấu hình Express application: middleware dùng chung, versioned API
 * prefix (/api/v1), và mount route của từng module.
 *
 * Does NOT:
 * - gọi app.listen() (việc đó thuộc về server.ts)
 *
 * Reason:
 * Tách app.ts khỏi server.ts giúp Express app có thể được import và
 * kiểm thử (vd. với supertest) mà không cần mở cổng mạng thật. Đây là
 * ranh giới bắt buộc theo docs/ARCHITECTURE.md.
 */
const app: Express = express();

app.use(express.json());

const API_V1_PREFIX = "/api/v1";
app.use(API_V1_PREFIX, healthRoutes);

export default app;
