// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../result";

/**
 * Trách nhiệm:
 * Parse/format ngày dạng "YYYY-MM-DD" ở ranh giới HTTP — dùng CHUNG bởi
 * mọi module có field ngày dạng này (invoice `billingPeriod`,
 * meter-reading `billingPeriod`, tariff `effectiveFrom`/`effectiveTo`).
 * Tách khỏi `backend/src/modules/invoice/invoice.http.ts` để không viết
 * lại cùng một thuật toán kiểm tra "ngày lịch có thật" (round-trip qua
 * `Date.UTC`) ở nhiều nơi.
 *
 * Two entry points, vì KHÔNG PHẢI mọi field ngày dùng cùng một ràng
 * buộc "phải là ngày đầu tháng":
 * - `parseDateWireFormat`: bất kỳ ngày lịch hợp lệ nào — dùng cho tariff
 *   `effectiveFrom`/`effectiveTo` (ví dụ seed thật của kỳ thi dùng
 *   "2025-05-10", KHÔNG phải ngày đầu tháng).
 * - `parseFirstOfMonthWireFormat`: PHẢI là ngày đầu tháng — dùng cho
 *   `billingPeriod` (invoice, meter-reading), khớp CHECK
 *   `EXTRACT(DAY FROM billing_period) = 1` ở migration 001.
 *
 * Không chịu trách nhiệm:
 * - chấp nhận timestamp JS tuỳ ý (`Date.parse` nói chung) — CHỈ đúng
 *   hình dạng "YYYY-MM-DD", không giờ/múi giờ, để loại bỏ mơ hồ múi giờ
 *   ở ranh giới HTTP (xem docs/DATABASE_ACCESS.md mục "DATE boundary").
 * - dùng thư viện ngày tháng nào — chỉ `Date.UTC` có sẵn.
 */
const WIRE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateWireFormat(value: unknown): Result<Date> {
  if (typeof value !== "string") {
    return fail("VALIDATION_ERROR", "Giá trị ngày là bắt buộc và phải là chuỗi dạng YYYY-MM-DD.");
  }

  const match = WIRE_DATE_PATTERN.exec(value);
  if (!match) {
    return fail("VALIDATION_ERROR", `Giá trị ngày không đúng định dạng YYYY-MM-DD: "${value}".`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // JS Date tự "tràn" ngày không tồn tại (ví dụ 2026-02-30 -> 2026-03-02)
  // thay vì báo lỗi — so khớp lại year/month/day sau khi dựng Date để
  // bắt trường hợp này.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail("VALIDATION_ERROR", `Giá trị ngày không phải một ngày lịch hợp lệ: "${value}".`);
  }

  return ok(date);
}

export function parseFirstOfMonthWireFormat(value: unknown): Result<Date> {
  const parsed = parseDateWireFormat(value);
  if (!parsed.success) {
    return parsed;
  }
  if (parsed.data.getUTCDate() !== 1) {
    return fail("VALIDATION_ERROR", `Giá trị ngày phải là ngày đầu tiên của tháng (day = 01): "${String(value)}".`);
  }
  return parsed;
}

/** `Date` (giả định UTC-midnight) -> "YYYY-MM-DD". An toàn cho cả Date tự dựng LẪN Date Postgres.js trả về khi đọc cột DATE (xem invoice.http.ts cho giải thích đầy đủ). */
export function formatDateAsWireDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
