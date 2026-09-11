// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { divide, fromBigInt, toDecimalString } from "../shared/exact-number";

/**
 * Responsibility:
 * Tính quotaFactor = tenantCount / peoplePerQuotaUnit — tỉ lệ dùng để
 * điều chỉnh ngưỡng bậc thang điện theo số người ở thực tế của phòng.
 *
 * Input: tenantCount (số nguyên dương), peoplePerQuotaUnit (số nguyên
 * dương, đọc từ cấu hình tariff — KHÔNG hard-code).
 *
 * Output: Result<string> — quotaFactor dạng chuỗi thập phân, KHÔNG làm
 * tròn (ví dụ "0.25", "1.25").
 *
 * Failure conditions:
 * - tenantCount không phải số nguyên dương.
 * - peoplePerQuotaUnit không phải số nguyên dương.
 * - thương số tenantCount/peoplePerQuotaUnit không có biểu diễn thập
 *   phân hữu hạn (xem "Does NOT" bên dưới).
 *
 * Important invariant:
 * quotaFactor KHÔNG được làm tròn ở đây — việc làm tròn chỉ xảy ra một
 * lần duy nhất, ở tổng hoá đơn cuối cùng (xem docs/NUMERIC_PRECISION.md).
 *
 * Does NOT:
 * - áp dụng cho tenantCount = 0. Đề thi không định nghĩa quy tắc tính
 *   quota cho phòng 0 người ở — thay vì tự suy diễn "quotaFactor = 0
 *   nghĩa là không có bậc nào áp dụng" (một quyết định sản phẩm không
 *   có căn cứ trong đề bài), hàm này TỪ CHỐI tường minh bằng
 *   INVALID_TENANT_COUNT. Xem docs/CALCULATION_CORE.md mục "Zero tenant
 *   count".
 * - giả định peoplePerQuotaUnit = 4. Giá trị này luôn đọc từ tham số
 *   đầu vào (electricity_tariffs.people_per_quota_unit trong database),
 *   không xuất hiện như hằng số trong Calculation Core.
 *
 * Why this module is separate:
 * quotaFactor là một khái niệm độc lập, được dùng lại ở bước điều chỉnh
 * ngưỡng bậc thang (allocate-electricity-tiers.ts) — tách riêng để có
 * thể unit-test công thức này mà không cần dựng toàn bộ pipeline tính
 * hoá đơn điện.
 */
export interface QuotaFactorInput {
  tenantCount: number;
  peoplePerQuotaUnit: number;
}

export function calculateQuotaFactor(input: QuotaFactorInput): Result<string> {
  if (!Number.isInteger(input.tenantCount) || input.tenantCount <= 0) {
    return fail(
      "INVALID_TENANT_COUNT",
      `tenantCount phải là số nguyên dương để tính quota điện theo bậc thang (đề thi không định nghĩa quy tắc cho 0 hoặc số âm): ${input.tenantCount}`
    );
  }
  if (!Number.isInteger(input.peoplePerQuotaUnit) || input.peoplePerQuotaUnit <= 0) {
    return fail("INVALID_PEOPLE_PER_QUOTA_UNIT", `peoplePerQuotaUnit phải là số nguyên dương: ${input.peoplePerQuotaUnit}`);
  }

  const divideResult = divide(fromBigInt(BigInt(input.tenantCount)), fromBigInt(BigInt(input.peoplePerQuotaUnit)));
  if (!divideResult.success) {
    // Không thể xảy ra trên thực tế (peoplePerQuotaUnit > 0 đã được
    // kiểm tra ở trên), giữ lại để chuyển tiếp Result một cách tường
    // minh thay vì giả định divide() luôn thành công.
    return divideResult;
  }

  try {
    return ok(toDecimalString(divideResult.data));
  } catch {
    // peoplePerQuotaUnit tạo ra một thương số không có biểu diễn thập
    // phân hữu hạn (ví dụ chia cho 3, 6, 7, ...). Đây là giới hạn được
    // ghi nhận có chủ đích của phiên bản Calculation Core hiện tại —
    // xem shared/exact-number.ts và docs/NUMERIC_PRECISION.md.
    return fail(
      "INVALID_PEOPLE_PER_QUOTA_UNIT",
      `peoplePerQuotaUnit = ${input.peoplePerQuotaUnit} tạo ra quotaFactor không có biểu diễn thập phân hữu hạn (ví dụ chia cho 3, 6, 7). Phiên bản này chỉ hỗ trợ peoplePerQuotaUnit mà thương số kết thúc hữu hạn ở hệ thập phân.`
    );
  }
}
