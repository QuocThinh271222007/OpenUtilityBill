// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ExactNumber, ONE, ZERO, add, compare, fromBigInt, multiply, parseDecimal, roundHalfUpToInteger, toDecimalString } from "../shared/exact-number";
import { WaterChargeResult } from "../types/calculation.types";

/**
 * Trách nhiệm:
 * Tính hoá đơn nước theo một trong hai phương pháp cấu hình:
 * PER_CUBIC_METER (theo m3 tiêu thụ) hoặc PER_PERSON (theo số người ở).
 *
 * Input: method ("PER_CUBIC_METER" | "PER_PERSON", nhận `string` để tự
 * kiểm tra thay vì tin tưởng type hệ thống gọi vào), waterUsageM3 (bắt
 * buộc cho PER_CUBIC_METER), tenantCount (bắt buộc cho PER_PERSON),
 * pricePerCubicMeter, pricePerPerson, vatRate, environmentalFeeRate.
 *
 * Output: Result<WaterChargeResult>.
 *
 * Điều kiện lỗi:
 * - method không phải PER_CUBIC_METER/PER_PERSON.
 * - PER_CUBIC_METER thiếu waterUsageM3, hoặc waterUsageM3 âm/không hợp lệ.
 * - PER_PERSON có tenantCount âm/không phải số nguyên.
 * - vatRate hoặc environmentalFeeRate không hợp lệ, ngoài [0, 1], hoặc
 *   đơn giá âm.
 *
 * Bất biến quan trọng:
 * Phí môi trường tính từ `base` (tiền nước trước thuế), TUYỆT ĐỐI KHÔNG
 * phải từ (base + VAT). Đây là điểm dễ nhầm nhất của công thức — xem
 * ví dụ bằng số trong docs/CALCULATION_CORE.md.
 *
 * Không chịu trách nhiệm:
 * - cộng dồn (base + VAT) trước khi tính phí môi trường.
 * - làm tròn base/VAT/phí môi trường trước tổng cuối — chỉ
 *   roundedTotalVnd được làm tròn.
 *
 * Lý do tồn tại:
 * Tính nước độc lập hoàn toàn với tính điện (khác input, khác công
 * thức) — không có lý do gộp chung, và việc tách giúp mỗi hàm nhỏ, dễ
 * test theo từng phương pháp (PER_CUBIC_METER / PER_PERSON) riêng biệt.
 */
export interface WaterChargeInput {
  method: string;
  waterUsageM3: string | null;
  tenantCount: number;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
}

function parseRate(value: string, errorCode: string, label: string): Result<ExactNumber> {
  const parsed = parseDecimal(value);
  if (!parsed.success) {
    return fail(errorCode, `${label} không hợp lệ: "${value}"`);
  }
  if (compare(parsed.data, ZERO) < 0 || compare(parsed.data, ONE) > 0) {
    return fail(errorCode, `${label} phải nằm trong đoạn [0, 1] (phân số thập phân, ví dụ 0.05 cho 5%).`);
  }
  return ok(parsed.data);
}

export function calculateWaterCharge(input: WaterChargeInput): Result<WaterChargeResult> {
  let base: ExactNumber;

  if (input.method === "PER_CUBIC_METER") {
    if (input.waterUsageM3 === null) {
      return fail("INVALID_WATER_METHOD", "Phương pháp PER_CUBIC_METER yêu cầu waterUsageM3.");
    }
    const usageResult = parseDecimal(input.waterUsageM3);
    if (!usageResult.success) {
      return fail("INVALID_DECIMAL", `waterUsageM3 không hợp lệ: "${input.waterUsageM3}"`);
    }
    if (compare(usageResult.data, ZERO) < 0) {
      return fail("INVALID_DECIMAL", "waterUsageM3 không được âm.");
    }
    const priceResult = parseDecimal(input.pricePerCubicMeter);
    if (!priceResult.success) {
      return fail("INVALID_DECIMAL", `pricePerCubicMeter không hợp lệ: "${input.pricePerCubicMeter}"`);
    }
    if (compare(priceResult.data, ZERO) < 0) {
      return fail("INVALID_DECIMAL", "pricePerCubicMeter không được âm.");
    }
    base = multiply(usageResult.data, priceResult.data);
  } else if (input.method === "PER_PERSON") {
    if (!Number.isInteger(input.tenantCount) || input.tenantCount < 0) {
      return fail("INVALID_TENANT_COUNT", `tenantCount không hợp lệ cho PER_PERSON: ${input.tenantCount}`);
    }
    const priceResult = parseDecimal(input.pricePerPerson);
    if (!priceResult.success) {
      return fail("INVALID_DECIMAL", `pricePerPerson không hợp lệ: "${input.pricePerPerson}"`);
    }
    if (compare(priceResult.data, ZERO) < 0) {
      return fail("INVALID_DECIMAL", "pricePerPerson không được âm.");
    }
    base = multiply(fromBigInt(BigInt(input.tenantCount)), priceResult.data);
  } else {
    return fail("INVALID_WATER_METHOD", `method không hợp lệ: "${input.method}"`);
  }

  const vatRateResult = parseRate(input.vatRate, "INVALID_WATER_RATE", "vatRate");
  if (!vatRateResult.success) {
    return vatRateResult;
  }
  const feeRateResult = parseRate(input.environmentalFeeRate, "INVALID_WATER_RATE", "environmentalFeeRate");
  if (!feeRateResult.success) {
    return feeRateResult;
  }

  const vatAmount = multiply(base, vatRateResult.data);
  // Phí môi trường tính từ `base`, KHÔNG phải (base + vatAmount) — xem
  // "Bất biến quan trọng" ở đầu file.
  const environmentalFeeAmount = multiply(base, feeRateResult.data);
  const exactTotal = add(add(base, vatAmount), environmentalFeeAmount);
  const roundedTotalVnd = roundHalfUpToInteger(exactTotal);

  return ok({
    method: input.method as WaterChargeResult["method"],
    base: toDecimalString(base),
    vatRate: toDecimalString(vatRateResult.data),
    vatAmount: toDecimalString(vatAmount),
    environmentalFeeRate: toDecimalString(feeRateResult.data),
    environmentalFeeAmount: toDecimalString(environmentalFeeAmount),
    exactTotal: toDecimalString(exactTotal),
    roundedTotalVnd: toDecimalString(fromBigInt(roundedTotalVnd)),
  });
}
