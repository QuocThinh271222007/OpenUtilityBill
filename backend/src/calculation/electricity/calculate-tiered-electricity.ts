// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ONE, ZERO, add, compare, multiply, parseDecimal, roundHalfUpToInteger, toDecimalString, fromBigInt } from "../shared/exact-number";
import { ElectricityTierInput, TieredElectricityResult } from "../types/calculation.types";
import { allocateElectricityTiers } from "./allocate-electricity-tiers";
import { calculateQuotaFactorExact } from "./calculate-quota-factor";
import { validateElectricityConfig } from "./validate-electricity-config";

/**
 * Responsibility:
 * Tính hoá đơn điện theo phương pháp QUOTA_TIERED (bậc thang, điều
 * chỉnh theo quota số người ở) — điều phối toàn bộ pipeline: quota →
 * validate cấu hình → phân bổ bậc → subtotal → VAT → tổng chính xác →
 * làm tròn half-up.
 *
 * Input: usageKwh (chuỗi, không âm), tenantCount, peoplePerQuotaUnit,
 * vatRate (chuỗi, trong [0, 1]), tiers (ElectricityTierInput[]).
 *
 * Output: Result<TieredElectricityResult> — mọi giá trị đo lường/tài
 * chính là chuỗi thập phân chuẩn hoá (xem calculation.types.ts).
 *
 * Failure conditions: xem các fail() bên dưới — usageKwh không hợp lệ,
 * quotaFactor thất bại (tenantCount/peoplePerQuotaUnit không hợp lệ),
 * vatRate không hợp lệ, cấu hình tiers không hợp lệ.
 *
 * Important invariant:
 * KHÔNG làm tròn ở bất kỳ bước trung gian nào (usage, quotaFactor,
 * ngưỡng bậc đã điều chỉnh, từng amount, subtotal, VAT). CHỈ làm tròn
 * một lần duy nhất — roundedTotalVnd — ở bước cuối cùng.
 *
 * Does NOT:
 * - hard-code số lượng bậc hay bất kỳ đơn giá/ngưỡng cụ thể nào của kỳ
 *   thi. Toàn bộ đến từ tham số `tiers` (xem
 *   backend/src/calculation/__tests__/fixtures/competition-defaults.ts
 *   cho dữ liệu test).
 * - truy cập database/Express — nhận toàn bộ dữ liệu qua tham số hàm.
 *
 * Why this module is separate:
 * Đây là điểm điều phối (orchestration) của phương pháp QUOTA_TIERED —
 * gọi các hàm nhỏ hơn (quota, validate, allocate) theo đúng thứ tự,
 * nhưng bản thân không chứa công thức bậc thang hay logic validate chi
 * tiết, giữ mỗi hàm phụ thuộc chỉ một trách nhiệm.
 */
export interface TieredElectricityInput {
  usageKwh: string;
  tenantCount: number;
  peoplePerQuotaUnit: number;
  vatRate: string;
  tiers: ElectricityTierInput[];
}

export function calculateTieredElectricity(input: TieredElectricityInput): Result<TieredElectricityResult> {
  const usageResult = parseDecimal(input.usageKwh);
  if (!usageResult.success) {
    return fail("INVALID_METER_READING", `usageKwh không hợp lệ: "${input.usageKwh}"`);
  }
  const usage = usageResult.data;
  if (compare(usage, ZERO) < 0) {
    return fail("INVALID_METER_READING", "usageKwh không được âm.");
  }

  // Lấy quotaFactor dưới dạng ExactNumber TRỰC TIẾP — không đi qua
  // chuỗi thập phân rồi parse lại. Chuỗi chỉ cần thiết ở ranh giới công
  // khai (trường quotaFactor trong kết quả trả về bên dưới), không phải
  // giữa hai bước tính toán nội bộ liền kề nhau (xem "Why no string
  // round-trip" trong calculate-quota-factor.ts).
  const quotaFactorResult = calculateQuotaFactorExact({
    tenantCount: input.tenantCount,
    peoplePerQuotaUnit: input.peoplePerQuotaUnit,
  });
  if (!quotaFactorResult.success) {
    return quotaFactorResult;
  }
  const quotaFactor = quotaFactorResult.data;

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

  const appliedTiers = allocateElectricityTiers(usage, quotaFactor, validatedTiers.data);

  let subtotal = ZERO;
  for (const tier of appliedTiers) {
    subtotal = add(subtotal, tier.amount);
  }

  const vatAmount = multiply(subtotal, vatRate);
  const exactTotal = add(subtotal, vatAmount);
  const roundedTotalVnd = roundHalfUpToInteger(exactTotal);

  return ok({
    usageKwh: toDecimalString(usage),
    quotaFactor: toDecimalString(quotaFactor),
    appliedTiers: appliedTiers.map((tier) => ({
      tierNumber: tier.tierNumber,
      quantityKwh: toDecimalString(tier.quantityKwh),
      unitPrice: toDecimalString(tier.unitPrice),
      amount: toDecimalString(tier.amount),
    })),
    subtotal: toDecimalString(subtotal),
    vatRate: toDecimalString(vatRate),
    vatAmount: toDecimalString(vatAmount),
    exactTotal: toDecimalString(exactTotal),
    roundedTotalVnd: toDecimalString(fromBigInt(roundedTotalVnd)),
  });
}
