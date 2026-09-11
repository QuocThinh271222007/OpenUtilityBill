// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { WaterTariff } from "../modules/tariff/tariff.model";

/**
 * Responsibility:
 * Hợp đồng cho việc tìm WaterTariff đang có hiệu lực tại một
 * billingPeriod — cùng điều kiện hiệu lực và cùng lý do cần
 * `AMBIGUOUS_TARIFF_CONFIGURATION` như
 * `electricity-tariff.repository.ts` (xem file đó để biết chi tiết,
 * không lặp lại ở đây).
 *
 * Failure conditions:
 * - `TARIFF_NOT_FOUND`
 * - `AMBIGUOUS_TARIFF_CONFIGURATION`
 * - `DATABASE_READ_FAILED`
 */
export interface WaterTariffRepository {
  findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<WaterTariff>>;
}
