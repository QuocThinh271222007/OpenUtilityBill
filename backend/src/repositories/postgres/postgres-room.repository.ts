// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { Room } from "../../modules/room/room.model";
import { RoomRepository } from "../room.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `RoomRepository` — nơi DUY NHẤT trong
 * dự án được phép chứa câu SQL truy vấn bảng `rooms`.
 *
 * Input: `DatabaseExecutor` (client toàn cục HOẶC transaction context —
 * xem `database/database.types.ts`) truyền vào constructor. Repository
 * KHÔNG tự gọi `getDatabaseClient()` bên trong từng method — caller
 * (Service layer tương lai) quyết định dùng executor nào, để có thể
 * tham gia một transaction dùng chung khi cần.
 *
 * Does NOT:
 * - implement CRUD đầy đủ — chỉ `findById`, thao tác duy nhất có nhu
 *   cầu thực sự ở giai đoạn này.
 * - lộ raw row của Postgres.js ra ngoài — `mapRoomRow` là bước ánh xạ
 *   TƯỜNG MINH, dễ đọc, không dùng thư viện mapping tự động.
 * - dùng `sql.unsafe` hay ghép chuỗi SQL — `id` được tham số hoá qua
 *   `${id}` trong tagged template, Postgres.js tự escape/tham số hoá an
 *   toàn (xem docs/DATABASE_ACCESS.md mục "Parameterized queries").
 */
interface RoomRow {
  id: string;
  property_id: string;
  name: string;
  tenant_count: number;
  created_at: Date;
}

function mapRoomRow(row: RoomRow): Room {
  return {
    id: row.id,
    propertyId: row.property_id,
    name: row.name,
    tenantCount: row.tenant_count,
    createdAt: row.created_at,
  };
}

export class PostgresRoomRepository implements RoomRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async findById(id: string): Promise<Result<Room>> {
    try {
      const rows = await this.sql<RoomRow[]>`
        SELECT id, property_id, name, tenant_count, created_at
        FROM rooms
        WHERE id = ${id}
      `;

      if (rows.length === 0) {
        return fail("ROOM_NOT_FOUND", `Không tìm thấy room với id = ${id}.`);
      }

      return ok(mapRoomRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresRoomRepository.findById", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu room từ database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapRoomRow };
