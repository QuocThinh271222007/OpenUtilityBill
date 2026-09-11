// SPDX-License-Identifier: MIT

import { ExactNumber, ZERO, compare, min, multiply, subtract } from "../shared/exact-number";
import { ValidatedElectricityTier } from "./validate-electricity-config";

/**
 * Responsibility:
 * Phân bổ (allocate) tổng sản lượng điện tiêu thụ (usage) vào từng bậc
 * giá, theo thứ tự bậc thang, sau khi ngưỡng mỗi bậc đã được điều chỉnh
 * theo quotaFactor.
 *
 * Input: usage (ExactNumber, đã biết không âm), quotaFactor
 * (ExactNumber), tiers ĐÃ ĐƯỢC validate-electricity-config.ts kiểm tra
 * và sắp xếp (đúng một bậc không giới hạn, là bậc cuối).
 *
 * Output: mảng AllocatedTier — chỉ gồm các bậc THỰC SỰ có usage > 0.
 *
 * Important invariant:
 * Dùng VÒNG LẶP (iterative), KHÔNG dùng đệ quy — các bậc giá là một
 * dãy tuyến tính hữu hạn, không phải cấu trúc cây/đồ thị cần đệ quy để
 * duyệt (cùng nguyên tắc với docs/LEARNING_NOTES.md mục "Vì sao chưa
 * dùng đệ quy"). Ngưỡng mỗi bậc bị giới hạn KHÔNG được làm tròn khi
 * nhân với quotaFactor (ví dụ 50 × 1.25 = 62.5, giữ nguyên).
 *
 * Does NOT:
 * - tự validate tiers — hàm này giả định tham số `tiers` đã qua
 *   validate-electricity-config.ts (đây là ranh giới có chủ đích: một
 *   hàm kiểm tra cấu hình, một hàm phân bổ dữ liệu đã biết hợp lệ).
 * - làm tròn quantity hay amount ở bất kỳ bậc nào — phép nhân
 *   quantity × unitPrice giữ nguyên độ chính xác, việc làm tròn chỉ xảy
 *   ra một lần ở tổng hoá đơn cuối cùng.
 *
 * Why this module is separate:
 * Thuật toán phân bổ bậc thang là phần dễ sai nhất của bài toán (ranh
 * giới min/max, dừng đúng lúc, bậc cuối nhận toàn bộ phần còn lại) —
 * tách riêng để có thể unit-test thuật toán này với nhiều usage/quota
 * khác nhau mà không phải dựng lại toàn bộ luồng tính hoá đơn.
 */
export interface AllocatedTier {
  tierNumber: number;
  quantityKwh: ExactNumber;
  unitPrice: ExactNumber;
  amount: ExactNumber;
}

export function allocateElectricityTiers(
  usage: ExactNumber,
  quotaFactor: ExactNumber,
  tiers: ValidatedElectricityTier[]
): AllocatedTier[] {
  const applied: AllocatedTier[] = [];
  let remaining = usage;

  for (const tier of tiers) {
    if (compare(remaining, ZERO) <= 0) {
      break;
    }

    if (tier.thresholdKwh === null) {
      // Bậc không giới hạn (luôn là bậc cuối, đã đảm bảo bởi
      // validate-electricity-config.ts): nhận toàn bộ phần còn lại.
      applied.push({
        tierNumber: tier.tierNumber,
        quantityKwh: remaining,
        unitPrice: tier.unitPrice,
        amount: multiply(remaining, tier.unitPrice),
      });
      remaining = ZERO;
      break;
    }

    const adjustedCapacity = multiply(tier.thresholdKwh, quotaFactor);
    const quantity = min(remaining, adjustedCapacity);

    if (compare(quantity, ZERO) > 0) {
      applied.push({
        tierNumber: tier.tierNumber,
        quantityKwh: quantity,
        unitPrice: tier.unitPrice,
        amount: multiply(quantity, tier.unitPrice),
      });
    }
    remaining = subtract(remaining, quantity);
  }

  return applied;
}
