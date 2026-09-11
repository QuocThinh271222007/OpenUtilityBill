// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Domain type mô tả một MeterReading — chỉ số công tơ điện hoặc nước
 * của một Room trong một kỳ hoá đơn (billing period) cụ thể.
 *
 * Represents:
 * Dữ liệu tương ứng với bảng `meter_readings`.
 *
 * Invariants (enforce ở tầng database, xem migration):
 * - Duy nhất một reading cho mỗi (roomId, billingPeriod, utilityType).
 * - `previousReading >= 0`, `currentReading >= 0`.
 * - `meterMaximumValue > 0` khi có giá trị — dùng cho công tơ có thể
 *   "quay vòng" (rollover) khi đạt giá trị tối đa. Bản thân phép tính
 *   rollover CHƯA được cài đặt ở task này; schema chỉ giữ chỗ dữ liệu
 *   cần thiết cho Calculation Core sau này.
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
 * ID representation:
 * `id`, `roomId` là `string` (BIGINT ở database) — xem
 * ../property/property.model.ts mục "ID representation" và
 * docs/DATABASE_ACCESS.md.
 *
 * Numeric representation:
 * `previousReading`, `currentReading`, `meterMaximumValue` được khai
 * báo là `string`, không phải `number`, vì các cột tương ứng ở database
 * là PostgreSQL NUMERIC (không phải FLOAT/REAL — xem
 * docs/DATABASE_DESIGN.md mục "NUMERIC vs FLOAT"). Driver PostgreSQL
 * tiêu chuẩn (pg) trả NUMERIC dưới dạng string để tránh mất độ chính
 * xác khi ép về JS number (IEEE-754 double). Domain model phản ánh đúng
 * biểu diễn này tại ranh giới dữ liệu. Chiến lược tính toán số học
 * (parse string, hay dùng thư viện decimal) sẽ được quyết định riêng
 * khi Calculation Core được thiết kế — KHÔNG phải trong task này (xem
 * docs/DATABASE_DESIGN.md mục "Database NUMERIC vs. runtime
 * calculation representation").
 *
 * Does NOT:
 * - tính usage (currentReading - previousReading) hay xử lý rollover.
 *   Đó là việc của Calculation Core (task sau).
 * - biết gì về tariff hay giá tiền.
 * - có Repository/Service/Controller đi kèm ở task này.
 *
 * Why this model exists separately:
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
