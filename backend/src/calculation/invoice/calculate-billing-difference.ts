// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ZERO, compare, parseDecimal, subtract, toDecimalString } from "../shared/exact-number";

/**
 * Responsibility:
 * Tính chênh lệch giữa số tiền THỰC TẾ đã thu (actualChargedAmount) và
 * tổng hoá đơn hợp pháp đã làm tròn (legalRoundedTotalVnd).
 *
 * Input: actualChargedAmount (chuỗi, không âm), legalRoundedTotalVnd
 * (chuỗi — kết quả roundedTotalVnd từ calculate-invoice-total.ts).
 *
 * Output: Result<string> — chênh lệch dạng chuỗi thập phân, CÓ THỂ ÂM.
 *   dương: khách trả nhiều hơn số tính hợp pháp.
 *   0: khách trả đúng.
 *   âm: khách trả ít hơn số tính hợp pháp.
 *
 * Failure conditions: actualChargedAmount/legalRoundedTotalVnd không
 * parse được, hoặc actualChargedAmount âm (một số tiền đã thu không
 * thể âm).
 *
 * Important invariant:
 * Đây là giá trị SUY RA (derived) — KHÔNG được lưu lại vào
 * invoices.difference_amount hay bất kỳ cột database nào (xem
 * docs/DATABASE_DESIGN.md mục "Derived values are not persisted"). Giá
 * trị này chỉ tồn tại tạm thời khi cần hiển thị/so sánh.
 *
 * Does NOT:
 * - làm tròn kết quả — cả actualChargedAmount và legalRoundedTotalVnd
 *   đều đã là số nguyên VNĐ, nên hiệu của chúng luôn chính xác, không
 *   cần làm tròn thêm.
 *
 * Why this module is separate:
 * "So sánh số tiền đã thu với số tính hợp pháp" là một bước hoàn toàn
 * độc lập với việc tính hoá đơn — có thể xảy ra rất lâu sau khi hoá đơn
 * đã được tạo (khi thực tế thu tiền được ghi nhận), nên tách thành một
 * hàm riêng, không gắn với calculate-invoice-total.ts.
 */
export interface BillingDifferenceInput {
  actualChargedAmount: string;
  legalRoundedTotalVnd: string;
}

export function calculateBillingDifference(input: BillingDifferenceInput): Result<string> {
  const actualResult = parseDecimal(input.actualChargedAmount);
  if (!actualResult.success) {
    return fail("INVALID_ACTUAL_CHARGED_AMOUNT", `actualChargedAmount không hợp lệ: "${input.actualChargedAmount}"`);
  }
  if (compare(actualResult.data, ZERO) < 0) {
    return fail("INVALID_ACTUAL_CHARGED_AMOUNT", "actualChargedAmount không được âm.");
  }

  const legalResult = parseDecimal(input.legalRoundedTotalVnd);
  if (!legalResult.success) {
    return fail("INVALID_DECIMAL", `legalRoundedTotalVnd không hợp lệ: "${input.legalRoundedTotalVnd}"`);
  }

  return ok(toDecimalString(subtract(actualResult.data, legalResult.data)));
}
