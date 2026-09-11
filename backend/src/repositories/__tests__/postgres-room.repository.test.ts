// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresRoomRepository, __testing } from "../postgres/postgres-room.repository";
import type { DatabaseExecutor } from "../../database/database.types";

/**
 * Responsibility:
 * Unit test cho row mapping và error semantics của
 * `PostgresRoomRepository` — KHÔNG cần một PostgreSQL thật.
 *
 * Row mapping test gọi thẳng hàm `mapRoomRow` (pure function) với một
 * object giả lập ĐÚNG hình dạng Postgres.js trả về (snake_case, `id`
 * dạng string vì cột là BIGINT — xem docs/DATABASE_ACCESS.md).
 *
 * Error semantics test dùng một `DatabaseExecutor` GIẢ (throw khi được
 * gọi như tagged template) để xác nhận repository dịch lỗi database
 * thành `DATABASE_READ_FAILED` thay vì để lỗi PostgreSQL gốc lọt ra
 * ngoài — không cần kết nối thật để kiểm chứng hành vi CATCH này.
 */

test("mapRoomRow: ánh xạ đúng từ snake_case sang domain model", () => {
  const row = {
    id: "42",
    property_id: "7",
    name: "101",
    tenant_count: 4,
    created_at: new Date("2026-09-01T00:00:00.000Z"),
  };
  const room = __testing.mapRoomRow(row);
  assert.deepEqual(room, {
    id: "42",
    propertyId: "7",
    name: "101",
    tenantCount: 4,
    createdAt: row.created_at,
  });
  // id/propertyId phải là string (BIGINT boundary), không phải number.
  assert.equal(typeof room.id, "string");
  assert.equal(typeof room.propertyId, "string");
});

function createThrowingExecutor(errorToThrow: Error): DatabaseExecutor {
  const thrower = async () => {
    throw errorToThrow;
  };
  return thrower as unknown as DatabaseExecutor;
}

test("PostgresRoomRepository.findById: lỗi database -> DATABASE_READ_FAILED, không lộ lỗi gốc", async () => {
  const originalError = new Error("connection terminated unexpectedly");
  const repository = new PostgresRoomRepository(createThrowingExecutor(originalError));

  const result = await repository.findById("1");

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DATABASE_READ_FAILED");
    // Message không được chứa nội dung lỗi PostgreSQL gốc.
    assert.equal(result.error.message.includes("connection terminated"), false);
  }
});
