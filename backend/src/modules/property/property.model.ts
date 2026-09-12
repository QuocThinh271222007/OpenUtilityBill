// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Domain type mô tả một RentalProperty — một cơ sở cho thuê (ví dụ một
 * dãy trọ, một chung cư mini) mà các Room (phòng) thuộc về.
 *
 * Biểu diễn:
 * Dữ liệu tương ứng với bảng `rental_properties` (xem
 * database/migrations/001_initial_domain_schema.sql).
 *
 * Invariants (enforce ở tầng database):
 * - `id` là khóa chính, do PostgreSQL sinh tự động
 *   (BIGINT GENERATED ALWAYS AS IDENTITY).
 * - `name` không được NULL.
 *
 * Biểu diễn ID:
 * `id` là `string`, không phải `number`. Cột database là BIGINT (int8),
 * và JS `number` không biểu diễn an toàn mọi giá trị BIGINT (giới hạn
 * an toàn là 2^53-1). Driver `postgres` (Postgres.js) trả BIGINT dưới
 * dạng chuỗi mặc định — domain model phản ánh đúng ranh giới đó thay vì
 * ép về `number` và âm thầm giả định ID "chắc sẽ luôn nhỏ" (xem
 * docs/DATABASE_ACCESS.md mục "Ranh giới `BIGINT` / ID").
 *
 * Không chịu trách nhiệm:
 * - chứa thông tin xác thực/chủ sở hữu (authentication, ownership) —
 *   chưa có yêu cầu ở giai đoạn này (xem docs/ARCHITECTURE.md).
 * - chứa danh sách Room trực tiếp (không có field `rooms: Room[]`) —
 *   xem "Lý do tồn tại riêng biệt" bên dưới.
 *
 * Lý do tồn tại riêng biệt:
 * RentalProperty là gốc của quan hệ 1 → N với Room. Tách riêng để Room
 * tham chiếu tới RentalProperty bằng `propertyId` (khóa ngoại) thay vì
 * lồng object, tránh vòng tham chiếu (Property chứa Room chứa
 * Property...) và giữ mỗi model dễ serialize/dễ suy luận độc lập (xem
 * docs/DOMAIN_MODEL.md mục "Không có phụ thuộc vòng tròn").
 */
export interface RentalProperty {
  id: string;
  name: string;
  address: string | null;
  createdAt: Date;
}
