// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import {
  ExactNumber,
  ZERO,
  add,
  compare,
  parseDecimal,
  subtract,
  toDecimalString,
  fromBigInt,
} from "../shared/exact-number";

/**
 * Responsibility:
 * Tính sản lượng tiêu thụ (usage) từ hai chỉ số công tơ (previous,
 * current), xử lý cả trường hợp công tơ "quay vòng" (rollover) khi
 * current < previous.
 *
 * Input: previousReading, currentReading (chuỗi thập phân không âm),
 * meterMaximumValue (chuỗi thập phân dương, hoặc null nếu công tơ
 * không khai báo giá trị tối đa).
 *
 * Output: Result<string> — usage dạng chuỗi thập phân chuẩn hoá.
 *
 * Failure conditions:
 * - previousReading/currentReading/meterMaximumValue không parse được
 *   thành số thập phân hợp lệ.
 * - previousReading hoặc currentReading âm.
 * - meterMaximumValue <= 0 khi được cung cấp.
 * - previousReading hoặc currentReading vượt quá meterMaximumValue.
 * - current < previous NHƯNG không có meterMaximumValue — không đủ
 *   thông tin để biết công tơ đã quay vòng bao nhiêu lần.
 *
 * Important invariant:
 * Không dùng floating-point ở bất kỳ bước nào — mọi phép trừ/cộng dùng
 * ExactNumber (xem shared/exact-number.ts).
 *
 * Does NOT:
 * - tin tưởng rằng dữ liệu đã được PostgreSQL kiểm tra trước
 *   (previous_reading/current_reading/meter_maximum_value đã có CHECK
 *   constraint ở database/migrations/001_initial_domain_schema.sql).
 *   Calculation Core PHẢI tự an toàn độc lập — nó có thể được gọi từ
 *   test, từ một Service tương lai, hay bất kỳ nguồn dữ liệu nào khác,
 *   không chỉ từ một hàng đã qua kiểm tra của database.
 * - suy luận số lần rollover nếu current < previous mà không có
 *   meterMaximumValue — trả lỗi rõ ràng thay vì đoán.
 *
 * Why this module is separate:
 * Việc tính usage (bao gồm cả logic rollover) là một bước độc lập, có
 * thể unit-test riêng, TRƯỚC KHI usage đó được đưa vào công thức tính
 * tiền điện — tách để mỗi phần chỉ chịu trách nhiệm một việc rõ ràng.
 */
export interface MeterUsageInput {
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
}

export function calculateMeterUsage(input: MeterUsageInput): Result<string> {
  const previousResult = parseDecimal(input.previousReading);
  if (!previousResult.success) {
    return fail("INVALID_METER_READING", `previousReading không hợp lệ: "${input.previousReading}"`);
  }
  const currentResult = parseDecimal(input.currentReading);
  if (!currentResult.success) {
    return fail("INVALID_METER_READING", `currentReading không hợp lệ: "${input.currentReading}"`);
  }

  const previous = previousResult.data;
  const current = currentResult.data;

  if (compare(previous, ZERO) < 0) {
    return fail("INVALID_METER_READING", "previousReading không được âm.");
  }
  if (compare(current, ZERO) < 0) {
    return fail("INVALID_METER_READING", "currentReading không được âm.");
  }

  let maximum: ExactNumber | null = null;
  if (input.meterMaximumValue !== null) {
    const maximumResult = parseDecimal(input.meterMaximumValue);
    if (!maximumResult.success) {
      return fail("INVALID_METER_MAXIMUM", `meterMaximumValue không hợp lệ: "${input.meterMaximumValue}"`);
    }
    if (compare(maximumResult.data, ZERO) <= 0) {
      return fail("INVALID_METER_MAXIMUM", "meterMaximumValue phải lớn hơn 0.");
    }
    maximum = maximumResult.data;

    // Kiểm tra phòng thủ — database đã có CHECK tương tự, nhưng
    // Calculation Core không giả định điều đó đã chạy (xem "Does NOT").
    if (compare(previous, maximum) > 0) {
      return fail("INVALID_METER_READING", "previousReading vượt quá meterMaximumValue.");
    }
    if (compare(current, maximum) > 0) {
      return fail("INVALID_METER_READING", "currentReading vượt quá meterMaximumValue.");
    }
  }

  if (compare(current, previous) >= 0) {
    return ok(toDecimalString(subtract(current, previous)));
  }

  // current < previous: chỉ hợp lệ nếu công tơ đã quay vòng, và ta chỉ
  // biết điều đó khi có meterMaximumValue để tính phần "đi hết vòng".
  if (maximum === null) {
    return fail(
      "METER_MAXIMUM_REQUIRED",
      "currentReading nhỏ hơn previousReading nhưng không có meterMaximumValue để tính rollover."
    );
  }

  // usage = (max + 1 - previous) + current
  const usage = add(subtract(add(maximum, fromBigInt(1n)), previous), current);
  return ok(toDecimalString(usage));
}
