// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { MeterReading, UtilityType } from "../../modules/meter-reading/meter-reading.model";
import { MeterReadingRepository } from "../meter-reading.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `MeterReadingRepository` — nơi DUY
 * NHẤT chứa SQL truy vấn bảng `meter_readings`.
 *
 * Does NOT:
 * - ép `previous_reading`/`current_reading`/`meter_maximum_value` về
 *   `number`. Cột database là NUMERIC — giữ nguyên `string` xuyên suốt,
 *   đúng hợp đồng của `MeterReading` domain model (xem
 *   docs/DATABASE_ACCESS.md mục "NUMERIC precision boundary").
 * - dùng `sql.unsafe` — mọi tham số được truyền qua `${...}`.
 */
interface MeterReadingRow {
  id: string;
  room_id: string;
  billing_period: Date;
  utility_type: UtilityType;
  previous_reading: string;
  current_reading: string;
  meter_maximum_value: string | null;
  created_at: Date;
}

function mapMeterReadingRow(row: MeterReadingRow): MeterReading {
  return {
    id: row.id,
    roomId: row.room_id,
    billingPeriod: row.billing_period,
    utilityType: row.utility_type,
    previousReading: row.previous_reading,
    currentReading: row.current_reading,
    meterMaximumValue: row.meter_maximum_value,
    createdAt: row.created_at,
  };
}

export class PostgresMeterReadingRepository implements MeterReadingRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async findByRoomPeriodAndUtility(
    roomId: string,
    billingPeriod: Date,
    utilityType: UtilityType
  ): Promise<Result<MeterReading>> {
    try {
      const rows = await this.sql<MeterReadingRow[]>`
        SELECT id, room_id, billing_period, utility_type,
               previous_reading, current_reading, meter_maximum_value, created_at
        FROM meter_readings
        WHERE room_id = ${roomId}
          AND billing_period = ${billingPeriod}
          AND utility_type = ${utilityType}
      `;

      if (rows.length === 0) {
        return fail(
          "METER_READING_NOT_FOUND",
          `Không tìm thấy meter reading cho room ${roomId}, kỳ ${billingPeriod.toISOString().slice(0, 10)}, loại ${utilityType}.`
        );
      }

      return ok(mapMeterReadingRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresMeterReadingRepository.findByRoomPeriodAndUtility", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu meter reading từ database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapMeterReadingRow };
