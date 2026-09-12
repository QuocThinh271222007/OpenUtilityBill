// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { Room } from "../modules/room/room.model";

/**
 * Dữ liệu ĐẦU VÀO để tạo/sửa một Room — type riêng, cùng lý do với
 * `NewRentalProperty`/`UpdateRentalProperty` (`property.repository.ts`).
 *
 * `UpdateRoom` CỐ Ý không có `propertyId` — di chuyển room giữa các
 * property mang ý nghĩa lịch sử không cần thiết cho phạm vi hiện tại
 * (xem docs/MANAGEMENT_API.md mục "PATCH /api/v1/rooms/:roomId" —
 * propertyId không đổi được trên PATCH).
 */
export interface NewRoom {
  propertyId: string;
  name: string;
  tenantCount: number;
}

export interface UpdateRoom {
  name?: string;
  tenantCount?: number;
}

/**
 * Trách nhiệm:
 * Hợp đồng (interface) cho việc đọc/ghi dữ liệu `Room` — ranh giới
 * persistence mà Service layer phụ thuộc vào, KHÔNG phụ thuộc trực tiếp
 * vào Postgres.js hay bất kỳ implementation cụ thể nào.
 *
 * Không chịu trách nhiệm:
 * - chứa SQL — implementation cụ thể (Postgres.js) nằm ở
 *   `postgres/postgres-room.repository.ts`.
 *
 * Failure conditions (xem implementation cụ thể):
 * - `findById`/`update`/`deleteById`: `ROOM_NOT_FOUND` khi không có
 *   room nào khớp id.
 * - `create`/`update`: `ROOM_ALREADY_EXISTS` khi vi phạm
 *   `UNIQUE(property_id, name)`.
 * - `deleteById`: `ROOM_HAS_DEPENDENCIES` khi vẫn còn MeterReading
 *   hoặc Invoice tham chiếu room này (`meter_readings.room_id`/
 *   `invoices.room_id ON DELETE RESTRICT`, xem migration 001) —
 *   PostgreSQL là nguồn thẩm quyền cuối cùng.
 * - `DATABASE_READ_FAILED`/`DATABASE_WRITE_FAILED` cho lỗi query/ghi
 *   khác.
 *
 * Lý do tồn tại:
 * Interface tách khỏi implementation để Service layer (và test của nó)
 * có thể phụ thuộc vào hợp đồng này mà không cần một PostgreSQL thật —
 * một implementation giả (fake) có thể thay thế
 * `PostgresRoomRepository` trong test mà không đổi bất kỳ code gọi nào.
 */
export interface RoomRepository {
  findById(id: string): Promise<Result<Room>>;
  /** `propertyId` không cung cấp -> mọi room. `ORDER BY id ASC` — thứ tự xác định. */
  listAll(propertyId?: string): Promise<Result<Room[]>>;
  create(input: NewRoom): Promise<Result<Room>>;
  update(id: string, input: UpdateRoom): Promise<Result<Room>>;
  /** Xoá đúng MỘT room theo id — KHÔNG cascade xoá meter reading/invoice. Trả về `{ id }` của hàng đã xoá. */
  deleteById(id: string): Promise<Result<{ id: string }>>;
}
