// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * "Đây có phải lỗi vi phạm UNIQUE constraint (SQLSTATE 23505) không?" —
 * kiểm tra CẤU TRÚC (structural), không import type `PostgresError` của
 * thư viện `postgres`. DÙNG CHUNG bởi mọi Repository cần dịch một vi
 * phạm UNIQUE cụ thể sang một domain error code (invoice, room,
 * meter-reading, tariff) — KHÔNG xây dựng một khung (framework) dịch
 * SQLSTATE tổng quát cho mọi constraint có thể có (xem
 * docs/DATABASE_ACCESS.md mục "Error translation").
 *
 * `code` ở đây LÀ SQLSTATE do PostgreSQL trả về, không phải một field do
 * Postgres.js tự đặt tên tuỳ ý — xem
 * `node_modules/postgres/src/connection.js` (bảng `errorFields`, ánh xạ
 * ký tự 'C' -> `code`) và `node_modules/postgres/types/index.d.ts`
 * (`PostgresError.code: string`).
 *
 * Does NOT:
 * - phân biệt VI PHẠM CONSTRAINT NÀO — mỗi Repository gọi hàm này biết
 *   rõ (từ ngữ cảnh gọi INSERT/UPDATE nào) đó là constraint nào, nên tự
 *   chọn domain error code phù hợp (ví dụ `INVOICE_ALREADY_EXISTS`,
 *   `ROOM_ALREADY_EXISTS`, `METER_READING_ALREADY_EXISTS`,
 *   `TARIFF_ALREADY_EXISTS`).
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}
