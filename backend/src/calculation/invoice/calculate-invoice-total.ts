// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ZERO, add, compare, parseDecimal, roundHalfUpToInteger, toDecimalString, fromBigInt } from "../shared/exact-number";

/**
 * Responsibility:
 * Cộng tổng chính xác của thành phần điện và nước thành tổng hoá đơn,
 * rồi làm tròn half-up MỘT LẦN DUY NHẤT cho toàn hoá đơn.
 *
 * Input: electricityExactTotal, waterExactTotal — chuỗi thập phân
 * `exactTotal` (CHƯA làm tròn) lấy từ kết quả
 * calculate-tiered-electricity.ts/calculate-fallback-electricity.ts và
 * calculate-water-charge.ts.
 *
 * Output: Result<InvoiceTotalResult> — exactTotal (tổng chính xác chưa
 * làm tròn) và roundedTotalVnd (đã làm tròn).
 *
 * Failure conditions: electricityExactTotal/waterExactTotal không parse
 * được thành số thập phân hợp lệ, hoặc âm.
 *
 * Important invariant:
 * CỘNG TRƯỚC, LÀM TRÒN SAU. Không được:
 *   round(electricity) + round(water)
 * mà phải:
 *   round(electricity_exact + water_exact)
 * Hai cách này có thể cho kết quả khác nhau — xem
 * docs/NUMERIC_PRECISION.md.
 *
 * Does NOT:
 * - tự tính electricity/water — nhận exactTotal đã tính sẵn làm tham
 *   số, chỉ chịu trách nhiệm cộng và làm tròn ở mức hoá đơn.
 * - lưu trữ (persist) bất cứ điều gì — hàm thuần tuý (pure function).
 *
 * Why this module is separate:
 * Tách "tính từng thành phần" khỏi "tổng hợp hoá đơn" để quy tắc
 * "không làm tròn trung gian, chỉ làm tròn tổng cuối" có một nơi DUY
 * NHẤT chịu trách nhiệm, không lặp lại rải rác.
 */
export interface InvoiceTotalInput {
  electricityExactTotal: string;
  waterExactTotal: string;
}

export interface InvoiceTotalResult {
  exactTotal: string;
  roundedTotalVnd: string;
}

export function calculateInvoiceTotal(input: InvoiceTotalInput): Result<InvoiceTotalResult> {
  const electricityResult = parseDecimal(input.electricityExactTotal);
  if (!electricityResult.success) {
    return fail("INVALID_DECIMAL", `electricityExactTotal không hợp lệ: "${input.electricityExactTotal}"`);
  }
  if (compare(electricityResult.data, ZERO) < 0) {
    return fail("INVALID_DECIMAL", "electricityExactTotal không được âm.");
  }

  const waterResult = parseDecimal(input.waterExactTotal);
  if (!waterResult.success) {
    return fail("INVALID_DECIMAL", `waterExactTotal không hợp lệ: "${input.waterExactTotal}"`);
  }
  if (compare(waterResult.data, ZERO) < 0) {
    return fail("INVALID_DECIMAL", "waterExactTotal không được âm.");
  }

  const exactTotal = add(electricityResult.data, waterResult.data);
  const roundedTotalVnd = roundHalfUpToInteger(exactTotal);

  return ok({
    exactTotal: toDecimalString(exactTotal),
    roundedTotalVnd: toDecimalString(fromBigInt(roundedTotalVnd)),
  });
}
