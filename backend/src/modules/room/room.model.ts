// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Domain type mô tả một Room (phòng trọ) — đơn vị thực sự được tính
 * hoá đơn điện/nước. Mỗi Room thuộc về đúng một RentalProperty.
 *
 * Represents:
 * Dữ liệu tương ứng với bảng `rooms`.
 *
 * Invariants (enforce ở tầng database):
 * - `tenantCount >= 0`.
 * - `tenantCount` là trạng thái HIỆN TẠI (current state) của phòng —
 *   KHÔNG phải giá trị lịch sử dùng để tính một hoá đơn cụ thể.
 * - `name` duy nhất TRONG PHẠM VI một property (UNIQUE(propertyId,
 *   name)) — KHÔNG phải duy nhất toàn hệ thống. Hai property khác nhau
 *   vẫn có thể cùng có một phòng tên "101".
 *
 * Does NOT:
 * - tự đảm bảo hoá đơn cũ không đổi khi `tenantCount` thay đổi sau này.
 *   Việc đó là trách nhiệm của `Invoice.tenantCountUsed` (xem
 *   ../invoice/invoice.model.ts và docs/DATABASE_DESIGN.md mục
 *   "Historical snapshot principle").
 * - biểu diễn thay đổi số người ở giữa tháng (mid-month occupancy
 *   change) — chưa cần ở giai đoạn này.
 * - có Repository/Service/Controller đi kèm ở task này.
 *
 * Why this model exists separately:
 * Room là điểm neo (anchor) mà MeterReading và Invoice tham chiếu tới
 * qua `roomId`. Tách Room khỏi RentalProperty giữ cho mỗi entity chỉ có
 * một trách nhiệm rõ ràng, và cho phép Room được truy vấn/thao tác độc
 * lập với property cha của nó.
 */
export interface Room {
  id: number;
  propertyId: number;
  name: string;
  tenantCount: number;
  createdAt: Date;
}
