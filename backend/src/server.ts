// SPDX-License-Identifier: MIT

import app from "./app";

/**
 * Responsibility:
 * Entry point của tiến trình backend: đọc cấu hình cổng từ biến môi
 * trường và bắt đầu lắng nghe HTTP request.
 *
 * Does NOT:
 * - cấu hình Express middleware/route (việc đó thuộc về app.ts)
 *
 * Reason:
 * server.ts là ranh giới network của ứng dụng; tách khỏi app.ts để
 * app.ts giữ được tính "pure" (không phụ thuộc việc có mở cổng thật
 * hay không) và dễ test hơn.
 */
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`OpenUtilityBill backend listening on port ${PORT}`);
});
