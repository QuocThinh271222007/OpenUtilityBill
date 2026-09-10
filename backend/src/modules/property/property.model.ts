// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Domain type mô tả một RentalProperty — một cơ sở cho thuê (ví dụ một
 * dãy trọ, một chung cư mini) mà các Room (phòng) thuộc về.
 *
 * Represents:
 * Dữ liệu tương ứng với bảng `rental_properties` (xem
 * database/migrations/001_initial_domain_schema.sql).
 *
 * Invariants (enforce ở tầng database):
 * - `id` là khóa chính, do PostgreSQL sinh tự động
 *   (BIGINT GENERATED ALWAYS AS IDENTITY).
 * - `name` không được NULL.
 *
 * Does NOT:
 * - chứa thông tin xác thực/chủ sở hữu (authentication, ownership) —
 *   chưa có yêu cầu ở giai đoạn này (xem docs/ARCHITECTURE.md).
 * - chứa danh sách Room trực tiếp (không có field `rooms: Room[]`) —
 *   xem "Why this model exists separately" bên dưới.
 * - có Repository/Service/Controller đi kèm ở task này — đây chỉ là
 *   domain type, chưa có thao tác CRUD thực sự.
 *
 * Why this model exists separately:
 * RentalProperty là gốc của quan hệ 1 → N với Room. Tách riêng để Room
 * tham chiếu tới RentalProperty bằng `propertyId` (khóa ngoại) thay vì
 * lồng object, tránh vòng tham chiếu (Property chứa Room chứa
 * Property...) và giữ mỗi model dễ serialize/dễ suy luận độc lập (xem
 * docs/DOMAIN_MODEL.md mục "No circular dependencies").
 */
export interface RentalProperty {
  id: number;
  name: string;
  address: string | null;
  createdAt: Date;
}
