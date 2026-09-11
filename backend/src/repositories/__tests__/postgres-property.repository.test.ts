// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPropertyRepository, __testing } from "../postgres/postgres-property.repository";
import type { DatabaseExecutor } from "../../database/database.types";

test("mapPropertyRow: ánh xạ đúng, address NULL giữ nguyên null", () => {
  const row = { id: "1", name: "Khu trọ A", address: null, created_at: new Date("2026-01-01T00:00:00.000Z") };
  const property = __testing.mapPropertyRow(row);
  assert.deepEqual(property, { id: "1", name: "Khu trọ A", address: null, createdAt: row.created_at });
});

function createRowResultExecutor(rows: unknown[]): DatabaseExecutor {
  const fn = async () => rows;
  return fn as unknown as DatabaseExecutor;
}

function createThrowingExecutor(error: Error): DatabaseExecutor {
  const fn = async () => {
    throw error;
  };
  return fn as unknown as DatabaseExecutor;
}

test("listAll: trả về danh sách đã ánh xạ", async () => {
  const rows = [
    { id: "1", name: "A", address: null, created_at: new Date("2026-01-01T00:00:00.000Z") },
    { id: "2", name: "B", address: "123 Đường X", created_at: new Date("2026-01-02T00:00:00.000Z") },
  ];
  const repository = new PostgresPropertyRepository(createRowResultExecutor(rows));
  const result = await repository.listAll();
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 2);
    assert.equal(result.data[1].address, "123 Đường X");
  }
});

test("listAll: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresPropertyRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.listAll();
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});

test("findById: không có hàng nào -> PROPERTY_NOT_FOUND", async () => {
  const repository = new PostgresPropertyRepository(createRowResultExecutor([]));
  const result = await repository.findById("1");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "PROPERTY_NOT_FOUND");
});

test("create: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const row = { id: "5", name: "Khu trọ mới", address: null, created_at: new Date("2026-01-05T00:00:00.000Z") };
  const repository = new PostgresPropertyRepository(createRowResultExecutor([row]));
  const result = await repository.create({ name: "Khu trọ mới", address: null });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.id, "5");
});

test("create: lỗi ghi -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresPropertyRepository(createThrowingExecutor(new Error("write failed")));
  const result = await repository.create({ name: "X", address: null });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});

test("update: cả hai field -> thành công", async () => {
  const row = { id: "1", name: "Đã sửa", address: "Địa chỉ mới", created_at: new Date("2026-01-01T00:00:00.000Z") };
  const repository = new PostgresPropertyRepository(createRowResultExecutor([row]));
  const result = await repository.update("1", { name: "Đã sửa", address: "Địa chỉ mới" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Đã sửa");
    assert.equal(result.data.address, "Địa chỉ mới");
  }
});

test("update: chỉ name -> thành công", async () => {
  const row = { id: "1", name: "Chỉ đổi tên", address: null, created_at: new Date("2026-01-01T00:00:00.000Z") };
  const repository = new PostgresPropertyRepository(createRowResultExecutor([row]));
  const result = await repository.update("1", { name: "Chỉ đổi tên" });
  assert.equal(result.success, true);
});

test("update: chỉ address (đổi thành null) -> thành công", async () => {
  const row = { id: "1", name: "Không đổi", address: null, created_at: new Date("2026-01-01T00:00:00.000Z") };
  const repository = new PostgresPropertyRepository(createRowResultExecutor([row]));
  const result = await repository.update("1", { address: null });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.address, null);
});

test("update: không có hàng nào khớp id -> PROPERTY_NOT_FOUND", async () => {
  const repository = new PostgresPropertyRepository(createRowResultExecutor([]));
  const result = await repository.update("999", { name: "X" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "PROPERTY_NOT_FOUND");
});

test("update: lỗi ghi -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresPropertyRepository(createThrowingExecutor(new Error("write failed")));
  const result = await repository.update("1", { name: "X" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});
