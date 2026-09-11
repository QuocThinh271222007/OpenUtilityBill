// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ONE, ZERO, add, compare, multiply, parseDecimal, roundHalfUpToInteger, toDecimalString, fromBigInt } from "../shared/exact-number";
import { ElectricityTierInput, FallbackElectricityResult } from "../types/calculation.types";
import { validateElectricityConfig } from "./validate-electricity-config";

/**
 * Responsibility:
 * Tính hoá đơn điện theo phương pháp FALLBACK_TIER_FLAT — toàn bộ sản
 * lượng tiêu thụ được tính theo MỘT đơn giá duy nhất: đơn giá của bậc
 * có tierNumber = fallbackTierNumber (đọc từ cấu hình tariff).
 *
 * Input: usageKwh (chuỗi, không âm), vatRate (chuỗi, trong [0, 1]),
 * tiers (dùng để TRA CỨU đơn giá của fallbackTierNumber — không dùng
 * ngưỡng/bậc nào khác), fallbackTierNumber (số nguyên, đọc từ
 * electricity_tariffs.fallback_tier_number).
 *
 * Output: Result<FallbackElectricityResult>.
 *
 * Failure conditions:
 * - usageKwh/vatRate không hợp lệ.
 * - cấu hình tiers không hợp lệ (dùng chung validate-electricity-config.ts
 *   để đảm bảo tính nhất quán với phương pháp QUOTA_TIERED).
 * - không tìm thấy bậc nào có tierNumber = fallbackTierNumber ->
 *   FALLBACK_TIER_NOT_FOUND.
 *
 * Important invariant:
 * KHÔNG dùng chỉ số mảng cố định (ví dụ tiers[2]) và KHÔNG hard-code số
 * bậc fallback (ví dụ số 3). fallbackTierNumber luôn là tham số đầu
 * vào; bậc được TÌM bằng tierNumber, không phải vị trí trong mảng.
 *
 * Does NOT:
 * - dùng quotaFactor hay ngưỡng bậc — phương pháp fallback tính thẳng
 *   usage × đơn giá bậc fallback, không phân bổ theo bậc thang.
 *
 * Why this module is separate:
 * FALLBACK_TIER_FLAT và QUOTA_TIERED là hai công thức tính tiền điện
 * hoàn toàn khác nhau (dù dùng chung một tập bậc giá để tra cứu đơn
 * giá) — tách thành hai hàm riêng thay vì một hàm với nhánh if/else để
 * mỗi công thức dễ đọc, dễ test độc lập.
 */
export interface FallbackElectricityInput {
  usageKwh: string;
  vatRate: string;
  tiers: ElectricityTierInput[];
  fallbackTierNumber: number;
}

export function calculateFallbackElectricity(input: FallbackElectricityInput): Result<FallbackElectricityResult> {
  const usageResult = parseDecimal(input.usageKwh);
  if (!usageResult.success) {
    return fail("INVALID_METER_READING", `usageKwh không hợp lệ: "${input.usageKwh}"`);
  }
  const usage = usageResult.data;
  if (compare(usage, ZERO) < 0) {
    return fail("INVALID_METER_READING", "usageKwh không được âm.");
  }

  const vatRateResult = parseDecimal(input.vatRate);
  if (!vatRateResult.success) {
    return fail("INVALID_VAT_RATE", `vatRate không hợp lệ: "${input.vatRate}"`);
  }
  const vatRate = vatRateResult.data;
  if (compare(vatRate, ZERO) < 0 || compare(vatRate, ONE) > 0) {
    return fail("INVALID_VAT_RATE", "vatRate phải nằm trong đoạn [0, 1] (phân số thập phân, ví dụ 0.08 cho 8%).");
  }

  const validatedTiers = validateElectricityConfig(input.tiers);
  if (!validatedTiers.success) {
    return validatedTiers;
  }

  const selectedTier = validatedTiers.data.find((tier) => tier.tierNumber === input.fallbackTierNumber);
  if (!selectedTier) {
    return fail("FALLBACK_TIER_NOT_FOUND", `Không tìm thấy bậc giá điện có tierNumber = ${input.fallbackTierNumber}.`);
  }

  const subtotal = multiply(usage, selectedTier.unitPrice);
  const vatAmount = multiply(subtotal, vatRate);
  const exactTotal = add(subtotal, vatAmount);
  const roundedTotalVnd = roundHalfUpToInteger(exactTotal);

  return ok({
    usageKwh: toDecimalString(usage),
    fallbackTierNumber: selectedTier.tierNumber,
    unitPrice: toDecimalString(selectedTier.unitPrice),
    subtotal: toDecimalString(subtotal),
    vatRate: toDecimalString(vatRate),
    vatAmount: toDecimalString(vatAmount),
    exactTotal: toDecimalString(exactTotal),
    roundedTotalVnd: toDecimalString(fromBigInt(roundedTotalVnd)),
  });
}
