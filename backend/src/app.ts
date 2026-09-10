// SPDX-License-Identifier: MIT

import express, { Express } from "express";

/**
 * Responsibility:
 * Cấu hình Express application: middleware dùng chung, versioned API
 * prefix (/api/v1). Module routes sẽ được mount tại đây khi được thêm
 * (vd. health.routes.ts).
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

export default app;
