// SPDX-License-Identifier: MIT

import { isPositiveIntegerId } from "../../shared/validation/id";
import { isExactDecimalWithinScale } from "../../shared/validation/decimal-scale";

/**
 * Trách nhiệm:
 * Các hàm kiểm tra (predicate) dùng CHUNG giữa `CreateInvoiceService` và
 * `GetInvoiceService` — tách riêng để không định nghĩa lại cùng một quy
 * tắc ở hai nơi (roomId, billingPeriod đều được cả hai Service nhận làm
 * đầu vào). `isPositiveIntegerId` được RE-EXPORT từ
 * `shared/validation/id.ts` (dùng chung với property/room/meter-reading/
 * tariff) để code hiện tại import từ đây không cần sửa.
 *
 * Không chịu trách nhiệm:
 * - chứa logic đọc/ghi database hay Calculation Core — chỉ kiểm tra
 *   HÌNH DẠNG (shape) của giá trị đầu vào, thuần hàm (pure), không I/O.
 */
export { isPositiveIntegerId } from "../../shared/validation/id";
export { isFirstDayOfMonthUtc } from "../../shared/validation/date";

/**
 * `actualChargedAmount` phải là một chuỗi thập phân KHÔNG ÂM, biểu diễn
 * ĐƯỢC CHÍNH XÁC ở scale 2 (tối đa 2 chữ số thập phân), và có tối đa 12
 * chữ số phần nguyên — khớp CHÍNH XÁC với cột `invoices
 * .actual_charged_amount NUMERIC(14, 2)` ở migration 001 (14 chữ số
 * tổng, 2 dành cho phần thập phân -> tối đa 12 chữ số nguyên).
 *
 * Lý do tồn tại (corrective — xem docs/CREATE_INVOICE_WORKFLOW.md mục
 * "Sửa lỗi scale actualChargedAmount"):
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
 * Không chịu trách nhiệm:
 * - dùng `Number()`/`parseFloat()` — chỉ kiểm tra HÌNH DẠNG chuỗi bằng
 *   regex, không ép kiểu số.
 * - áp dụng cho `invoice.calculatedTotal` — giá trị đó LUÔN là số
 *   nguyên VNĐ (đã qua half-up rounding của Calculation Core, xem
 *   docs/NUMERIC_PRECISION.md), không bao giờ có phần thập phân cần
 *   kiểm tra riêng.
 */
export function isValidActualChargedAmountScale(value: string): boolean {
  return isExactDecimalWithinScale(value, { maxIntegerDigits: 12, maxFractionalDigits: 2 });
}
