// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../shared/result";

/**
 * Responsibility:
 * Đọc và xác thực `DATABASE_URL` từ biến môi trường — theo nguyên tắc
 * fail-fast: phát hiện cấu hình thiếu ngay khi khởi động, không chờ tới
 * khi một câu query thực sự chạy mới báo lỗi mơ hồ.
 *
 * Input: `NodeJS.ProcessEnv` (mặc định `process.env`; nhận tham số để
 * test được mà không cần sửa biến môi trường thật của tiến trình test).
 *
 * Output: `Result<DatabaseConfig>`.
 *
 * Failure conditions:
 * - `DATABASE_URL` không tồn tại (`undefined`).
 * - `DATABASE_URL` rỗng sau khi `trim()`.
 *
 * Does NOT:
 * - kết nối database — đó là việc của `database/postgres-client.ts`.
 * - là một config framework tổng quát. Chỉ đọc đúng MỘT biến môi
 *   trường mà task này cần; không suy đoán thêm các biến khác (pool
 *   size, timeout, ...) chưa có yêu cầu cụ thể.
 * - in giá trị `DATABASE_URL` (có thể chứa mật khẩu) ra thông điệp lỗi
 *   — thông điệp chỉ nói "thiếu/rỗng", không bao giờ lặp lại nội dung
 *   biến môi trường.
 *
 * Why this module is separate:
 * Tách "đọc và xác thực cấu hình" khỏi "dùng cấu hình đó để mở kết nối"
 * — cho phép test logic đọc cấu hình độc lập, không cần một database
 * thật hay một Postgres.js client thật.
 */
export interface DatabaseConfig {
  connectionString: string;
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): Result<DatabaseConfig> {
  const raw = env.DATABASE_URL;
  if (raw === undefined) {
    return fail("DATABASE_CONFIG_MISSING", "Biến môi trường DATABASE_URL chưa được đặt.");
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return fail("DATABASE_CONFIG_MISSING", "Biến môi trường DATABASE_URL rỗng.");
  }

  return ok({ connectionString: trimmed });
}
