// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import { isUniqueViolation } from "../../database/unique-violation";
import { isForeignKeyViolation } from "../../database/foreign-key-violation";
import type { DatabaseExecutor } from "../../database/database.types";
import { Room } from "../../modules/room/room.model";
import { NewRoom, RoomRepository, UpdateRoom } from "../room.repository";

/**
 * Trách nhiệm:
 * Implementation Postgres.js của `RoomRepository` — nơi DUY NHẤT trong
 * dự án được phép chứa câu SQL truy vấn bảng `rooms`.
 *
 * Input: `DatabaseExecutor` (client toàn cục HOẶC transaction context —
 * xem `database/database.types.ts`) truyền vào constructor. Repository
 * KHÔNG tự gọi `getDatabaseClient()` bên trong từng method — caller
 * (Service layer tương lai) quyết định dùng executor nào, để có thể
 * tham gia một transaction dùng chung khi cần.
 *
 * Không chịu trách nhiệm:
 * - implement CRUD đầy đủ — chỉ `findById`, thao tác duy nhất có nhu
 *   cầu thực sự ở giai đoạn này.
 * - lộ raw row của Postgres.js ra ngoài — `mapRoomRow` là bước ánh xạ
 *   TƯỜNG MINH, dễ đọc, không dùng thư viện mapping tự động.
 * - dùng `sql.unsafe` hay ghép chuỗi SQL — `id` được tham số hoá qua
 *   `${id}` trong tagged template, Postgres.js tự escape/tham số hoá an
 *   toàn (xem docs/DATABASE_ACCESS.md mục "Query tham số hoá (chống SQL injection)").
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

  async listAll(propertyId?: string): Promise<Result<Room[]>> {
    try {
      const rows =
        propertyId === undefined
          ? await this.sql<RoomRow[]>`
              SELECT id, property_id, name, tenant_count, created_at FROM rooms ORDER BY id ASC
            `
          : await this.sql<RoomRow[]>`
              SELECT id, property_id, name, tenant_count, created_at FROM rooms
              WHERE property_id = ${propertyId}
              ORDER BY id ASC
            `;
      return ok(rows.map(mapRoomRow));
    } catch (error) {
      logDatabaseError("PostgresRoomRepository.listAll", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc danh sách room từ database.");
    }
  }

  /** Failure: `ROOM_ALREADY_EXISTS` khi vi phạm `UNIQUE(property_id, name)` (SQLSTATE 23505). */
  async create(input: NewRoom): Promise<Result<Room>> {
    try {
      const rows = await this.sql<RoomRow[]>`
        INSERT INTO rooms (property_id, name, tenant_count)
        VALUES (${input.propertyId}, ${input.name}, ${input.tenantCount})
        RETURNING id, property_id, name, tenant_count, created_at
      `;
      return ok(mapRoomRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("ROOM_ALREADY_EXISTS", `Room "${input.name}" đã tồn tại trong property ${input.propertyId}.`);
      }
      logDatabaseError("PostgresRoomRepository.create", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu room vào database.");
    }
  }

  /** propertyId KHÔNG BAO GIỜ đổi qua đường này — xem `UpdateRoom` (room.repository.ts). */
  async update(id: string, input: UpdateRoom): Promise<Result<Room>> {
    const hasName = input.name !== undefined;
    const hasTenantCount = input.tenantCount !== undefined;

    try {
      let rows: RoomRow[];
      if (hasName && hasTenantCount) {
        rows = await this.sql<RoomRow[]>`
          UPDATE rooms SET name = ${input.name as string}, tenant_count = ${input.tenantCount as number}
          WHERE id = ${id}
          RETURNING id, property_id, name, tenant_count, created_at
        `;
      } else if (hasName) {
        rows = await this.sql<RoomRow[]>`
          UPDATE rooms SET name = ${input.name as string}
          WHERE id = ${id}
          RETURNING id, property_id, name, tenant_count, created_at
        `;
      } else if (hasTenantCount) {
        rows = await this.sql<RoomRow[]>`
          UPDATE rooms SET tenant_count = ${input.tenantCount as number}
          WHERE id = ${id}
          RETURNING id, property_id, name, tenant_count, created_at
        `;
      } else {
        return fail("VALIDATION_ERROR", "Không có field nào để cập nhật.");
      }

      if (rows.length === 0) {
        return fail("ROOM_NOT_FOUND", `Không tìm thấy room với id = ${id}.`);
      }
      return ok(mapRoomRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("ROOM_ALREADY_EXISTS", `Room "${input.name}" đã tồn tại trong property này.`);
      }
      logDatabaseError("PostgresRoomRepository.update", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể cập nhật dữ liệu room vào database.");
    }
  }

  /**
   * Failure: `ROOM_HAS_DEPENDENCIES` khi vi phạm
   * `meter_readings.room_id`/`invoices.room_id ON DELETE RESTRICT`
   * (SQLSTATE 23503) — vẫn còn ít nhất một meter reading hoặc invoice
   * thuộc room này.
   */
  async deleteById(id: string): Promise<Result<{ id: string }>> {
    try {
      const rows = await this.sql<Array<{ id: string }>>`
        DELETE FROM rooms WHERE id = ${id} RETURNING id
      `;
      if (rows.length === 0) {
        return fail("ROOM_NOT_FOUND", `Không tìm thấy room với id = ${id}.`);
      }
      return ok({ id: rows[0].id });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return fail("ROOM_HAS_DEPENDENCIES", `Room với id = ${id} vẫn còn meter reading hoặc invoice tham chiếu, không thể xoá.`);
      }
      logDatabaseError("PostgresRoomRepository.deleteById", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể xoá dữ liệu room khỏi database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapRoomRow };
