// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { RentalProperty } from "../../modules/property/property.model";
import { NewRentalProperty, PropertyRepository, UpdateRentalProperty } from "../property.repository";

/**
 * Trách nhiệm:
 * Implementation Postgres.js của `PropertyRepository` — nơi DUY NHẤT
 * chứa SQL truy vấn/ghi bảng `rental_properties`.
 *
 * Không chịu trách nhiệm:
 * - dùng `sql.unsafe` hay ghép chuỗi SQL — mọi giá trị tham số hoá qua
 *   `${...}`.
 * - dùng một câu `UPDATE` động ghép tên cột từ input — `update()` dùng
 *   BA nhánh SQL TĨNH cố định (name-only, address-only, cả hai) tuỳ
 *   field nào có mặt trong `UpdateRentalProperty`, không dựng câu SQL
 *   từ danh sách cột do người dùng chọn (xem docs/MANAGEMENT_API.md mục
 *   "No arbitrary dynamic table/column names").
 */
interface RentalPropertyRow {
  id: string;
  name: string;
  address: string | null;
  created_at: Date;
}

function mapPropertyRow(row: RentalPropertyRow): RentalProperty {
  return { id: row.id, name: row.name, address: row.address, createdAt: row.created_at };
}

export class PostgresPropertyRepository implements PropertyRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async listAll(): Promise<Result<RentalProperty[]>> {
    try {
      const rows = await this.sql<RentalPropertyRow[]>`
        SELECT id, name, address, created_at FROM rental_properties ORDER BY id ASC
      `;
      return ok(rows.map(mapPropertyRow));
    } catch (error) {
      logDatabaseError("PostgresPropertyRepository.listAll", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc danh sách rental property từ database.");
    }
  }

  async findById(id: string): Promise<Result<RentalProperty>> {
    try {
      const rows = await this.sql<RentalPropertyRow[]>`
        SELECT id, name, address, created_at FROM rental_properties WHERE id = ${id}
      `;
      if (rows.length === 0) {
        return fail("PROPERTY_NOT_FOUND", `Không tìm thấy rental property với id = ${id}.`);
      }
      return ok(mapPropertyRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresPropertyRepository.findById", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu rental property từ database.");
    }
  }

  async create(input: NewRentalProperty): Promise<Result<RentalProperty>> {
    try {
      const rows = await this.sql<RentalPropertyRow[]>`
        INSERT INTO rental_properties (name, address)
        VALUES (${input.name}, ${input.address})
        RETURNING id, name, address, created_at
      `;
      return ok(mapPropertyRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresPropertyRepository.create", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu rental property vào database.");
    }
  }

  async update(id: string, input: UpdateRentalProperty): Promise<Result<RentalProperty>> {
    const hasName = input.name !== undefined;
    const hasAddress = input.address !== undefined;

    try {
      let rows: RentalPropertyRow[];
      if (hasName && hasAddress) {
        rows = await this.sql<RentalPropertyRow[]>`
          UPDATE rental_properties SET name = ${input.name as string}, address = ${input.address as string | null}
          WHERE id = ${id}
          RETURNING id, name, address, created_at
        `;
      } else if (hasName) {
        rows = await this.sql<RentalPropertyRow[]>`
          UPDATE rental_properties SET name = ${input.name as string}
          WHERE id = ${id}
          RETURNING id, name, address, created_at
        `;
      } else if (hasAddress) {
        rows = await this.sql<RentalPropertyRow[]>`
          UPDATE rental_properties SET address = ${input.address as string | null}
          WHERE id = ${id}
          RETURNING id, name, address, created_at
        `;
      } else {
        // Service luôn validate "ít nhất một field" trước khi gọi tới
        // đây (xem property-management.service.ts) — nhánh này chỉ là
        // phòng thủ, không nên xảy ra trong thực tế.
        return fail("VALIDATION_ERROR", "Không có field nào để cập nhật.");
      }

      if (rows.length === 0) {
        return fail("PROPERTY_NOT_FOUND", `Không tìm thấy rental property với id = ${id}.`);
      }
      return ok(mapPropertyRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresPropertyRepository.update", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể cập nhật dữ liệu rental property vào database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapPropertyRow };
