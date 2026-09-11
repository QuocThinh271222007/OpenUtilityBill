// SPDX-License-Identifier: MIT

import { isExactDecimalWithinScale } from "../../shared/validation/decimal-scale";
import { ONE, ZERO, compare, parseDecimal } from "../../calculation/shared/exact-number";

/**
 * Trách nhiệm:
 * Kiểm tra một chuỗi thập phân có phải một TỈ LỆ hợp lệ (`electricity
 * VatRate`, `water.vatRate`, `water.environmentalFeeRate`) hay không —
 * vừa `NUMERIC(5, 4)` (tối đa 1 chữ số nguyên, 4 chữ số thập phân) VÀ
 * nằm trong đoạn [0, 1] — DÙNG CHUNG giữa Electricity/Water Tariff
 * Management Service.
 *
 * Why reuse Calculation Core's exact-number primitives cho so sánh
 * [0, 1]:
 * So sánh một chuỗi thập phân với "1" KHÔNG được dùng
 * `Number()`/`parseFloat()` (xem docs/DATABASE_ACCESS.md mục "NUMERIC
 * precision boundary"). `parseDecimal`/`compare`/`ZERO`/`ONE`
 * (backend/src/calculation/shared/exact-number.ts) đã là cách CHÍNH XÁC
 * DUY NHẤT dự án dùng để so sánh số thập phân dạng chuỗi — tái sử dụng
 * thay vì viết lại một phép so sánh số thứ hai.
 *
 * Không chịu trách nhiệm:
 * - gọi bất kỳ hàm calculate*Electricity/Water nào của Calculation Core
 *   — chỉ dùng các hàm SO SÁNH SỐ nguyên thuỷ (parseDecimal/compare),
 *   không dựng một kịch bản tính hoá đơn giả chỉ để validate một tỉ lệ.
 */
export function isValidRateShape(value: string): boolean {
  return isExactDecimalWithinScale(value, { maxIntegerDigits: 1, maxFractionalDigits: 4 });
}

export function isValidRateValue(value: string): boolean {
  if (!isValidRateShape(value)) {
    return false;
  }
  const parsed = parseDecimal(value);
  if (!parsed.success) {
    return false;
  }
  return compare(parsed.data, ZERO) >= 0 && compare(parsed.data, ONE) <= 0;
}
