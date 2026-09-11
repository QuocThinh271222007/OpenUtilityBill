// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresInvoiceRepository, __testing } from "../postgres/postgres-invoice.repository";
import type { DatabaseExecutor } from "../../database/database.types";

test("mapInvoiceRow: ánh xạ đúng, actualChargedAmount NULL giữ nguyên null", () => {
  const row = {
    id: "1",
    room_id: "1",
    billing_period: new Date("2026-09-01T00:00:00.000Z"),
    tenant_count_used: 4,
    electricity_tariff_id: "1",
    water_tariff_id: "1",
    electricity_billing_method: "QUOTA_TIERED" as const,
    water_billing_method: "PER_PERSON" as const,
    electricity_reading_id: "10",
    water_reading_id: null,
    calculated_total: "269244",
    actual_charged_amount: null,
    created_at: new Date("2026-09-05T00:00:00.000Z"),
  };
  const invoice = __testing.mapInvoiceRow(row);
  assert.equal(invoice.calculatedTotal, "269244");
  assert.equal(invoice.actualChargedAmount, null);
  assert.equal(invoice.waterReadingId, null);
  assert.equal(typeof invoice.id, "string");
});

function createEmptyResultExecutor(): DatabaseExecutor {
  const fn = async () => [];
  return fn as unknown as DatabaseExecutor;
}

test("findByRoomAndPeriod: không có invoice -> Result THÀNH CÔNG với data = null (không phải lỗi)", async () => {
  const repository = new PostgresInvoiceRepository(createEmptyResultExecutor());
  const result = await repository.findByRoomAndPeriod("1", new Date("2026-09-01"));
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, null);
  }
});

function createThrowingExecutor(errorToThrow: Error): DatabaseExecutor {
  const fn = async () => {
    throw errorToThrow;
  };
  return fn as unknown as DatabaseExecutor;
}

test("findByRoomAndPeriod: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresInvoiceRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.findByRoomAndPeriod("1", new Date("2026-09-01"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DATABASE_READ_FAILED");
  }
});
