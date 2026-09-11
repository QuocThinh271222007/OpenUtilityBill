// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { ExactNumber, divide, fromBigInt, isFiniteDecimalDenominator, toDecimalString } from "../shared/exact-number";

/**
 * Responsibility:
 * Tính quotaFactor = tenantCount / peoplePerQuotaUnit — tỉ lệ dùng để
 * điều chỉnh ngưỡng bậc thang điện theo số người ở thực tế của phòng.
 *
 * Xuất hai hàm:
 * - `calculateQuotaFactorExact`: trả về `ExactNumber` — dùng NỘI BỘ bởi
 *   các bước tính toán khác trong Calculation Core (ví dụ
 *   calculate-tiered-electricity.ts), để KHÔNG phải đi vòng qua chuỗi
 *   thập phân rồi parse lại chỉ để tiếp tục tính toán (xem "Why no
 *   string round-trip" bên dưới).
 * - `calculateQuotaFactor`: một wrapper mỏng bọc quanh hàm trên, trả về
 *   `string` — dùng ở RANH GIỚI công khai (test độc lập, hoặc một
 *   Service tương lai chỉ cần đọc giá trị quotaFactor để hiển thị).
 *
 * Input: tenantCount (số nguyên dương), peoplePerQuotaUnit (số nguyên
 * dương, đọc từ cấu hình tariff — KHÔNG hard-code).
 *
 * Output: quotaFactor, KHÔNG làm tròn (ví dụ "0.25", "1.25").
 *
 * Failure conditions:
 * - tenantCount không phải số nguyên dương.
 * - peoplePerQuotaUnit không phải số nguyên dương.
 * - peoplePerQuotaUnit không đảm bảo thương số hữu hạn ở hệ thập phân
 *   với MỌI tenantCount (xem "Chiến lược cho quota không hữu hạn" bên
 *   dưới).
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
 * Chiến lược cho quota không hữu hạn (1/3-style):
 * Cột database `people_per_quota_unit` chỉ ràng buộc `> 0` — về lý
 * thuyết chấp nhận 3, 6, 7, ... Nhưng nếu peoplePerQuotaUnit không CHỈ
 * có ước nguyên tố 2 và/hoặc 5, quotaFactor (và do đó cả quantityKwh
 * của một hay nhiều bậc điện) có thể trở thành số thập phân TUẦN HOÀN
 * VÔ HẠN — không có chuỗi thập phân hữu hạn nào biểu diễn ĐÚNG giá trị
 * đó để trả ra ngoài (xem shared/exact-number.ts).
 *
 * Đề thi hiện tại chỉ dùng peoplePerQuotaUnit = 4 — không có căn cứ nào
 * trong đặc tả yêu cầu hỗ trợ giá trị tạo ra thương số vô hạn. Vì vậy dự
 * án CHỌN Chiến lược B (trong hai chiến lược đã cân nhắc):
 *
 *   Chiến lược A (lan truyền ExactNumber chính xác xuyên suốt, định
 *   nghĩa một biểu diễn JSON-safe cho số vô hạn tuần hoàn — ví dụ
 *   "numerator/denominator") — bị loại vì nó không chỉ ảnh hưởng
 *   quotaFactor: MỌI giá trị hạ nguồn phụ thuộc quotaFactor (quantityKwh
 *   từng bậc, có thể cả subtotal/VAT) cũng có thể trở thành vô hạn tuần
 *   hoàn, nghĩa là toàn bộ hợp đồng "mọi giá trị công khai là chuỗi
 *   thập phân" của Calculation Core (docs/NUMERIC_PRECISION.md) sẽ cần
 *   thiết kế lại thành một định dạng phân số cho MỌI field, không riêng
 *   quotaFactor — một thay đổi kiến trúc lớn hơn nhiều so với phạm vi
 *   một corrective, và không mang lại lợi ích nào cho cấu hình thực tế
 *   của kỳ thi (peoplePerQuotaUnit = 4, luôn hữu hạn).
 *
 *   Chiến lược B (đã chọn): định nghĩa tường minh "peoplePerQuotaUnit
 *   hợp lệ cho tính hoá đơn = giá trị mà MỌI tenantCount đều cho
 *   thương số hữu hạn", tức peoplePerQuotaUnit chỉ có ước nguyên tố 2
 *   và/hoặc 5 (1, 2, 4, 5, 8, 10, 16, 20, 25, ...) — kiểm tra bằng
 *   `isFiniteDecimalDenominator`, TRƯỚC khi thực hiện phép chia, không
 *   phụ thuộc tenantCount cụ thể là bao nhiêu.
 *
 * Vì sao kiểm tra KHÔNG phụ thuộc tenantCount (khác phiên bản cũ):
 * Trước đây, hàm chỉ thử chia rồi bắt lỗi NẾU thương số cụ thể không
 * hữu hạn — nghĩa là peoplePerQuotaUnit = 3 có thể "tình cờ" thành công
 * khi tenantCount là bội số của 3 (ví dụ 3/3 = 1) nhưng thất bại với
 * tenantCount khác (ví dụ 1/3). Cùng MỘT cấu hình tariff, áp dụng cho
 * các phòng khác nhau, sẽ thành công/thất bại KHÔNG NHẤT QUÁN — rất khó
 * giải thích cho người quản trị cấu hình tariff. Kiểm tra tường minh
 * trên peoplePerQuotaUnit — độc lập với tenantCount — cho hành vi NHẤT
 * QUÁN: một cấu hình hợp lệ hoặc luôn hợp lệ, hoặc luôn bị từ chối.
 *
 * Why no string round-trip:
 * `calculateTieredElectricity` gọi `calculateQuotaFactorExact` trực
 * tiếp để lấy `ExactNumber`, dùng ngay cho phép nhân với ngưỡng bậc —
 * KHÔNG gọi `calculateQuotaFactor` (bản trả `string`) rồi `parseDecimal`
 * lại. `string` chỉ dành cho ranh giới module/API/database, không dành
 * cho giao tiếp GIỮA các bước tính toán chặt chẽ với nhau bên trong
 * cùng một pipeline — round-trip đó không sai, nhưng thừa và không cần
 * thiết.
 */
export interface QuotaFactorInput {
  tenantCount: number;
  peoplePerQuotaUnit: number;
}

export function calculateQuotaFactorExact(input: QuotaFactorInput): Result<ExactNumber> {
  if (!Number.isInteger(input.tenantCount) || input.tenantCount <= 0) {
    return fail(
      "INVALID_TENANT_COUNT",
      `tenantCount phải là số nguyên dương để tính quota điện theo bậc thang (đề thi không định nghĩa quy tắc cho 0 hoặc số âm): ${input.tenantCount}`
    );
  }
  if (!Number.isInteger(input.peoplePerQuotaUnit) || input.peoplePerQuotaUnit <= 0) {
    return fail("INVALID_PEOPLE_PER_QUOTA_UNIT", `peoplePerQuotaUnit phải là số nguyên dương: ${input.peoplePerQuotaUnit}`);
  }
  if (!isFiniteDecimalDenominator(BigInt(input.peoplePerQuotaUnit))) {
    return fail(
      "INVALID_PEOPLE_PER_QUOTA_UNIT",
      `peoplePerQuotaUnit = ${input.peoplePerQuotaUnit} không đảm bảo tạo ra quotaFactor hữu hạn ở hệ thập phân với mọi tenantCount (chỉ hỗ trợ giá trị mà ước nguyên tố chỉ gồm 2 và/hoặc 5, ví dụ 1, 2, 4, 5, 8, 10, 16, 20, 25, ...).`
    );
  }

  // Phép chia này luôn thành công và luôn hữu hạn theo cách xây dựng ở
  // trên (peoplePerQuotaUnit > 0 đã được kiểm tra, và đã qua
  // isFiniteDecimalDenominator) — giữ kiểm tra divideResult.success để
  // không âm thầm giả định divide() luôn thành công.
  const divideResult = divide(fromBigInt(BigInt(input.tenantCount)), fromBigInt(BigInt(input.peoplePerQuotaUnit)));
  if (!divideResult.success) {
    return divideResult;
  }
  return ok(divideResult.data);
}

export function calculateQuotaFactor(input: QuotaFactorInput): Result<string> {
  const exactResult = calculateQuotaFactorExact(input);
  if (!exactResult.success) {
    return exactResult;
  }
  return ok(toDecimalString(exactResult.data));
}
