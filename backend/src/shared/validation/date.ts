// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Kiểm tra một `Date` (đã parse) có phải ngày đầu tiên của tháng hay
 * không — DÙNG CHUNG bởi mọi Service nhận `billingPeriod` làm đầu vào
 * (invoice, meter-reading), như một lớp kiểm tra PHÒNG THỦ thứ hai độc
 * lập với việc parse ở tầng HTTP (`shared/http/date-wire-format.ts`
 * `parseFirstOfMonthWireFormat`) — Service không giả định Controller đã
 * validate đúng, để Service vẫn an toàn nếu được gọi từ nơi khác ngoài
 * HTTP trong tương lai.
 *
 * Why `getUTCDate()`, not `getDate()`:
 * `getDate()` dùng múi giờ LOCAL của máy chủ, có thể trả sai ngày tuỳ
 * cấu hình hệ thống — xem docs/DATABASE_ACCESS.md mục "DATE boundary".
 */
export function isFirstDayOfMonthUtc(date: Date): boolean {
  return !Number.isNaN(date.getTime()) && date.getUTCDate() === 1;
}
