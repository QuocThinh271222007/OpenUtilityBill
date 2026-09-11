// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { MeterReading, UtilityType } from "../modules/meter-reading/meter-reading.model";

/**
 * Responsibility:
 * Hợp đồng cho việc đọc `MeterReading` theo đúng khoá tự nhiên của bảng
 * (room, billing_period, utility_type) — khớp với
 * `UNIQUE(room_id, billing_period, utility_type)` trong migration 001.
 *
 * Does NOT: chứa SQL, implement CRUD đầy đủ — xem
 * `postgres/postgres-meter-reading.repository.ts`.
 *
 * Failure conditions:
 * - `METER_READING_NOT_FOUND` khi không có reading nào khớp.
 * - `DATABASE_READ_FAILED` khi câu query thất bại.
 */
export interface MeterReadingRepository {
  findByRoomPeriodAndUtility(
    roomId: string,
    billingPeriod: Date,
    utilityType: UtilityType
  ): Promise<Result<MeterReading>>;
}
