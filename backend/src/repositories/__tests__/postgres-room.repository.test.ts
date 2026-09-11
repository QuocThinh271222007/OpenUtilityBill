// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresRoomRepository, __testing } from "../postgres/postgres-room.repository";
import type { DatabaseExecutor } from "../../database/database.types";

/**
 * Trách nhiệm:
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

function createRowResultExecutor(rows: unknown[]): DatabaseExecutor {
  const fn = async () => rows;
  return fn as unknown as DatabaseExecutor;
}

const SAMPLE_ROOM_ROW = {
  id: "1",
  property_id: "10",
  name: "101",
  tenant_count: 4,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
};

test("listAll: không truyền propertyId -> trả về tất cả", async () => {
  const repository = new PostgresRoomRepository(createRowResultExecutor([SAMPLE_ROOM_ROW]));
  const result = await repository.listAll();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("listAll: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresRoomRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.listAll("10");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});

test("create: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const repository = new PostgresRoomRepository(createRowResultExecutor([SAMPLE_ROOM_ROW]));
  const result = await repository.create({ propertyId: "10", name: "101", tenantCount: 4 });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.propertyId, "10");
});

test("create: vi phạm UNIQUE(property_id, name) (SQLSTATE 23505) -> ROOM_ALREADY_EXISTS", async () => {
  const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
  const repository = new PostgresRoomRepository(createThrowingExecutor(uniqueViolation));
  const result = await repository.create({ propertyId: "10", name: "101", tenantCount: 4 });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "ROOM_ALREADY_EXISTS");
    assert.equal(result.error.message.includes("constraint"), false);
  }
});

test("create: lỗi ghi khác -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresRoomRepository(createThrowingExecutor(new Error("connection lost")));
  const result = await repository.create({ propertyId: "10", name: "101", tenantCount: 4 });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});

test("update: cả hai field -> thành công", async () => {
  const repository = new PostgresRoomRepository(createRowResultExecutor([{ ...SAMPLE_ROOM_ROW, name: "102", tenant_count: 5 }]));
  const result = await repository.update("1", { name: "102", tenantCount: 5 });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "102");
    assert.equal(result.data.tenantCount, 5);
  }
});

test("update: chỉ tenantCount -> thành công", async () => {
  const repository = new PostgresRoomRepository(createRowResultExecutor([{ ...SAMPLE_ROOM_ROW, tenant_count: 6 }]));
  const result = await repository.update("1", { tenantCount: 6 });
  assert.equal(result.success, true);
});

test("update: không có hàng nào khớp id -> ROOM_NOT_FOUND", async () => {
  const repository = new PostgresRoomRepository(createRowResultExecutor([]));
  const result = await repository.update("999", { name: "X" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "ROOM_NOT_FOUND");
});

test("update: vi phạm UNIQUE khi đổi tên trùng -> ROOM_ALREADY_EXISTS", async () => {
  const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
  const repository = new PostgresRoomRepository(createThrowingExecutor(uniqueViolation));
  const result = await repository.update("1", { name: "trùng" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "ROOM_ALREADY_EXISTS");
});
