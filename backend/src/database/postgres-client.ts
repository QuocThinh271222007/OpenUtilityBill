// SPDX-License-Identifier: MIT

import postgres from "postgres";
import type { Sql } from "postgres";
import { loadDatabaseConfig } from "../config/database.config";

/**
 * Trách nhiệm:
 * Tạo và giữ MỘT client Postgres.js cấp ứng dụng (singleton cấp
 * module), dùng lại cho mọi Repository — KHÔNG tạo kết nối mới cho
 * từng lời gọi Repository.
 *
 * Không chịu trách nhiệm:
 * - chứa business logic, câu SQL domain cụ thể (`SELECT ... FROM
 *   rooms ...`), hay bất kỳ hằng số biểu giá nào của kỳ thi — đây CHỈ
 *   là adapter kết nối, không phải nơi đặt query.
 * - tự triển khai connection pool. Postgres.js TỰ quản lý pool/kết nối
 *   bên trong một instance `Sql` — gọi `postgres(...)` ĐÚNG MỘT LẦN rồi
 *   dùng lại instance đó cho mọi query, không tự viết logic pool riêng
 *   (xem docs/DATABASE_ACCESS.md mục "Connection lifecycle").
 * - biết gì về HTTP/Express.
 * - override parser cho NUMERIC/BIGINT. Hành vi MẶC ĐỊNH của Postgres.js
 *   (trả cả hai dưới dạng `string`, không có parser đăng ký sẵn cho OID
 *   1700/20) đã đúng với hợp đồng chính xác tuyệt đối của dự án — xem
 *   docs/DATABASE_ACCESS.md mục "NUMERIC/BIGINT precision boundary" và
 *   `__tests__/postgres-client.numeric.integration.test.ts`. KHÔNG thêm
 *   custom type parser ở đây trừ khi có bằng chứng hành vi mặc định
 *   thay đổi.
 *
 * Lý do tồn tại:
 * Tách "cách kết nối database" khỏi "câu SQL cụ thể nào được chạy" —
 * Repository implementation import client TỪ ĐÂY, không tự gọi
 * `postgres(...)` riêng lẻ ở nơi khác.
 */
let cachedClient: Sql | null = null;

export function getDatabaseClient(): Sql {
  if (cachedClient) {
    return cachedClient;
  }

  const configResult = loadDatabaseConfig();
  if (!configResult.success) {
    // Lỗi cấu hình khi khởi động là lỗi FATAL, không phải một business
    // Result mong đợi trong luồng bình thường — throw thẳng ở đây đúng
    // với nguyên tắc fail-fast khi khởi động (xem
    // docs/DATABASE_ACCESS.md).
    throw new Error(`Không thể khởi tạo Postgres.js client: ${configResult.error.message}`);
  }

  cachedClient = postgres(configResult.data.connectionString);

  return cachedClient;
}

/**
 * Đóng client hiện tại (nếu có) — dùng khi server tắt, hoặc khi test
 * cần dọn dẹp kết nối để không để lại "hanging connection" làm treo
 * tiến trình test. KHÔNG gọi hàm này sau mỗi câu query đơn lẻ —
 * Postgres.js được thiết kế để giữ kết nối mở và tái sử dụng xuyên suốt
 * vòng đời ứng dụng.
 */
export async function closeDatabaseClient(): Promise<void> {
  if (!cachedClient) {
    return;
  }
  const clientToClose = cachedClient;
  cachedClient = null;
  await clientToClose.end({ timeout: 5 });
}

/**
 * Ghi log một lỗi database CHỈ để chẩn đoán nội bộ (console, phía
 * server) — KHÔNG BAO GIỜ đưa message này vào một Result trả ra ngoài.
 * Giữ nguyên đối tượng lỗi gốc cho ngữ cảnh debug, nhưng Repository gọi
 * hàm này PHẢI tự dịch sang một mã lỗi Result chung chung (ví dụ
 * DATABASE_READ_FAILED) trước khi trả về caller — xem
 * docs/DATABASE_ACCESS.md mục "Error translation".
 */
export function logDatabaseError(context: string, error: unknown): void {
  console.error(`[database] ${context} thất bại:`, error);
}
