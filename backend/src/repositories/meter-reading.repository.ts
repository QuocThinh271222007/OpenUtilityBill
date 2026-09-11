// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { MeterReading, UtilityType } from "../modules/meter-reading/meter-reading.model";

/**
 * Dữ liệu ĐẦU VÀO để tạo/thay thế một MeterReading — type riêng, cùng
 * lý do với `NewRoom`/`UpdateRoom`.
 *
 * `UpdateMeterReading` là THAY THẾ TOÀN BỘ (full replacement, khớp
 * `PUT /api/v1/meter-readings/:readingId`) — KHÔNG phải PATCH từng
 * field như Room/Property, vì một chỉ số công tơ là MỘT đơn vị dữ liệu
 * hoàn chỉnh (previous/current/max cùng mô tả một lần đọc số, sửa riêng
 * lẻ từng field dễ tạo ra tổ hợp không nhất quán).
 */
export interface NewMeterReading {
  roomId: string;
  billingPeriod: Date;
  utilityType: UtilityType;
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
}

export type UpdateMeterReading = NewMeterReading;

/**
 * Responsibility:
 * Hợp đồng cho việc đọc/ghi `MeterReading`. `findByRoomPeriodAndUtility`
 * đọc theo khoá tự nhiên của bảng (room, billing_period, utility_type)
 * — khớp `UNIQUE(room_id, billing_period, utility_type)` trong migration
 * 001.
 *
 * Does NOT: chứa SQL — xem `postgres/postgres-meter-reading.repository.ts`.
 *
 * Failure conditions:
 * - `findById`/`findByRoomPeriodAndUtility`/`update`:
 *   `METER_READING_NOT_FOUND` khi không có reading nào khớp.
 * - `create`/`update`: `METER_READING_ALREADY_EXISTS` khi vi phạm
 *   `UNIQUE(room_id, billing_period, utility_type)`.
 * - `DATABASE_READ_FAILED`/`DATABASE_WRITE_FAILED` cho lỗi query/ghi
 *   khác.
 */
export interface MeterReadingRepository {
  findById(id: string): Promise<Result<MeterReading>>;

  findByRoomPeriodAndUtility(
    roomId: string,
    billingPeriod: Date,
    utilityType: UtilityType
  ): Promise<Result<MeterReading>>;

  /** `billingPeriod` không cung cấp -> mọi kỳ. `ORDER BY billing_period DESC, utility_type ASC, id ASC`. */
  listByRoom(roomId: string, billingPeriod?: Date): Promise<Result<MeterReading[]>>;

  create(input: NewMeterReading): Promise<Result<MeterReading>>;

  update(id: string, input: UpdateMeterReading): Promise<Result<MeterReading>>;

  /**
   * `true` khi reading này được một invoice tham chiếu (làm
   * `electricity_reading_id` HOẶC `water_reading_id`) — dùng bởi
   * `MeterReadingManagementService` để chặn `update` một reading lịch
   * sử đã dùng để tính hoá đơn (xem docs/MANAGEMENT_API.md mục
   * "Historical protection").
   */
  isReferencedByInvoice(id: string): Promise<Result<boolean>>;
}
