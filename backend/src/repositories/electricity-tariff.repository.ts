// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { ElectricityTariff, ElectricityTariffTier } from "../modules/tariff/tariff.model";

/**
 * Một ElectricityTariff cùng các bậc giá của nó, đã sắp xếp theo
 * `tierNumber` tăng dần (ORDER BY tier_number ASC — xem
 * docs/DATABASE_ACCESS.md mục "Electricity tier ordering"). Không dựa
 * vào thứ tự hàng tự nhiên của PostgreSQL.
 */
export interface ElectricityTariffWithTiers {
  tariff: ElectricityTariff;
  tiers: ElectricityTariffTier[];
}

/**
 * Responsibility:
 * Hợp đồng cho việc tìm ElectricityTariff ĐANG CÓ HIỆU LỰC tại một
 * billingPeriod cụ thể, cùng toàn bộ bậc giá của nó.
 *
 * "Đang có hiệu lực" nghĩa là:
 *   effective_from <= billingPeriod
 *   AND (effective_to IS NULL OR effective_to >= billingPeriod)
 *
 * Failure conditions:
 * - `TARIFF_NOT_FOUND` khi không có tariff nào khớp điều kiện hiệu lực.
 * - `AMBIGUOUS_TARIFF_CONFIGURATION` khi CÓ NHIỀU HƠN MỘT tariff cùng
 *   khớp điều kiện hiệu lực cho cùng billingPeriod. Schema hiện tại
 *   KHÔNG ngăn hai tariff khác tên có khoảng effective_from/effective_to
 *   chồng lấn (xem docs/DATABASE_DESIGN.md mục "Tariff versions and
 *   effective dates") — implementation KHÔNG được tự ý chọn đại một
 *   hàng khi gặp tình huống này, mà phải báo lỗi rõ ràng để người quản
 *   trị tariff sửa cấu hình.
 * - `DATABASE_READ_FAILED` khi câu query thất bại.
 *
 * Does NOT: chứa SQL cụ thể (xem
 * `postgres/postgres-electricity-tariff.repository.ts`), hay bất kỳ
 * hằng số biểu giá nào của kỳ thi.
 */
export interface ElectricityTariffRepository {
  findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<ElectricityTariffWithTiers>>;
}
