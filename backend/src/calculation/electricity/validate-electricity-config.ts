// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ExactNumber, ZERO, compare, parseDecimal } from "../shared/exact-number";
import { ElectricityTierInput } from "../types/calculation.types";

/**
 * Trách nhiệm:
 * Kiểm tra và phân tích (parse) một danh sách bậc giá điện — dữ liệu
 * cấu hình DATA-DRIVEN, không giả định số lượng bậc cố định — trước khi
 * đưa vào allocate-electricity-tiers.ts.
 *
 * Input: ElectricityTierInput[] (tierNumber, thresholdKwh chuỗi hoặc
 * null, unitPrice chuỗi) — không giả định thứ tự hay số lượng.
 *
 * Output: Result<ValidatedElectricityTier[]> — danh sách đã parse thành
 * ExactNumber, SẮP XẾP theo tierNumber tăng dần.
 *
 * Điều kiện lỗi:
 * - danh sách rỗng.
 * - tierNumber không phải số nguyên dương.
 * - tierNumber trùng lặp.
 * - thresholdKwh hoặc unitPrice không parse được thành số thập phân.
 * - thresholdKwh <= 0 khi có giá trị (không phải null).
 * - unitPrice âm.
 * - không có đúng một bậc "không giới hạn" (thresholdKwh = null).
 * - bậc không giới hạn không phải bậc cuối cùng sau khi sắp xếp.
 *
 * Bất biến quan trọng:
 * Đầu vào có thể đến KHÔNG theo thứ tự tierNumber — hàm này tự sắp xếp
 * lại một cách xác định (deterministic), không coi đó là lỗi.
 *
 * Không chịu trách nhiệm:
 * - tự "sửa" khi có tierNumber trùng lặp bằng cách chọn một trong hai —
 *   đó là dữ liệu cấu hình mơ hồ, phải FAIL tường minh thay vì âm thầm
 *   giải quyết.
 * - giả định đúng 6 bậc. Test có tariff 3 bậc vẫn phải hợp lệ.
 *
 * Lý do tồn tại:
 * Việc "cấu hình bậc giá có hợp lệ không" là một câu hỏi độc lập với
 * "phân bổ usage vào các bậc như thế nào" — tách riêng để mỗi hàm chỉ
 * có một trách nhiệm, dễ test độc lập.
 */
export interface ValidatedElectricityTier {
  tierNumber: number;
  /** null = bậc cuối, không giới hạn. */
  thresholdKwh: ExactNumber | null;
  unitPrice: ExactNumber;
}

export function validateElectricityConfig(tiers: ElectricityTierInput[]): Result<ValidatedElectricityTier[]> {
  if (tiers.length === 0) {
    return fail("EMPTY_TARIFF", "Danh sách bậc giá điện không được rỗng.");
  }

  const seenTierNumbers = new Set<number>();
  const parsed: ValidatedElectricityTier[] = [];

  for (const tier of tiers) {
    if (!Number.isInteger(tier.tierNumber) || tier.tierNumber <= 0) {
      return fail("INVALID_TIER_NUMBER", `tierNumber phải là số nguyên dương: ${tier.tierNumber}`);
    }
    if (seenTierNumbers.has(tier.tierNumber)) {
      return fail("DUPLICATE_TIER_NUMBER", `tierNumber bị trùng lặp: ${tier.tierNumber}`);
    }
    seenTierNumbers.add(tier.tierNumber);

    const priceResult = parseDecimal(tier.unitPrice);
    if (!priceResult.success) {
      return fail("INVALID_TIER_PRICE", `unitPrice không hợp lệ ở tier ${tier.tierNumber}: "${tier.unitPrice}"`);
    }
    if (compare(priceResult.data, ZERO) < 0) {
      return fail("INVALID_TIER_PRICE", `unitPrice không được âm ở tier ${tier.tierNumber}.`);
    }

    let threshold: ExactNumber | null = null;
    if (tier.thresholdKwh !== null) {
      const thresholdResult = parseDecimal(tier.thresholdKwh);
      if (!thresholdResult.success) {
        return fail("INVALID_TIER_THRESHOLD", `thresholdKwh không hợp lệ ở tier ${tier.tierNumber}: "${tier.thresholdKwh}"`);
      }
      if (compare(thresholdResult.data, ZERO) <= 0) {
        return fail("INVALID_TIER_THRESHOLD", `thresholdKwh phải lớn hơn 0 ở tier ${tier.tierNumber}.`);
      }
      threshold = thresholdResult.data;
    }

    parsed.push({ tierNumber: tier.tierNumber, thresholdKwh: threshold, unitPrice: priceResult.data });
  }

  parsed.sort((a, b) => a.tierNumber - b.tierNumber);

  const unlimitedTierCount = parsed.filter((tier) => tier.thresholdKwh === null).length;
  if (unlimitedTierCount === 0) {
    return fail("NO_UNLIMITED_TIER", "Cấu hình bậc giá điện phải có đúng một bậc không giới hạn (thresholdKwh = null).");
  }
  if (unlimitedTierCount > 1) {
    return fail(
      "MULTIPLE_UNLIMITED_TIERS",
      `Cấu hình bậc giá điện có ${unlimitedTierCount} bậc không giới hạn; chỉ được phép đúng một.`
    );
  }

  const lastTier = parsed[parsed.length - 1];
  if (lastTier.thresholdKwh !== null) {
    return fail(
      "UNLIMITED_TIER_NOT_LAST",
      "Bậc không giới hạn (thresholdKwh = null) phải là bậc cuối cùng sau khi sắp xếp theo tierNumber."
    );
  }

  return ok(parsed);
}
