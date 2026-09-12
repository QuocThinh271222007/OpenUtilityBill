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
 * Trách nhiệm:
 * Hợp đồng cho việc đọc/ghi `MeterReading`. `findByRoomPeriodAndUtility`
 * đọc theo khoá tự nhiên của bảng (room, billing_period, utility_type)
 * — khớp `UNIQUE(room_id, billing_period, utility_type)` trong migration
 * 001.
 *
 * Không chịu trách nhiệm: chứa SQL — xem `postgres/postgres-meter-reading.repository.ts`.
 *
 * Điều kiện lỗi:
 * - `findById`/`findByRoomPeriodAndUtility`/`update`/`deleteById`:
 *   `METER_READING_NOT_FOUND` khi không có reading nào khớp.
 * - `create`/`update`: `METER_READING_ALREADY_EXISTS` khi vi phạm
 *   `UNIQUE(room_id, billing_period, utility_type)`.
 * - `deleteById`: `METER_READING_IN_USE` khi vi phạm
 *   `invoices.electricity_reading_id`/`water_reading_id ON DELETE
 *   RESTRICT` (xem migration 001).
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
   * `MeterReadingManagementService` để chặn `update`/`delete` một
   * reading lịch sử đã dùng để tính hoá đơn (xem docs/MANAGEMENT_API.md
   * mục "Bảo vệ tham chiếu lịch sử").
   */
  isReferencedByInvoice(id: string): Promise<Result<boolean>>;

  /** Xoá đúng MỘT meter reading theo id. Trả về `{ id }` của hàng đã xoá. */
  deleteById(id: string): Promise<Result<{ id: string }>>;
}
