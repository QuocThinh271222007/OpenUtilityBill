// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { Room } from "../modules/room/room.model";

/**
 * Responsibility:
 * Hợp đồng (interface) cho việc đọc dữ liệu `Room` — ranh giới persistence
 * mà Service layer (tương lai) phụ thuộc vào, KHÔNG phụ thuộc trực tiếp
 * vào Postgres.js hay bất kỳ implementation cụ thể nào.
 *
 * Does NOT:
 * - chứa SQL — implementation cụ thể (Postgres.js) nằm ở
 *   `postgres/postgres-room.repository.ts`.
 * - implement CRUD đầy đủ. Chỉ có đúng thao tác cần cho công việc hiện
 *   tại (`findById`) — xem docs/DATABASE_ACCESS.md mục "Repository
 *   contracts".
 *
 * Failure conditions (xem implementation cụ thể):
 * - `ROOM_NOT_FOUND` khi không có room nào khớp id.
 * - `DATABASE_READ_FAILED` khi bản thân câu query thất bại.
 *
 * Why this module is separate:
 * Interface tách khỏi implementation để Service layer (và test của nó)
 * có thể phụ thuộc vào hợp đồng này mà không cần một PostgreSQL thật —
 * một implementation giả (fake) có thể thay thế
 * `PostgresRoomRepository` trong test mà không đổi bất kỳ code gọi nào.
 */
export interface RoomRepository {
  findById(id: string): Promise<Result<Room>>;
}
