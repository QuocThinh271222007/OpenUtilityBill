// SPDX-License-Identifier: MIT

import { defineConfig } from "vite";

/**
 * Responsibility:
 * Cấu hình Vite dev server để proxy các request /api sang backend
 * Express khi chạy `npm run dev`.
 *
 * Does NOT:
 * - cấu hình build production khác biệt với mặc định của Vite (chưa
 *   cần thiết ở bước foundation)
 *
 * Reason:
 * Nhờ proxy này, code frontend chỉ cần gọi fetch("/api/v1/...") mà
 * không bị lỗi CORS trong môi trường dev, và không cần hardcode
 * "http://localhost:3000" trong source.
 */
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
