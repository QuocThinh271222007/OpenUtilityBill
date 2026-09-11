// SPDX-License-Identifier: MIT

import express, { Express } from "express";
import healthRoutes from "./modules/health/health.routes";
import invoiceRoutes from "./modules/invoice/invoice.routes";
import propertyRoutes from "./modules/property/property.routes";
import roomRoutes from "./modules/room/room.routes";
import meterReadingRoutes from "./modules/meter-reading/meter-reading.routes";
import tariffRoutes from "./modules/tariff/tariff.routes";

/**
 * Trách nhiệm:
 * Cấu hình Express application: middleware dùng chung, versioned API
 * prefix (/api/v1), và mount route của từng module.
 *
 * Không chịu trách nhiệm:
 * - gọi app.listen() (việc đó thuộc về server.ts)
 *
 * Lý do:
 * Tách app.ts khỏi server.ts giúp Express app có thể được import và
 * kiểm thử (vd. với supertest) mà không cần mở cổng mạng thật. Đây là
 * ranh giới bắt buộc theo docs/ARCHITECTURE.md.
 */
const app: Express = express();

app.use(express.json());

const API_V1_PREFIX = "/api/v1";
app.use(API_V1_PREFIX, healthRoutes);
app.use(API_V1_PREFIX, invoiceRoutes);
app.use(API_V1_PREFIX, propertyRoutes);
app.use(API_V1_PREFIX, roomRoutes);
app.use(API_V1_PREFIX, meterReadingRoutes);
app.use(API_V1_PREFIX, tariffRoutes);

export default app;
