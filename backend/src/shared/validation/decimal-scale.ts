// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Kiểm tra một chuỗi thập phân có VỪA MỘT SCALE CỐ ĐỊNH (số chữ số phần
 * nguyên/thập phân tối đa) hay không, KHÔNG BAO GIỜ ép về JS `number`
 * (`Number()`/`parseFloat()`) — dùng chung bởi mọi giá trị sẽ được lưu
 * vào một cột `NUMERIC(p, s)` cụ thể (meter reading `NUMERIC(12,2)`,
 * tier threshold `NUMERIC(12,2)`, tier/tariff giá `NUMERIC(14,2)`, tỉ lệ
 * VAT/phí `NUMERIC(5,4)`, ...).
 *
 * Lý do tồn tại:
 * PostgreSQL âm thầm LÀM TRÒN một giá trị NUMERIC khi lưu nếu nó có
 * nhiều chữ số thập phân hơn scale đã khai báo của cột — một giá trị đã
 * qua bước tính toán/hiển thị ở tầng ứng dụng nhưng KHÔNG khớp scale sẽ
 * bị lưu SAI mà không có lỗi nào được báo (xem
 * docs/CREATE_INVOICE_WORKFLOW.md mục "actualChargedAmount scale
 * corrective" cho một ví dụ thực tế đã xảy ra với đúng vấn đề này).
 * Kiểm tra này chặn giá trị không vừa TRƯỚC khi ghi, thay vì để
 * PostgreSQL âm thầm làm tròn.
 *
 * Không chịu trách nhiệm:
 * - chấp nhận số âm — mọi giá trị dùng hàm này trong dự án (chỉ số công
 *   tơ, đơn giá, ngưỡng bậc) đều không âm theo CHECK constraint tương
 *   ứng ở migration 001. Nếu một giá trị cần cho phép âm trong tương
 *   lai, đó là một hàm/tham số riêng, không phải mở rộng hàm này.
 * - tự làm tròn hay chuẩn hoá chuỗi — chỉ trả về hợp lệ/không hợp lệ.
 */
export interface DecimalScaleOptions {
  /** Số chữ số phần nguyên tối đa. */
  maxIntegerDigits: number;
  /** Số chữ số phần thập phân tối đa (0 = không cho phép phần thập phân). */
  maxFractionalDigits: number;
}

export function isExactDecimalWithinScale(value: string, options: DecimalScaleOptions): boolean {
  // maxFractionalDigits = 0 nghĩa là không cho phép dấu chấm thập phân
  // chút nào — xử lý riêng vì `\d{1,0}` là một quantifier không hợp lệ.
  const fractionalPart = options.maxFractionalDigits > 0 ? `(\\.\\d{1,${options.maxFractionalDigits}})?` : "";
  const pattern = new RegExp(`^\\d{1,${options.maxIntegerDigits}}${fractionalPart}$`);
  return pattern.test(value);
}
