// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Domain type mô tả một MeterReading — chỉ số công tơ điện hoặc nước
 * của một Room trong một kỳ hoá đơn (billing period) cụ thể.
 *
 * Biểu diễn:
 * Dữ liệu tương ứng với bảng `meter_readings`.
 *
 * Invariants (enforce ở tầng database, xem migration):
 * - Duy nhất một reading cho mỗi (roomId, billingPeriod, utilityType).
 * - `previousReading >= 0`, `currentReading >= 0`.
 * - `meterMaximumValue > 0` khi có giá trị — dùng cho công tơ có thể
 *   "quay vòng" (rollover) khi đạt giá trị tối đa. `MeterReading` chỉ
 *   LƯU các chỉ số thô (previous/current/maximum) cần thiết cho phép
 *   tính đó; phép tính rollover thực tế thuộc về Calculation Core
 *   (`calculateMeterUsage`, xem `backend/src/calculation/meter/`), đã
 *   được cài đặt và dùng bởi `CreateInvoiceService` và
 *   `MeterReadingManagementService`.
 * - Khi `meterMaximumValue` có giá trị: `previousReading <=
 *   meterMaximumValue` VÀ `currentReading <= meterMaximumValue`. Đây
 *   CHỈ là loại bỏ chỉ số vượt quá giá trị tối đa vật lý của công tơ —
 *   KHÔNG phải phép tính rollover (rollover vẫn cho phép `currentReading
 *   < previousReading` một cách hợp lệ; xem docs/DATABASE_DESIGN.md mục
 *   "Meter maximum value").
 * - `billingPeriod` PHẢI là ngày đầu tiên của tháng (ví dụ 2026-09-01),
 *   để một tháng luôn ứng với đúng một giá trị `billingPeriod`, dễ
 *   truy vấn theo tháng (`WHERE billing_period = '2026-09-01'`).
 *
 * Biểu diễn ID:
 * `id`, `roomId` là `string` (BIGINT ở database) — xem
 * ../property/property.model.ts mục "Biểu diễn ID" và
 * docs/DATABASE_ACCESS.md.
 *
 * Biểu diễn số:
 * `previousReading`, `currentReading`, `meterMaximumValue` được khai
 * báo là `string`, không phải `number`, vì các cột tương ứng ở database
 * là PostgreSQL NUMERIC (không phải FLOAT/REAL — xem
 * docs/DATABASE_DESIGN.md mục "`NUMERIC` so với `FLOAT`"). Driver PostgreSQL
 * tiêu chuẩn (pg) trả NUMERIC dưới dạng string để tránh mất độ chính
 * xác khi ép về JS number (IEEE-754 double). Domain model phản ánh đúng
 * biểu diễn này tại ranh giới dữ liệu. Chiến lược tính toán số học
 * (số học phân số chính xác dựa trên `BigInt`) được cài đặt trong
 * Calculation Core — xem docs/DATABASE_DESIGN.md mục "`NUMERIC` của
 * database so với biểu diễn runtime của TypeScript" và
 * docs/NUMERIC_PRECISION.md.
 *
 * Không chịu trách nhiệm:
 * - tính usage (currentReading - previousReading) hay xử lý rollover.
 *   Đó là việc của Calculation Core (`calculateMeterUsage`).
 * - biết gì về tariff hay giá tiền.
 *
 * Lý do tồn tại riêng biệt:
 * Điện và nước có chu kỳ đọc số giống nhau (theo tháng, theo phòng)
 * nhưng là hai loại dữ liệu độc lập. Thay vì tạo hai bảng riêng
 * (electricity_readings, water_readings) hoặc nhồi cả hai loại chỉ số
 * vào một hàng, MeterReading dùng `utilityType` để phân biệt — một
 * model chuẩn hoá (normalized) duy nhất cho cả hai loại tiện ích.
 */
export type UtilityType = "ELECTRICITY" | "WATER";

export interface MeterReading {
  id: string;
  roomId: string;
  billingPeriod: Date;
  utilityType: UtilityType;
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
  createdAt: Date;
}
