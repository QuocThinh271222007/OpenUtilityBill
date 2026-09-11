// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMeterReadingRepository, __testing } from "../postgres/postgres-meter-reading.repository";
import type { DatabaseExecutor } from "../../database/database.types";

test("mapMeterReadingRow: giữ nguyên chuỗi thập phân cho các trường NUMERIC", () => {
  const row = {
    id: "10",
    room_id: "1",
    billing_period: new Date("2026-09-01T00:00:00.000Z"),
    utility_type: "ELECTRICITY" as const,
    previous_reading: "99850",
    current_reading: "120",
    meter_maximum_value: "99999",
    created_at: new Date("2026-09-05T00:00:00.000Z"),
  };
  const reading = __testing.mapMeterReadingRow(row);
  assert.deepEqual(reading, {
    id: "10",
    roomId: "1",
    billingPeriod: row.billing_period,
    utilityType: "ELECTRICITY",
    previousReading: "99850",
    currentReading: "120",
    meterMaximumValue: "99999",
    createdAt: row.created_at,
  });
  assert.equal(typeof reading.previousReading, "string");
  assert.equal(typeof reading.currentReading, "string");
});

test("mapMeterReadingRow: meterMaximumValue NULL được giữ nguyên là null", () => {
  const row = {
    id: "11",
    room_id: "1",
    billing_period: new Date("2026-09-01T00:00:00.000Z"),
    utility_type: "WATER" as const,
    previous_reading: "0",
    current_reading: "12",
    meter_maximum_value: null,
    created_at: new Date("2026-09-05T00:00:00.000Z"),
  };
  const reading = __testing.mapMeterReadingRow(row);
  assert.equal(reading.meterMaximumValue, null);
});

function createEmptyResultExecutor(): DatabaseExecutor {
  const fn = async () => [];
  return fn as unknown as DatabaseExecutor;
}

test("PostgresMeterReadingRepository.findByRoomPeriodAndUtility: không có hàng nào -> METER_READING_NOT_FOUND", async () => {
  const repository = new PostgresMeterReadingRepository(createEmptyResultExecutor());
  const result = await repository.findByRoomPeriodAndUtility("1", new Date("2026-09-01"), "ELECTRICITY");
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "METER_READING_NOT_FOUND");
  }
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

const SAMPLE_READING_ROW = {
  id: "1",
  room_id: "1",
  billing_period: new Date("2026-09-01T00:00:00.000Z"),
  utility_type: "ELECTRICITY" as const,
  previous_reading: "0",
  current_reading: "120",
  meter_maximum_value: null,
  created_at: new Date("2026-09-05T00:00:00.000Z"),
};

test("findById: không có hàng nào -> METER_READING_NOT_FOUND", async () => {
  const repository = new PostgresMeterReadingRepository(createEmptyResultExecutor());
  const result = await repository.findById("1");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "METER_READING_NOT_FOUND");
});

test("listByRoom: không truyền billingPeriod -> trả về toàn bộ lịch sử", async () => {
  const repository = new PostgresMeterReadingRepository(createRowResultExecutor([SAMPLE_READING_ROW]));
  const result = await repository.listByRoom("1");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("listByRoom: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresMeterReadingRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.listByRoom("1", new Date("2026-09-01"));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});

test("create: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const repository = new PostgresMeterReadingRepository(createRowResultExecutor([SAMPLE_READING_ROW]));
  const result = await repository.create({
    roomId: "1",
    billingPeriod: new Date("2026-09-01"),
    utilityType: "ELECTRICITY",
    previousReading: "0",
    currentReading: "120",
    meterMaximumValue: null,
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.currentReading, "120");
});

test("create: vi phạm UNIQUE(room_id, billing_period, utility_type) -> METER_READING_ALREADY_EXISTS", async () => {
  const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
  const repository = new PostgresMeterReadingRepository(createThrowingExecutor(uniqueViolation));
  const result = await repository.create({
    roomId: "1",
    billingPeriod: new Date("2026-09-01"),
    utilityType: "ELECTRICITY",
    previousReading: "0",
    currentReading: "120",
    meterMaximumValue: null,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "METER_READING_ALREADY_EXISTS");
    assert.equal(result.error.message.includes("constraint"), false);
  }
});

test("create: lỗi ghi khác -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresMeterReadingRepository(createThrowingExecutor(new Error("connection lost")));
  const result = await repository.create({
    roomId: "1",
    billingPeriod: new Date("2026-09-01"),
    utilityType: "ELECTRICITY",
    previousReading: "0",
    currentReading: "120",
    meterMaximumValue: null,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});

test("update: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const repository = new PostgresMeterReadingRepository(createRowResultExecutor([{ ...SAMPLE_READING_ROW, current_reading: "150" }]));
  const result = await repository.update("1", {
    roomId: "1",
    billingPeriod: new Date("2026-09-01"),
    utilityType: "ELECTRICITY",
    previousReading: "0",
    currentReading: "150",
    meterMaximumValue: null,
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.currentReading, "150");
});

test("update: không có hàng nào khớp id -> METER_READING_NOT_FOUND", async () => {
  const repository = new PostgresMeterReadingRepository(createEmptyResultExecutor());
  const result = await repository.update("999", {
    roomId: "1",
    billingPeriod: new Date("2026-09-01"),
    utilityType: "ELECTRICITY",
    previousReading: "0",
    currentReading: "120",
    meterMaximumValue: null,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "METER_READING_NOT_FOUND");
});

test("isReferencedByInvoice: có hàng -> true", async () => {
  const repository = new PostgresMeterReadingRepository(createRowResultExecutor([{ "?column?": 1 }]));
  const result = await repository.isReferencedByInvoice("1");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data, true);
});

test("isReferencedByInvoice: không có hàng -> false", async () => {
  const repository = new PostgresMeterReadingRepository(createEmptyResultExecutor());
  const result = await repository.isReferencedByInvoice("1");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data, false);
});

test("isReferencedByInvoice: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresMeterReadingRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.isReferencedByInvoice("1");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});
