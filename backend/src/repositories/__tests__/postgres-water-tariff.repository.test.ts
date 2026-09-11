// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWaterTariffRepository, __testing } from "../postgres/postgres-water-tariff.repository";
import type { DatabaseExecutor } from "../../database/database.types";

test("mapWaterTariffRow: ánh xạ đúng, giữ nguyên chuỗi thập phân", () => {
  const row = {
    id: "1",
    name: "Competition Default Water Tariff",
    effective_from: new Date("2026-09-06T00:00:00.000Z"),
    effective_to: null,
    price_per_cubic_meter: "8500",
    price_per_person: "80000",
    vat_rate: "0.05",
    environmental_fee_rate: "0.10",
    created_at: new Date("2026-09-06T00:00:00.000Z"),
  };
  const tariff = __testing.mapWaterTariffRow(row);
  assert.equal(tariff.vatRate, "0.05");
  assert.equal(tariff.environmentalFeeRate, "0.10");
  assert.equal(tariff.effectiveTo, null);
});

function createSequencedExecutor(results: unknown[][]): DatabaseExecutor {
  let call = 0;
  const fn = async () => results[Math.min(call++, results.length - 1)];
  return fn as unknown as DatabaseExecutor;
}

test("findApplicableTariffForPeriod: nhiều hơn một tariff khớp -> AMBIGUOUS_TARIFF_CONFIGURATION", async () => {
  const rows = [
    { id: "1", name: "A", effective_from: new Date(), effective_to: null, price_per_cubic_meter: "8500", price_per_person: "80000", vat_rate: "0.05", environmental_fee_rate: "0.10", created_at: new Date() },
    { id: "2", name: "B", effective_from: new Date(), effective_to: null, price_per_cubic_meter: "9000", price_per_person: "85000", vat_rate: "0.05", environmental_fee_rate: "0.10", created_at: new Date() },
  ];
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([rows]));
  const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-06"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AMBIGUOUS_TARIFF_CONFIGURATION");
  }
});

test("findApplicableTariffForPeriod: không khớp -> TARIFF_NOT_FOUND", async () => {
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([[]]));
  const result = await repository.findApplicableTariffForPeriod(new Date("2020-01-01"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "TARIFF_NOT_FOUND");
  }
});
