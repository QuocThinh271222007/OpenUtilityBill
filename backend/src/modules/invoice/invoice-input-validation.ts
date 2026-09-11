// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Các hàm kiểm tra (predicate) dùng CHUNG giữa `CreateInvoiceService` và
 * `GetInvoiceService` — tách riêng để không định nghĩa lại cùng một quy
 * tắc ở hai nơi (roomId, billingPeriod đều được cả hai Service nhận làm
 * đầu vào).
 *
 * Does NOT:
 * - chứa logic đọc/ghi database hay Calculation Core — chỉ kiểm tra
 *   HÌNH DẠNG (shape) của giá trị đầu vào, thuần hàm (pure), không I/O.
 */

/**
 * roomId phải là chuỗi biểu diễn một BIGINT dương — KHÔNG BAO GIỜ
 * `Number(roomId)` (BIGINT có thể vượt quá `Number.MAX_SAFE_INTEGER`,
 * xem docs/DATABASE_ACCESS.md mục "BIGINT / ID boundary"). Kiểm tra
 * CHUỖI bằng regex thay vì parse ra số.
 */
export function isPositiveIntegerId(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

/**
 * `billingPeriod` phải là ngày đầu tiên của tháng (khớp CHECK
 * `EXTRACT(DAY FROM billing_period) = 1` ở migration 001). Dùng
 * `getUTCDate()`, KHÔNG dùng `getDate()` (local time) — tránh sai lệch
 * theo múi giờ máy chủ (xem docs/DATABASE_ACCESS.md mục "DATE boundary
 * — reviewed, not changed"; dự án chưa đổi toàn bộ ranh giới DATE, chỉ
 * tránh method local-time ở nơi có thể).
 */
export function isFirstDayOfMonthUtc(date: Date): boolean {
  return !Number.isNaN(date.getTime()) && date.getUTCDate() === 1;
}

/**
 * `actualChargedAmount` phải là một chuỗi thập phân KHÔNG ÂM, biểu diễn
 * ĐƯỢC CHÍNH XÁC ở scale 2 (tối đa 2 chữ số thập phân), và có tối đa 12
 * chữ số phần nguyên — khớp CHÍNH XÁC với cột `invoices
 * .actual_charged_amount NUMERIC(14, 2)` ở migration 001 (14 chữ số
 * tổng, 2 dành cho phần thập phân -> tối đa 12 chữ số nguyên).
 *
 * Why this exists (corrective — xem docs/CREATE_INVOICE_WORKFLOW.md mục
 * "actualChargedAmount scale corrective"):
 * `calculateBillingDifference` (Calculation Core) chấp nhận BẤT KỲ
 * chuỗi thập phân hợp lệ nào, kể cả một chuỗi có nhiều hơn 2 chữ số
 * thập phân (ví dụ "367000.123456") — điều đó đúng cho MỘT PHÉP TÍNH
 * trung gian, nhưng SAI cho một giá trị sẽ được LƯU vào
 * `NUMERIC(14, 2)`: PostgreSQL sẽ âm thầm làm tròn giá trị đó thành
 * "367000.12" khi lưu, khiến `billingDifference` đã trả về cho caller
 * (tính từ "367000.123456") và `invoice.actualChargedAmount` đã lưu
 * (là "367000.12") mô tả hai giá trị nguồn khác nhau — một lỗi về tính
 * đúng đắn (correctness), không chỉ hiển thị. Kiểm tra này BẮT giá trị
 * không vừa scale 2 TRƯỚC khi tính toán/ghi, thay vì để PostgreSQL âm
 * thầm làm tròn sau đó.
 *
 * Does NOT:
 * - dùng `Number()`/`parseFloat()` — chỉ kiểm tra HÌNH DẠNG chuỗi bằng
 *   regex, không ép kiểu số.
 * - áp dụng cho `invoice.calculatedTotal` — giá trị đó LUÔN là số
 *   nguyên VNĐ (đã qua half-up rounding của Calculation Core, xem
 *   docs/NUMERIC_PRECISION.md), không bao giờ có phần thập phân cần
 *   kiểm tra riêng.
 */
const ACTUAL_CHARGED_AMOUNT_SCALE_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export function isValidActualChargedAmountScale(value: string): boolean {
  return ACTUAL_CHARGED_AMOUNT_SCALE_PATTERN.test(value);
}
