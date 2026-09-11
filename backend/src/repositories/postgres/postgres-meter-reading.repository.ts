// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import { isUniqueViolation } from "../../database/unique-violation";
import type { DatabaseExecutor } from "../../database/database.types";
import { MeterReading, UtilityType } from "../../modules/meter-reading/meter-reading.model";
import { MeterReadingRepository, NewMeterReading, UpdateMeterReading } from "../meter-reading.repository";

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

  async findById(id: string): Promise<Result<MeterReading>> {
    try {
      const rows = await this.sql<MeterReadingRow[]>`
        SELECT id, room_id, billing_period, utility_type,
               previous_reading, current_reading, meter_maximum_value, created_at
        FROM meter_readings
        WHERE id = ${id}
      `;
      if (rows.length === 0) {
        return fail("METER_READING_NOT_FOUND", `Không tìm thấy meter reading với id = ${id}.`);
      }
      return ok(mapMeterReadingRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresMeterReadingRepository.findById", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu meter reading từ database.");
    }
  }

  async listByRoom(roomId: string, billingPeriod?: Date): Promise<Result<MeterReading[]>> {
    try {
      const rows =
        billingPeriod === undefined
          ? await this.sql<MeterReadingRow[]>`
              SELECT id, room_id, billing_period, utility_type,
                     previous_reading, current_reading, meter_maximum_value, created_at
              FROM meter_readings
              WHERE room_id = ${roomId}
              ORDER BY billing_period DESC, utility_type ASC, id ASC
            `
          : await this.sql<MeterReadingRow[]>`
              SELECT id, room_id, billing_period, utility_type,
                     previous_reading, current_reading, meter_maximum_value, created_at
              FROM meter_readings
              WHERE room_id = ${roomId} AND billing_period = ${billingPeriod}
              ORDER BY billing_period DESC, utility_type ASC, id ASC
            `;
      return ok(rows.map(mapMeterReadingRow));
    } catch (error) {
      logDatabaseError("PostgresMeterReadingRepository.listByRoom", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc lịch sử meter reading từ database.");
    }
  }

  /** Failure: `METER_READING_ALREADY_EXISTS` khi vi phạm `UNIQUE(room_id, billing_period, utility_type)` (SQLSTATE 23505). */
  async create(input: NewMeterReading): Promise<Result<MeterReading>> {
    try {
      const rows = await this.sql<MeterReadingRow[]>`
        INSERT INTO meter_readings (
          room_id, billing_period, utility_type, previous_reading, current_reading, meter_maximum_value
        ) VALUES (
          ${input.roomId}, ${input.billingPeriod}, ${input.utilityType},
          ${input.previousReading}, ${input.currentReading}, ${input.meterMaximumValue}
        )
        RETURNING id, room_id, billing_period, utility_type, previous_reading, current_reading, meter_maximum_value, created_at
      `;
      return ok(mapMeterReadingRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail(
          "METER_READING_ALREADY_EXISTS",
          `Meter reading cho room ${input.roomId}, kỳ ${input.billingPeriod.toISOString().slice(0, 10)}, loại ${input.utilityType} đã tồn tại.`
        );
      }
      logDatabaseError("PostgresMeterReadingRepository.create", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu meter reading vào database.");
    }
  }

  /** Full replacement — xem `UpdateMeterReading` (meter-reading.repository.ts) cho lý do. */
  async update(id: string, input: UpdateMeterReading): Promise<Result<MeterReading>> {
    try {
      const rows = await this.sql<MeterReadingRow[]>`
        UPDATE meter_readings SET
          room_id = ${input.roomId},
          billing_period = ${input.billingPeriod},
          utility_type = ${input.utilityType},
          previous_reading = ${input.previousReading},
          current_reading = ${input.currentReading},
          meter_maximum_value = ${input.meterMaximumValue}
        WHERE id = ${id}
        RETURNING id, room_id, billing_period, utility_type, previous_reading, current_reading, meter_maximum_value, created_at
      `;
      if (rows.length === 0) {
        return fail("METER_READING_NOT_FOUND", `Không tìm thấy meter reading với id = ${id}.`);
      }
      return ok(mapMeterReadingRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail(
          "METER_READING_ALREADY_EXISTS",
          `Meter reading cho room ${input.roomId}, kỳ ${input.billingPeriod.toISOString().slice(0, 10)}, loại ${input.utilityType} đã tồn tại.`
        );
      }
      logDatabaseError("PostgresMeterReadingRepository.update", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể cập nhật dữ liệu meter reading vào database.");
    }
  }

  async isReferencedByInvoice(id: string): Promise<Result<boolean>> {
    try {
      const rows = await this.sql`
        SELECT 1 FROM invoices
        WHERE electricity_reading_id = ${id} OR water_reading_id = ${id}
        LIMIT 1
      `;
      return ok(rows.length > 0);
    } catch (error) {
      logDatabaseError("PostgresMeterReadingRepository.isReferencedByInvoice", error);
      return fail("DATABASE_READ_FAILED", "Không thể kiểm tra meter reading có đang được invoice tham chiếu hay không.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapMeterReadingRow };
