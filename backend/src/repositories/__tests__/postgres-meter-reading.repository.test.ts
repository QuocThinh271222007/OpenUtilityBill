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
